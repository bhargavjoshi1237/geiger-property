import { emptyResult, projectError } from "@/lib/jobs/contract";
import { effectivePolicies } from "@/lib/policies";
import { getProjectSetting } from "@/lib/messaging/context";
import { loadServerSources } from "@/lib/reports/sources_server";
import { resolveParams } from "@/lib/metrics/helpers";
import { raiseReview, resolveRaised } from "@/lib/orchestration/review";
import { MODULES_SETTING_KEY } from "@/lib/modules";
import { DETECTORS, activeDetectors, detectorSources } from "./detectors";
import { SIGNAL_SETTINGS_KEY, resolveSignalConfig, scoreOf } from "./config";
import { LIVE_SIGNAL_STATUSES, ROLE_AREA_PRESETS } from "./constants";

// Signals engine (ORCH-06, server-only, admin client). Per project: run every enabled detector over
// the report sources, upsert each finding by (project, dedupe_key) — bumping last_seen_at, keeping
// status, and recording when impact grew (previous_impact_amount / worsened_at) — then resolve live
// signals the detectors no longer find, and expire signals whose detector stopped running. Idempotent:
// re-running on unchanged data rewrites the same rows. Repeat workflow failures also raise a review
// decision (kind decision, dedupe signal:<id>) that resolves with the signal.

const DAY = 86400000;
const URGENCY_RANK = { routine: 0, soon: 1, urgent: 2 };

// Roles that see an area by default (informational; reads filter by the viewer's role at runtime).
const audienceFor = (area) => Object.entries(ROLE_AREA_PRESETS).filter(([, areas]) => areas.includes(area)).map(([role]) => role);

async function signalProjects(admin) {
  const { data, error } = await admin.from("properties").select("project_id").is("deleted_at", null).not("project_id", "is", null);
  if (error) throw new Error(`properties: ${error.message}`);
  return [...new Set((data || []).map((r) => r.project_id))];
}

function toRow(projectId, detector, finding, run, config) {
  const impact = finding.impact === null || finding.impact === undefined || !Number.isFinite(Number(finding.impact)) ? null : Math.round(Number(finding.impact) * 100) / 100;
  const category = finding.category || detector.category;
  return {
    project_id: projectId,
    detector_key: detector.key,
    dedupe_key: `${detector.key}:${finding.key}`,
    category,
    area: detector.area,
    audience_roles: audienceFor(detector.area),
    urgency: finding.urgency || "soon",
    title: String(finding.title || detector.label).slice(0, 300),
    why: String(finding.why || "").slice(0, 2000),
    property_id: finding.propertyId || null,
    record_refs: (finding.records || []).filter((r) => r?.id).slice(0, 100),
    suggested_actions: (finding.actions || []).filter(Boolean),
    impact_amount: impact,
    impact_units: impact === null ? null : "usd",
    score: scoreOf({ impactAmount: impact, urgency: finding.urgency, category }, config),
    confidence: "certain",
    completeness: run.completeness,
    completeness_note: run.note || null,
    metadata: { grain: finding.grain || "record", ...(finding.metadata || {}) },
    // The upsert lands on the same (project, dedupe_key) row even after retention soft-deleted it; bring it back.
    deleted_at: null,
  };
}

// Merge a fresh finding row with the stored signal: lifecycle fields carry over, worsening is detected.
function merge(row, existing, nowIso) {
  if (!existing) return { ...row, status: "open", first_seen_at: nowIso, last_seen_at: nowIso, previous_impact_amount: null, worsened_at: null, resolved_at: null };
  const reopened = ["resolved", "expired"].includes(existing.status);
  if (reopened) return { ...row, status: "open", first_seen_at: nowIso, last_seen_at: nowIso, previous_impact_amount: null, worsened_at: null, resolved_at: null };
  const prev = existing.impact_amount === null ? null : Number(existing.impact_amount);
  const grew = row.impact_amount !== null && prev !== null && row.impact_amount > prev + 0.5;
  const escalated = (URGENCY_RANK[row.urgency] ?? 0) > (URGENCY_RANK[existing.urgency] ?? 0);
  const worse = grew || escalated;
  return {
    ...row,
    status: worse && existing.status === "acknowledged" ? "open" : existing.status,
    first_seen_at: existing.first_seen_at,
    last_seen_at: nowIso,
    previous_impact_amount: worse ? prev : existing.previous_impact_amount,
    worsened_at: worse ? nowIso : existing.worsened_at,
    resolved_at: null,
  };
}

export async function runProjectSignals(admin, projectId, { now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const [stored, fees, modules] = await Promise.all([
    getProjectSetting(admin, projectId, SIGNAL_SETTINGS_KEY),
    getProjectSetting(admin, projectId, "fees_policies"),
    getProjectSetting(admin, projectId, MODULES_SETTING_KEY),
  ]);
  const config = resolveSignalConfig(stored);
  // A detector switched off, or in a module switched off, doesn't run; its open signals expire like a disabled rule's.
  const detectors = activeDetectors(config, modules);
  const ctx = { p: resolveParams({}, now), now, config, policies: effectivePolicies({ company: fees }) };
  const src = await loadServerSources(admin, projectId, detectorSources(detectors), new Map());

  const rows = [];
  const ran = new Set();
  const errors = [];
  for (const d of detectors) {
    try {
      const out = d.detect(src, ctx) || {};
      const examined = Number(out.examined) || 0;
      const skipped = Math.min(examined, Number(out.skipped) || 0);
      const run = { completeness: examined ? Math.round(((examined - skipped) / examined) * 10000) / 10000 : 1, note: out.note || "" };
      for (const f of out.findings || []) rows.push(toRow(projectId, d, f, run, config));
      ran.add(d.key);
    } catch (e) {
      errors.push(`${d.key}: ${e?.message || e}`);
    }
  }

  const { data: existing, error: readErr } = await admin.from("signals").select("*").eq("project_id", projectId).is("deleted_at", null);
  if (readErr) throw new Error(`signals: ${readErr.message}`);
  const byKey = new Map((existing || []).map((s) => [s.dedupe_key, s]));
  const unique = [...new Map(rows.map((r) => [r.dedupe_key, r])).values()];
  const merged = unique.map((r) => merge(r, byKey.get(r.dedupe_key), nowIso));
  const fresh = merged.filter((r) => !byKey.has(r.dedupe_key) || ["resolved", "expired"].includes(byKey.get(r.dedupe_key).status));

  let saved = [];
  if (merged.length) {
    const { data, error } = await admin.from("signals").upsert(merged, { onConflict: "project_id,dedupe_key" }).select("id, dedupe_key, detector_key, title, why, urgency, record_refs, property_id");
    if (error) throw new Error(`signals upsert: ${error.message}`);
    saved = data || [];
  }

  // Resolve what the detectors that ran no longer find; expire what nobody has seen in a while.
  const found = new Set(unique.map((r) => r.dedupe_key));
  const stale = (existing || []).filter((s) => LIVE_SIGNAL_STATUSES.includes(s.status) && !found.has(s.dedupe_key));
  const resolved = stale.filter((s) => ran.has(s.detector_key));
  const cutoff = new Date(now.getTime() - config.expireAfterDays * DAY).toISOString();
  const expired = stale.filter((s) => !ran.has(s.detector_key) && String(s.last_seen_at) < cutoff);
  if (resolved.length) {
    const { error } = await admin.from("signals").update({ status: "resolved", resolved_at: nowIso }).in("id", resolved.map((s) => s.id));
    if (error) throw new Error(`signals resolve: ${error.message}`);
  }
  if (expired.length) {
    const { error } = await admin.from("signals").update({ status: "expired" }).in("id", expired.map((s) => s.id));
    if (error) throw new Error(`signals expire: ${error.message}`);
  }

  // Review decisions for detectors that need a person (new or reopened only, so occurrences stay meaningful).
  const freshKeys = new Set(fresh.map((r) => r.dedupe_key));
  const decide = new Set(DETECTORS.filter((d) => d.needsDecision).map((d) => d.key));
  for (const s of saved.filter((x) => decide.has(x.detector_key) && freshKeys.has(x.dedupe_key))) {
    const ref = (s.record_refs || [])[0];
    await raiseReview(admin, {
      projectId,
      dedupeKey: `signal:${s.id}`,
      kind: "decision",
      sourceType: "signal",
      sourceId: s.id,
      reasonCode: "signal_decision",
      title: s.title,
      reasonText: s.why,
      severity: s.urgency,
      recordType: ref?.type || null,
      recordId: ref?.id || null,
      recordLabel: ref?.label || null,
      propertyId: s.property_id || null,
      context: { note: s.why },
    });
  }
  for (const s of resolved.filter((x) => decide.has(x.detector_key))) {
    await resolveRaised(admin, { projectId, dedupeKey: `signal:${s.id}`, action: "cleared", note: "The signal cleared on its own." });
  }

  return { findings: merged.length, created: fresh.length, resolved: resolved.length, expired: expired.length, errors };
}

export async function runSignals({ admin, now = new Date(), projectId = null } = {}) {
  const result = emptyResult();
  if (!admin) return { ...result, errors: ["Service role not configured"] };
  let projects = [];
  try {
    projects = projectId ? [projectId] : await signalProjects(admin);
  } catch (e) {
    return { ...result, errors: [e?.message || String(e)] };
  }
  for (const pid of projects) {
    try {
      const r = await runProjectSignals(admin, pid, { now });
      result.processed += r.findings;
      result.created += r.created;
      result.skipped += r.resolved + r.expired;
      result.errors.push(...r.errors.map((e) => projectError(pid, e)));
    } catch (e) {
      result.errors.push(projectError(pid, e?.message || e));
    }
  }
  return result;
}
