import { emptyResult } from "@/lib/jobs/contract";
import { ATTRIBUTION_DAYS, COUNTED_STATUSES, COUNTED_STEPS, METRICS, stepMetric } from "./value";

// Nightly impact rollup (ORCH-09, server-only, idempotent). Recomputes a window of days per project from
// automation_runs (runs, completions, failures, completed steps by type on the day each step ran), review items
// (exceptions raised and resolved), the ledger (payments collected within the attribution window after a
// collections run) and renewals (offers sent, accepted), then upserts property.impact_daily by
// (project, date, automation, metric) and zeroes rows in the window that no longer have data.
// The first run for a project backfills a year; later runs recompute the last few days.

const DAY = 86400000;
const PAGE = 1000;
const BACKFILL_DAYS = 400;
const ROLLING_DAYS = 3;
const COLLECTION_PLAYBOOKS = ["collections_ladder", "autopay_failure_recovery"];
const COLLECTION_TRIGGERS = ["rent.overdue", "autopay.failed"];
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

async function paged(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const chunks = (list, n = 200) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// Collections runs: workflows from the collections playbooks, or on a rent-overdue / autopay-failed trigger.
export const isCollectionsAutomation = (a) =>
  COLLECTION_PLAYBOOKS.includes(a?.metadata?.playbook?.key) || COLLECTION_TRIGGERS.includes(a?.trigger_event) || a?.metadata?.builtIn === "collections";

// Pure: aggregate runs into { "<date>|<automationId>|<metric>": value } for dates >= since.
export function aggregateRuns(runs, since) {
  const out = new Map();
  const add = (date, automationId, metric, v = 1) => {
    if (!date || date < since) return;
    const k = `${date}|${automationId}|${metric}`;
    out.set(k, (out.get(k) || 0) + v);
  };
  for (const r of runs) {
    if (r.status === "skipped") continue;
    add(isoDay(r.started_at), r.automation_id, METRICS.runs);
    if (r.status === "completed" && r.finished_at) add(isoDay(r.finished_at), r.automation_id, METRICS.completed);
    if (r.status === "failed") add(isoDay(r.finished_at || r.updated_at), r.automation_id, METRICS.failed);
    for (const l of Array.isArray(r.log) ? r.log : []) {
      if (!COUNTED_STEPS.includes(l?.type) || !COUNTED_STATUSES.includes(l.status) || !l.at) continue;
      add(isoDay(l.at), r.automation_id, stepMetric(l.type));
    }
  }
  return out;
}

// Pure: attribute payments to the latest collections run on the same tenant / lease within the window before them.
// payments: [{ date, amount, tenantId, leaseId }]; runs: [{ automationId, startedAt, tenantId, leaseId }].
export function attributeCollections(payments, runs, windowDays = ATTRIBUTION_DAYS) {
  const out = [];
  for (const p of payments) {
    const at = new Date(`${p.date}T23:59:59Z`).getTime();
    const run = runs
      .filter((r) => (r.tenantId && r.tenantId === p.tenantId) || (r.leaseId && r.leaseId === p.leaseId))
      .filter((r) => {
        const t = new Date(r.startedAt).getTime();
        return t <= at && at - t <= windowDays * DAY;
      })
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
    if (run) out.push({ date: p.date, automationId: run.automationId, amount: p.amount });
  }
  return out;
}

async function projectIds(admin, projectId) {
  if (projectId) return [projectId];
  const rows = await paged(() => admin.from("automations").select("project_id").is("deleted_at", null).not("project_id", "is", null));
  return [...new Set(rows.map((r) => r.project_id))];
}

async function rollupProject(admin, projectId, now, result) {
  const today = isoDay(now);
  const { count } = await admin.from("impact_daily").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const days = count ? ROLLING_DAYS : BACKFILL_DAYS;
  const since = isoDay(now.getTime() - (days - 1) * DAY);
  const sinceIso = `${since}T00:00:00Z`;

  const automations = await paged(() => admin.from("automations").select("id, trigger_event, metadata").eq("project_id", projectId));
  const playbookOf = new Map(automations.map((a) => [a.id, a.metadata?.playbook?.key || null]));
  const collectionsIds = new Set(automations.filter(isCollectionsAutomation).map((a) => a.id));

  // Runs touched in the window (updated_at moves with every step), so steps run today on old runs count today.
  const runs = await paged(() =>
    admin
      .from("automation_runs")
      .select("id, automation_id, status, started_at, finished_at, updated_at, record_type, record_id, log")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .gte("updated_at", sinceIso)
      .order("id"),
  );
  const values = aggregateRuns(runs, since);

  // Exceptions raised / resolved by automation runs.
  const reviews = await paged(() =>
    admin
      .from("review_items")
      .select("id, kind, status, created_at, resolved_at, metadata")
      .eq("project_id", projectId)
      .eq("source_type", "automation_run")
      .in("kind", ["exception", "approval", "decision"])
      .is("deleted_at", null)
      .or(`created_at.gte.${sinceIso},resolved_at.gte.${sinceIso}`)
      .order("id"),
  );
  const bump = (date, automationId, metric, v = 1) => {
    if (!date || date < since || !automationId) return;
    const k = `${date}|${automationId}|${metric}`;
    values.set(k, (values.get(k) || 0) + v);
  };
  for (const r of reviews) {
    const automationId = r.metadata?.automationId;
    bump(isoDay(r.created_at), automationId, METRICS.exceptionsRaised);
    if (r.status === "resolved" && r.resolved_at) bump(isoDay(r.resolved_at), automationId, METRICS.exceptionsResolved);
  }

  // Collected after a collections run: payments in the window vs collections runs up to the attribution window earlier.
  if (collectionsIds.size) {
    const runSince = new Date(new Date(sinceIso).getTime() - ATTRIBUTION_DAYS * DAY).toISOString();
    const cRuns = await paged(() =>
      admin
        .from("automation_runs")
        .select("automation_id, started_at, record_type, record_id, status")
        .eq("project_id", projectId)
        .in("automation_id", [...collectionsIds])
        .neq("status", "skipped")
        .gte("started_at", runSince)
        .is("deleted_at", null)
        .order("started_at"),
    );
    const tenantIds = new Set();
    const leaseIds = new Set();
    const paymentIds = cRuns.filter((r) => r.record_type === "online_payment").map((r) => r.record_id);
    const payTenant = new Map();
    for (const ids of chunks(paymentIds)) {
      const { data } = await admin.from("online_payments").select("id, tenant_id, lease_id").in("id", ids);
      for (const p of data || []) payTenant.set(p.id, p);
    }
    const runTargets = cRuns.map((r) => {
      const t = r.record_type === "tenant" ? { tenantId: r.record_id } : r.record_type === "lease" ? { leaseId: r.record_id } : payTenant.get(r.record_id) ? { tenantId: payTenant.get(r.record_id).tenant_id, leaseId: payTenant.get(r.record_id).lease_id } : {};
      if (t.tenantId) tenantIds.add(t.tenantId);
      if (t.leaseId) leaseIds.add(t.leaseId);
      return { automationId: r.automation_id, startedAt: r.started_at, ...t };
    });
    const entries = await paged(() =>
      admin
        .from("ledger_entries")
        .select("id, entry_date, status, voided_at")
        .eq("project_id", projectId)
        .eq("source_type", "payment")
        .gte("entry_date", since)
        .lte("entry_date", today)
        .is("deleted_at", null)
        .order("id"),
    );
    const live = entries.filter((e) => !e.voided_at && String(e.status || "").toLowerCase() !== "void");
    const payments = [];
    for (const ids of chunks(live.map((e) => e.id))) {
      const { data } = await admin.from("ledger_lines").select("entry_id, entry_date, credit, tenant_id, lease_id").in("entry_id", ids).gt("credit", 0).is("deleted_at", null);
      for (const l of data || []) {
        if (!(tenantIds.has(l.tenant_id) || leaseIds.has(l.lease_id))) continue;
        payments.push({ date: l.entry_date, amount: Number(l.credit) || 0, tenantId: l.tenant_id, leaseId: l.lease_id });
      }
    }
    for (const a of attributeCollections(payments, runTargets)) bump(a.date, a.automationId, METRICS.collected, a.amount);
  }

  // Renewals (project level): offers sent and renewals accepted, by the day they changed.
  const renewals = await paged(() =>
    admin.from("renewals").select("id, status, offer_sent_on, updated_at").eq("project_id", projectId).is("deleted_at", null).order("id"),
  );
  const projectLevel = new Map();
  const addProject = (date, metric) => {
    if (!date || date < since) return;
    projectLevel.set(`${date}|${metric}`, (projectLevel.get(`${date}|${metric}`) || 0) + 1);
  };
  for (const r of renewals) {
    if (r.offer_sent_on) addProject(r.offer_sent_on, METRICS.offersSent);
    if (r.status === "Accepted") addProject(isoDay(r.updated_at), METRICS.renewalsAccepted);
  }

  const rows = [
    ...[...values.entries()].map(([k, value]) => {
      const [date, automationId, metric] = k.split("|");
      return { project_id: projectId, date, automation_id: automationId, playbook_key: playbookOf.get(automationId) || null, metric, value: Math.round(value * 100) / 100 };
    }),
    ...[...projectLevel.entries()].map(([k, value]) => {
      const [date, metric] = k.split("|");
      return { project_id: projectId, date, automation_id: null, playbook_key: "renewal_pipeline", metric, value };
    }),
  ];

  // Zero rows in the window that no longer have data, so a re-run reflects cancellations and corrections.
  const existing = await paged(() =>
    admin.from("impact_daily").select("date, automation_id, metric, playbook_key").eq("project_id", projectId).gte("date", since).order("id"),
  );
  const fresh = new Set(rows.map((r) => `${r.date}|${r.automation_id ?? ""}|${r.metric}`));
  for (const e of existing) {
    if (!fresh.has(`${e.date}|${e.automation_id ?? ""}|${e.metric}`)) rows.push({ project_id: projectId, date: e.date, automation_id: e.automation_id, playbook_key: e.playbook_key, metric: e.metric, value: 0 });
  }

  for (const batch of chunks(rows, 500)) {
    const { error } = await admin.from("impact_daily").upsert(batch, { onConflict: "project_id,date,automation_id,metric" });
    if (error) throw new Error(`impact_daily: ${error.message}`);
  }
  result.processed += 1;
  result.created += rows.length;
}

export async function runImpact({ admin, now = new Date(), projectId = null } = {}) {
  const result = emptyResult();
  if (!admin) return { ...result, errors: ["Service role not configured"] };
  try {
    for (const id of await projectIds(admin, projectId)) {
      try {
        await rollupProject(admin, id, now, result);
      } catch (e) {
        result.errors.push(`Impact (${id}): ${e?.message || e}`);
      }
    }
  } catch (e) {
    result.errors.push(e?.message || String(e));
  }
  return result;
}
