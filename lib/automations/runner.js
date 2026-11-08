import { computeLateFee, effectivePolicies } from "@/lib/policies";
import { tenantShare } from "@/lib/housing/hap";
import { getNotificationConfig } from "@/lib/email/notifications";
import { buildMergeValues, getProjectSetting } from "@/lib/messaging/context";
import { renderMerge } from "@/lib/messaging/merge_fields";
import { deliver } from "@/lib/messaging/deliver";
import { sendPartyMessage } from "@/lib/messaging/send";
import { loadParty, logActivity } from "@/lib/messaging/threads";
import { emptyResult, projectError } from "@/lib/jobs/contract";
import { loadModuleCheck } from "@/lib/modules";
import { buildCharge } from "@/lib/ledger/postings";
import { loadAccountIndex, postBuilt } from "@/lib/ledger/store";
import { partyReceivable, partyReceivables } from "@/lib/ledger/ar_reads";
import { loadLeaseReceivables } from "@/lib/billing/receivables";
import { rentOverdueOf } from "@/lib/billing/ar_status";
import { isLateFeeLease } from "@/lib/billing/late_fee_rules";
import { GUARDRAILS_KEY, autonomyOf, gate, resolveGuardrails } from "@/lib/orchestration/autonomy";
import { ReviewableError, reasonFromError, reasonOf } from "@/lib/orchestration/reasons";
import { raiseReview, resolveRaised } from "@/lib/orchestration/review";
import { link } from "@/lib/orchestration/records";
import { forProject, forProjectOrAll } from "@/lib/supabase/scope";
import { PLAYBOOK_STEPS } from "./steps";
import {
  CONDITION_FIELDS,
  RECORD_TYPES,
  TABLE_RECORD_TYPE,
  explainConditions,
  normalizeTriggerKey,
  recordTitle,
  stepSummary,
  triggerLabel,
  triggerModule,
  triggerRecordType,
  workflowConditions,
} from "./catalog";

// Server-only workflow runner (the `automations` scheduled job). Each pass:
// 1) drains property.automation_events into runs, 2) fires timed triggers
// (lease ending, rent overdue, work orders overdue, vendor documents, schedules),
// 3) executes due runs step by step. Idempotent: runs are unique per
// (automation_id, dedupe_key), each step's progress is persisted before the
// next, runs are claimed before executing, sends are deduped per party and
// charges per idempotency key. Every run records why it ran (metadata.explanation);
// a trigger whose conditions fail leaves a `skipped` run with the explanation.
// Side-effect steps pass the autonomy gate (ORCH-05); a final failure raises a
// review item (ORCH-04); retryable errors back off 5m → 30m → 2h (PLAT-13).

const DAY = 86400000;
const HOUR = 3600000;
const BACKOFF_MINUTES = [5, 30, 120];
const isoDay = (d) => d.toISOString().slice(0, 10);
const AUTOMATION_ACTOR = { id: null, name: "Automation", email: "" };
const DUE_STATUSES = ["pending", "waiting", "retrying"];
const CLOSED_WORK = ["completed", "cancelled", "rejected", "converted", "closed", "draft"];
const money = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTime = (d) => new Date(d).toISOString().slice(0, 16).replace("T", " ") + " UTC";

async function select(admin, table, apply = (q) => q) {
  const { data, error } = await apply(admin.from(table).select("*").is("deleted_at", null));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

// A tenant record's `balance` is the ledger's tenant AR (CORE-07): the run's lease when it has one, else every lease of theirs.
async function withLedgerBalance(admin, type, row, leaseId = null) {
  if (type !== "tenant" || !row?.project_id) return row;
  const balance = await partyReceivable(admin, (q) => forProject(q, row.project_id), leaseId ? { leaseId } : { tenantId: row.id });
  return { ...row, balance };
}

// The lease a run is about (rent.overdue names it in its trigger context), else null.
const runLeaseId = (meta) => meta?.explanation?.trigger?.context?.leaseId || null;

// Records, workflows and runs load inside one project only: an id from another project reads as missing (PLAT-01f).
async function loadRecord(admin, type, id, projectId, { leaseId = null } = {}) {
  const table = RECORD_TYPES[type]?.table;
  if (!table || !id || !projectId) return null;
  const { data } = await forProject(admin.from(table).select("*").eq("id", id), projectId).maybeSingle();
  return data && !data.deleted_at ? withLedgerBalance(admin, type, data, leaseId) : null;
}

export function normalizeAutomation(row) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const triggerEvent = normalizeTriggerKey(row.trigger_event);
  const trigger = meta.trigger && typeof meta.trigger === "object" ? meta.trigger : {};
  return {
    id: row.id,
    projectId: row.project_id || null,
    name: row.name || "Automation",
    enabled: Boolean(row.enabled) && row.status !== "Paused",
    triggerEvent,
    trigger,
    recordType: triggerRecordType(triggerEvent, trigger),
    conditions: workflowConditions(meta),
    steps: Array.isArray(meta.steps) ? meta.steps.filter((s) => s && s.type) : [],
    runCount: Number(row.run_count) || 0,
    autonomy: row.autonomy || "auto",
    autonomyConfig: meta.autonomyConfig || {},
    playbook: meta.playbook || null,
  };
}

async function loadAutomation(admin, id, projectId) {
  if (!id || !projectId) return null;
  const { data } = await forProject(admin.from("automations").select("*").eq("id", id), projectId).maybeSingle();
  return data && !data.deleted_at ? normalizeAutomation(data) : null;
}

// Merge refs for a triggering record.
function refsFor(type, row, projectId) {
  if (!row) return { projectId };
  const base = { projectId, unitId: row.unit_id, propertyId: row.property_id };
  switch (type) {
    case "lease":
      return { ...base, leaseId: row.id, tenantId: row.tenant_id };
    case "tenant":
      return { ...base, tenantId: row.id, leaseId: row.lease_id };
    case "work_order":
      return { ...base, tenantId: row.tenant_id, vendorId: row.vendor_id, leaseId: row.lease_id };
    case "vendor":
      return { projectId, vendorId: row.id };
    case "bill":
      return { ...base, vendorId: row.vendor_id };
    default:
      return { ...base, tenantId: row.tenant_id, leaseId: row.lease_id };
  }
}

// --- Explanations (ORCH-02) ----------------------------------------------------

// The record's condition-field values at trigger time (label + value), for "why this ran".
function keyValues(recordType, record) {
  if (!record) return [];
  return (CONDITION_FIELDS[recordType] || [])
    .map((f) => ({ field: f.key, label: f.label, value: record[f.key] ?? record.metadata?.[f.key] ?? null }))
    .filter((v) => v.value !== null && v.value !== "");
}

function buildExplanation(a, { eventType, eventId = null, payload = null, actor = null, record, recordType, context = {} }) {
  return {
    trigger: { type: eventType, label: triggerLabel(eventType), eventId, actor, context, payload },
    conditions: explainConditions(a.conditions, record || {}, recordType),
    record: record ? { type: recordType, id: record.id, label: recordTitle(recordType, record) } : null,
    values: keyValues(recordType, record),
    at: new Date().toISOString(),
  };
}

// Insert a run unless (automation, dedupeKey) already exists. Returns the new run id, else null.
async function createRun(admin, a, { dedupeKey, eventId = null, eventType, recordType, record, now, explanation, status = "pending", metadata = {}, createdBy = null }) {
  const skipped = status === "skipped";
  const { data, error } = await admin
    .from("automation_runs")
    .upsert(
      {
        project_id: a.projectId,
        automation_id: a.id,
        automation_name: a.name,
        dedupe_key: dedupeKey,
        event_id: eventId,
        event_type: eventType,
        record_type: recordType,
        record_id: record?.id || null,
        record_label: record ? recordTitle(recordType, record) : null,
        status,
        current_step: 0,
        steps: a.steps,
        log: [],
        started_at: now.toISOString(),
        ...(skipped ? { finished_at: now.toISOString() } : {}),
        created_by: createdBy,
        metadata: { explanation, ...metadata },
      },
      { onConflict: "automation_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`run: ${error.message}`);
  if (!data?.length) return null;
  if (!skipped) {
    a.runCount += 1;
    await admin.from("automations").update({ run_count: a.runCount, last_run_on: isoDay(now) }).eq("id", a.id);
  }
  return data[0].id;
}

// Fire one trigger for one record: a run when the conditions hold, else a `skipped` trace (kept 30 days); an off module skips silently.
async function fireFor(admin, a, { dedupeKey, now, recordType, record, eventType, eventId = null, eventProjectId = null, payload = null, context = {}, result, moduleOn = () => true }) {
  const mod = triggerModule(a.triggerEvent);
  if (mod && !moduleOn(record?.project_id || eventProjectId || a.projectId, mod)) {
    result.skipped += 1;
    return null;
  }
  const explanation = buildExplanation(a, { eventType, eventId, payload, record, recordType, context });
  if (!explanation.conditions.matched) {
    result.skipped += 1;
    await createRun(admin, a, { dedupeKey: `skip:${dedupeKey}`, eventId, eventType, recordType, record, now, explanation, status: "skipped" });
    return null;
  }
  const id = await createRun(admin, a, { dedupeKey, eventId, eventType, recordType, record, now, explanation });
  if (id) result.created += 1;
  return id;
}

// 1) Record events → runs.
async function drainEvents(admin, automations, { now, projectId, result, moduleOn }) {
  // Cron drains every pending event (one without a project matches nothing and is marked ignored).
  let q = admin.from("automation_events").select("*").eq("status", "pending").order("created_at").limit(500);
  if (projectId) q = forProject(q, projectId);
  const { data: events, error } = await q;
  if (error) throw new Error(`events: ${error.message}`);

  for (const ev of events || []) {
    result.processed += 1;
    const matches = automations.filter((a) => a.triggerEvent === ev.event_type && Boolean(ev.project_id) && a.projectId === ev.project_id);
    let started = 0;
    let evError = null;
    if (matches.length) {
      const recordType = TABLE_RECORD_TYPE[ev.source_table] || matches[0].recordType;
      try {
        const record = await loadRecord(admin, recordType, ev.record_id, ev.project_id);
        for (const a of matches) {
          // Skip records this automation created itself (no self-loops).
          if (record?.metadata?.createdByAutomation === a.id) continue;
          const id = await fireFor(admin, a, {
            dedupeKey: `event:${ev.id}`,
            now,
            recordType,
            record,
            eventType: ev.event_type,
            eventId: ev.id,
            eventProjectId: ev.project_id || null,
            payload: ev.payload || null,
            result,
            moduleOn,
          });
          if (id) started += 1;
        }
      } catch (e) {
        evError = e?.message || String(e);
        result.errors.push(projectError(ev.project_id, `Event ${ev.event_type}: ${evError}`));
      }
    }
    await admin
      .from("automation_events")
      .update({
        status: evError ? "failed" : matches.length ? "processed" : "ignored",
        processed_at: now.toISOString(),
        attempts: Number(ev.attempts || 0) + 1,
        error: evError,
        metadata: { ...(ev.metadata || {}), runsStarted: started },
      })
      .eq("id", ev.id);
  }
}

// Expiry of a vendor's insurance / licence documents: [{ key, kind, label, endsOn }].
async function vendorDocuments(admin, vendors) {
  if (!vendors.length) return new Map();
  const { data } = await admin
    .from("record_items")
    .select("id, owner_id, kind, name, status, ends_on")
    .eq("owner_type", "vendor")
    .in("kind", ["insurance_policy", "license"])
    .in("owner_id", vendors.map((v) => v.id))
    .is("deleted_at", null);
  const docs = new Map(vendors.map((v) => [v.id, []]));
  for (const d of data || []) {
    if (!d.ends_on || String(d.status || "").toLowerCase() === "cancelled") continue;
    docs.get(d.owner_id)?.push({ key: d.id, kind: d.kind, label: d.kind === "license" ? "licence" : "insurance certificate", endsOn: d.ends_on });
  }
  for (const v of vendors) {
    const list = docs.get(v.id);
    if (!list.some((d) => d.kind === "insurance_policy") && v.insurance_expiry) {
      list.push({ key: `${v.id}-coi`, kind: "insurance_policy", label: "insurance certificate", endsOn: v.insurance_expiry });
    }
  }
  return docs;
}

// Rows of a project's table by id (chunked).
async function rowsByIds(admin, table, projectId, ids) {
  const want = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < want.length; i += 150) out.push(...(await select(admin, table, (q) => forProject(q, projectId).in("id", want.slice(i, i + 150)))));
  return out;
}

// rent.overdue (CORE-07): a live lease whose tenant AR is at least minBalance, with its oldest open item daysOverdue old, fires for its primary tenant (dedupe per tenant per month).
async function fireRentOverdue(admin, a, { today, fire }) {
  const daysOverdue = Math.max(1, Number(a.trigger.daysOverdue) || 5);
  const minBalance = Number(a.trigger.minBalance ?? 1);
  const owing = [...(await partyReceivables(admin, (q) => forProject(q, a.projectId), "lease"))].filter(([, b]) => b > 0.004 && b >= minBalance);
  if (!owing.length) return;
  const leases = (await rowsByIds(admin, "leases", a.projectId, owing.map(([id]) => id))).filter(isLateFeeLease);
  const receivables = await loadLeaseReceivables(admin, a.projectId, leases.map((l) => l.id));
  const tenants = new Map((await rowsByIds(admin, "tenants", a.projectId, leases.map((l) => l.tenant_id))).map((t) => [t.id, t]));
  for (const l of leases) {
    const due = rentOverdueOf(receivables.get(l.id), { today, daysOverdue, minBalance });
    const t = tenants.get(l.tenant_id);
    if (!due || !t || t.status === "Past") continue;
    await fire("tenant", { ...t, balance: due.balance }, `rent.overdue:${t.id}:${today.slice(0, 7)}`, {
      leaseId: l.id,
      lease: l.name || "",
      daysLate: due.daysLate,
      oldestOpenDate: due.oldestOpenDate,
      daysOverdue,
      balance: due.balance,
      minBalance,
    });
  }
}

// 2) Timed triggers (exported so a check can fire one workflow's triggers without draining events).
export async function fireTimed(admin, automations, { now, result, moduleOn }) {
  const today = isoDay(now);
  const timed = automations.filter((a) =>
    ["lease.ending", "rent.overdue", "schedule", "work_order.overdue", "vendor.compliance_expiring"].includes(a.triggerEvent),
  );
  if (!timed.length) return;

  for (const a of timed) {
    try {
      const fire = (recordType, record, dedupeKey, context = {}) =>
        fireFor(admin, a, { dedupeKey, now, recordType, record, eventType: a.triggerEvent, context, result, moduleOn });

      if (a.triggerEvent === "lease.ending") {
        const days = Math.max(1, Number(a.trigger.daysBefore) || 60);
        const until = isoDay(new Date(now.getTime() + days * DAY));
        const leases = await select(admin, "leases", (q) =>
          forProject(q, a.projectId).gte("term_end", today).lte("term_end", until).not("status", "in", "(Ended,Draft)"),
        );
        for (const l of leases) {
          const daysUntilEnd = Math.round((new Date(`${l.term_end}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / DAY);
          await fire("lease", l, `lease.ending:${l.id}:${l.term_end}`, { daysUntilEnd, daysBefore: days, termEnd: l.term_end });
        }
      } else if (a.triggerEvent === "rent.overdue") {
        await fireRentOverdue(admin, a, { today, fire });
      } else if (a.triggerEvent === "work_order.overdue") {
        const hours = Math.max(1, Number(a.trigger.unassignedHours) || 4);
        const everyPriority = a.trigger.priorities === "all";
        const pastDue = a.trigger.pastDue !== "no";
        const rows = await select(admin, "work_orders", (q) => forProject(q, a.projectId).eq("kind", "work_order"));
        for (const w of rows) {
          if (CLOSED_WORK.includes(String(w.status || "").toLowerCase())) continue;
          if (!everyPriority && !["urgent", "high"].includes(String(w.priority || "").toLowerCase())) continue;
          const hoursOpen = Math.floor((now - new Date(w.created_at)) / HOUR);
          if (!w.vendor_id && !w.technician && hoursOpen >= hours) {
            await fire("work_order", w, `wo.unassigned:${w.id}`, { reason: "unassigned", hoursOpen, unassignedHours: hours });
          }
          const due = w.metadata?.dueDate;
          if (pastDue && due && due < today) await fire("work_order", w, `wo.past_due:${w.id}:${due}`, { reason: "past_due", dueDate: due });
        }
      } else if (a.triggerEvent === "vendor.compliance_expiring") {
        const days = Math.max(1, Number(a.trigger.daysBefore) || 30);
        const vendors = (await select(admin, "vendors", (q) => forProject(q, a.projectId))).filter(
          (v) => !["inactive", "do not use"].includes(String(v.status || "").toLowerCase()),
        );
        const docs = await vendorDocuments(admin, vendors);
        for (const v of vendors) {
          for (const d of docs.get(v.id) || []) {
            const daysUntil = Math.round((new Date(`${d.endsOn}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / DAY);
            if (daysUntil > days) continue;
            const state = daysUntil < 0 ? "expired" : "expiring";
            if (d.kind === "insurance_policy" && v.metadata?.coiWaived) continue;
            await fire("vendor", v, `vendor.doc:${d.key}:${d.endsOn}:${state}`, { document: d.label, expiresOn: d.endsOn, daysUntil, state });
          }
        }
      } else if (a.triggerEvent === "schedule") {
        const freq = a.trigger.frequency || "weekly";
        let period = null;
        if (freq === "daily") period = today;
        else if (freq === "weekly" && String(now.getUTCDay()) === String(a.trigger.weekday ?? "1")) period = today;
        else if (freq === "monthly" && now.getUTCDate() >= (Number(a.trigger.monthDay) || 1)) period = today.slice(0, 7);
        if (!period) continue;
        const scope = a.trigger.scope || "none";
        const context = { frequency: freq, period, scope };
        if (scope === "active_leases") {
          const leases = await select(admin, "leases", (q) => forProject(q, a.projectId).eq("status", "Active"));
          for (const l of leases) await fire("lease", l, `schedule:${period}:${l.id}`, context);
        } else if (scope === "tenants_with_balance") {
          // Tenants owing on the ledger (tenant AR, CORE-07).
          const owing = [...(await partyReceivables(admin, (q) => forProject(q, a.projectId), "tenant"))].filter(([, b]) => b > 0.004);
          const balances = new Map(owing);
          const tenants = await rowsByIds(admin, "tenants", a.projectId, owing.map(([id]) => id));
          for (const t of tenants) if (t.status !== "Past") await fire("tenant", { ...t, balance: balances.get(t.id) }, `schedule:${period}:${t.id}`, context);
        } else {
          await fire(null, null, `schedule:${period}`, context);
        }
      }
    } catch (e) {
      result.errors.push(projectError(a.projectId, `${a.name}: ${e?.message || e}`));
    }
  }
}

// --- Pass context ----------------------------------------------------------------

const newPass = (now) => ({ now, projects: new Map(), properties: new Map() });

// Per-project notification config, company guardrails and timezone (cached per pass).
async function projectContext(admin, pass, projectId) {
  const key = projectId || "none";
  if (!pass.projects.has(key)) {
    const [config, guardrails, company] = await Promise.all([
      getNotificationConfig(projectId, admin),
      getProjectSetting(admin, projectId, GUARDRAILS_KEY),
      getProjectSetting(admin, projectId, "company_profile"),
    ]);
    pass.projects.set(key, { config, guardrails: guardrails || {}, tz: company?.timezone || "America/New_York" });
  }
  return pass.projects.get(key);
}

async function propertyRow(admin, pass, propertyId) {
  if (!propertyId) return null;
  if (!pass.properties.has(propertyId)) {
    const { data } = await admin.from("properties").select("id, name, metadata").eq("id", propertyId).maybeSingle();
    pass.properties.set(propertyId, data || null);
  }
  return pass.properties.get(propertyId);
}

async function guardrailsFor(admin, pass, projectId, propertyId) {
  const proj = await projectContext(admin, pass, projectId);
  const property = await propertyRow(admin, pass, propertyId);
  return { guardrails: resolveGuardrails({ company: proj.guardrails, property }), tz: property?.metadata?.timezone || proj.tz };
}

export async function automationsPaused(admin, projectId) {
  const company = await getProjectSetting(admin, projectId, GUARDRAILS_KEY);
  return Boolean(company?.pauseAll);
}

// --- Step preparation (shared by execution and preview) ---------------------------

async function resolveRecipients(admin, step, ctx) {
  const c = step.config || {};
  const refs = ctx.refs;
  switch (c.recipient || "tenant") {
    case "tenant": {
      const p = await loadParty(admin, "tenant", refs.tenantId, ctx.projectId);
      return p ? [p] : [];
    }
    case "vendor": {
      const p = await loadParty(admin, "vendor", refs.vendorId, ctx.projectId);
      return p ? [p] : [];
    }
    case "owner":
      return ownersOf(admin, refs.propertyId, ctx.projectId);
    case "applicant": {
      const r = ctx.record;
      if (!r?.email) return [];
      return [{ type: "other", id: null, name: r.applicant_name || r.name || "", email: r.email, phone: r.phone || "" }];
    }
    case "team":
      return (ctx.config?.alertEmails || []).map((email) => ({ type: "team", id: null, name: "", email }));
    case "custom":
      return c.email ? [{ type: "other", id: null, name: c.name || "", email: c.email }] : [];
    default:
      return [];
  }
}

export async function ownersOf(admin, propertyId, projectId) {
  if (!propertyId || !projectId) return [];
  const { data } = await forProject(admin.from("property_owners").select("owner_id").eq("property_id", propertyId).is("deleted_at", null), projectId);
  const owners = await Promise.all((data || []).map((l) => loadParty(admin, "owner", l.owner_id, projectId)));
  return owners.filter(Boolean);
}

async function leaseOf(admin, ctx) {
  if (ctx.recordType === "lease") return ctx.record;
  return ctx.refs.leaseId ? loadRecord(admin, "lease", ctx.refs.leaseId, ctx.projectId) : null;
}

async function chargeAmount(admin, step, ctx) {
  const c = step.config || {};
  if (c.amountType !== "late_fee_policy") return Math.round((Number(c.amount) || 0) * 100) / 100;
  const lease = await leaseOf(admin, ctx);
  const property = await propertyRow(admin, ctx.pass, ctx.refs.propertyId);
  const company = await getProjectSetting(admin, ctx.projectId, "fees_policies");
  const policies = effectivePolicies({ company, property, lease });
  const daysLate =
    Number(ctx.run?.metadata?.explanation?.trigger?.context?.daysLate) ||
    Math.max(0, ctx.now.getUTCDate() - Math.min(28, Number(policies.rentDueDay) || 1));
  const base = lease ? tenantShare(lease, null, ctx.now.toISOString().slice(0, 10)) : 0;
  return Math.round((Number(computeLateFee(policies, base, daysLate)) || 0) * 100) / 100;
}

const partyNames = (list) => list.map((p) => p.name || p.email || "recipient").join(", ");

// Resolve a step's inputs without side effects: { input, recipients?, channel?, amount? }.
async function prepareStep(admin, step, ctx) {
  const c = step.config || {};
  const merge = (t) => renderMerge(t, ctx.values, { keepMissing: false });
  switch (step.type) {
    case "send_email": {
      const recipients = await resolveRecipients(admin, step, ctx);
      const channel = c.channel || "email";
      return {
        recipients,
        channel,
        input: {
          recipients: recipients.map((p) => ({ type: p.type, id: p.id, name: p.name, address: channel === "sms" ? p.phone : p.email })),
          channel,
          category: c.category || "message",
          templateId: c.templateId || null,
          subject: merge(c.subject),
          body: merge(c.body),
        },
      };
    }
    case "post_charge": {
      const amount = await chargeAmount(admin, step, ctx);
      return { amount, input: { amount, kind: c.kind || "charge", memo: merge(c.memo) } };
    }
    case "create_work_order":
      return { input: { name: merge(c.name), priority: c.priority, category: c.category } };
    case "update_status":
      return { input: { status: c.status, previous: ctx.record?.status ?? null } };
    case "assign":
      return { input: { mode: c.mode, vendorId: c.vendorId || null, category: ctx.record?.category || null } };
    case "notify":
      return { input: { message: merge(c.message), emailTeam: Boolean(c.emailTeam) } };
    case "create_task":
      return { input: { title: merge(c.title), dueInDays: Number(c.dueInDays) || 0, escalate: Boolean(c.escalate) } };
    default: {
      const handler = PLAYBOOK_STEPS[step.type];
      return handler?.prepare ? handler.prepare(admin, step, ctx) : { input: {} };
    }
  }
}

// One plain sentence for what a gated step would do (review items, previews).
function describeAction(step, prepared = {}) {
  const i = prepared.input || {};
  switch (step.type) {
    case "send_email":
      return `${i.category === "legal" ? "send a legal notice" : "send a message"} to ${partyNames(prepared.recipients || []) || "the recipient"}${i.subject ? ` ("${i.subject}")` : ""}`;
    case "post_charge":
      return `post a ${money(prepared.amount)} ${i.kind === "late_fee" ? "late fee" : "charge"}`;
    case "create_work_order":
      return `open a work order${i.name ? ` "${i.name}"` : ""}`;
    case "update_status":
      return `set the status to ${i.status || "—"}`;
    case "assign":
      return "assign a vendor";
    case "owner_digest":
      return `email the owner digest to ${partyNames(prepared.recipients || []) || "the owners"}`;
    case "create_task":
      return `${i.escalate ? "escalate" : "create a task"}${i.title ? `: "${i.title}"` : ""}`;
    case "notify":
      return `notify the team${i.message ? `: "${i.message}"` : ""}`;
    default:
      return stepSummary(step).toLowerCase();
  }
}

// --- Step execution --------------------------------------------------------------

// Send once per party per run step: a notification_sends row claims the party before delivery.
async function claimSend(admin, ctx, party, channel) {
  const dedupeKey = `auto:${ctx.run.id}:${ctx.stepIndex}:${party.id || party.email || party.phone}`;
  const { data, error } = await admin
    .from("notification_sends")
    .insert({
      project_id: ctx.projectId,
      dedupe_key: dedupeKey,
      job_key: "automations",
      notification: "automation",
      channel,
      recipient: channel === "sms" ? party.phone : party.email,
      record_type: party.type,
      record_id: party.id || null,
      status: "sending",
      metadata: { automationId: ctx.automation.id, runId: ctx.run.id, step: ctx.stepIndex },
    })
    .select("id")
    .maybeSingle();
  if (!error && data) return { id: data.id, fresh: true };
  const { data: existing } = await admin.from("notification_sends").select("id, status").eq("dedupe_key", dedupeKey).maybeSingle();
  return existing ? { id: existing.id, fresh: existing.status !== "sent", alreadySent: existing.status === "sent" } : { id: null, fresh: true };
}

async function vendorCompliance(admin, vendor, today) {
  if (vendor?.metadata?.coiWaived) return { ok: true };
  const docs = (await vendorDocuments(admin, [vendor])).get(vendor.id) || [];
  const coi = docs.filter((d) => d.kind === "insurance_policy").sort((x, y) => (x.endsOn < y.endsOn ? 1 : -1))[0];
  return { ok: !coi || coi.endsOn >= today, endsOn: coi?.endsOn || null };
}

async function performStep(admin, step, ctx, prepared) {
  const c = step.config || {};
  const merge = (t) => renderMerge(t, ctx.values, { keepMissing: false });
  const ownerType = RECORD_TYPES[ctx.recordType]?.ownerType;
  const recordLink = link(ctx.recordType, ctx.record?.id, ctx.recordLabel);

  switch (step.type) {
    case "send_email": {
      const recipients = prepared.recipients || [];
      const channel = prepared.channel || "email";
      const partyRecipient = ["tenant", "vendor", "owner", "applicant"].includes(c.recipient || "tenant");
      if (!recipients.length) {
        if (!partyRecipient) return { status: "warning", message: "No recipient with an address on file", input: prepared.input };
        throw new ReviewableError("no_recipient", { recipientType: c.recipient || "tenant", workflow: ctx.automation.name, recordLabel: ctx.recordLabel });
      }
      const reachable = recipients.filter((p) => (channel === "sms" ? p.phone : p.email));
      if (!reachable.length && partyRecipient) {
        throw new ReviewableError("no_recipient_email", { recipient: partyNames(recipients), workflow: ctx.automation.name, recordLabel: ctx.recordLabel });
      }
      const outcomes = [];
      const links = [];
      for (const party of reachable) {
        const claim = await claimSend(admin, ctx, party, channel);
        if (claim.alreadySent) {
          outcomes.push({ ok: true, status: "sent", already: true });
          continue;
        }
        const res = await sendPartyMessage({
          db: admin,
          projectId: ctx.projectId,
          actor: AUTOMATION_ACTOR,
          party,
          channel,
          subject: c.subject,
          body: c.body,
          templateId: c.templateId || undefined,
          refs: ctx.refs,
          notification: c.recipient === "team" ? "staff_alerts" : "message",
          skipThread: c.recipient === "team",
          metadata: { automationId: ctx.automation.id, runId: ctx.run.id },
        });
        if (claim.id) {
          await admin
            .from("notification_sends")
            .update({ status: res.ok && res.status === "sent" ? "sent" : res.status || "failed", error: res.error || null })
            .eq("id", claim.id);
        }
        outcomes.push(res);
        if (party.id && ["tenant", "owner", "vendor"].includes(party.type)) links.push(link(party.type, party.id, party.name));
      }
      const failed = outcomes.filter((o) => !o.ok);
      if (failed.length === outcomes.length) throw new Error(failed[0]?.error || "Send failed");
      const statuses = [...new Set(outcomes.map((o) => (o.already ? "already sent" : o.status)))].join(", ");
      const warn = outcomes.some((o) => o.status !== "sent");
      return {
        status: warn ? "warning" : "ok",
        message: `${outcomes.length} recipient${outcomes.length === 1 ? "" : "s"} — ${statuses}${
          warn && outcomes.find((o) => o.error) ? ` (${outcomes.find((o) => o.error).error})` : ""
        }`,
        input: prepared.input,
        output: { sends: outcomes.map((o) => ({ status: o.already ? "already_sent" : o.status, threadId: o.threadId || null, messageId: o.messageId || null })) },
        links: links.filter(Boolean),
      };
    }

    case "notify": {
      const message = merge(c.message) || `${ctx.automation.name} ran`;
      if (ownerType && ctx.record?.id) {
        await logActivity(admin, {
          projectId: ctx.projectId,
          ownerType,
          ownerId: ctx.record.id,
          verb: "automation",
          summary: message,
          actorName: ctx.automation.name,
          metadata: { automationId: ctx.automation.id, runId: ctx.run.id },
        });
      }
      const emails = new Set(c.emailTeam ? ctx.config?.alertEmails || [] : []);
      if (c.memberId) {
        const { data: m } = await admin.from("team_members").select("email").eq("id", c.memberId).maybeSingle();
        if (m?.email) emails.add(m.email);
      }
      const sent = [];
      for (const email of emails) {
        const r = await deliver({
          db: admin,
          projectId: ctx.projectId,
          channel: "email",
          to: email,
          subject: `${ctx.automation.name}: ${ctx.recordLabel || "notification"}`,
          body: message,
          notification: "staff_alerts",
        });
        sent.push(r.status);
      }
      return {
        status: "ok",
        message: sent.length ? `${message} (emailed ${sent.length}: ${[...new Set(sent)].join(", ")})` : message,
        input: prepared.input,
        output: { emailed: sent.length },
        links: recordLink ? [recordLink] : [],
      };
    }

    case "create_work_order": {
      const r = ctx.record || {};
      const { data, error } = await admin
        .from("work_orders")
        .insert({
          project_id: ctx.projectId,
          name: merge(c.name) || `${ctx.automation.name} — ${ctx.recordLabel || "follow-up"}`,
          kind: "work_order",
          status: "Open",
          priority: c.priority || "Medium",
          category: c.category || "General",
          property_id: ctx.refs.propertyId || null,
          unit_id: ctx.refs.unitId || null,
          tenant_id: ctx.refs.tenantId || null,
          lease_id: ctx.refs.leaseId || null,
          tenant_name: ctx.values.tenant_name || r.tenant_name || null,
          metadata: {
            description: merge(c.description),
            source: "automation",
            createdByAutomation: ctx.automation.id,
            automationRunId: ctx.run.id,
          },
        })
        .select("id, name")
        .single();
      if (error) throw new Error(error.message);
      return {
        status: "ok",
        message: `Created work order "${data.name}"`,
        input: prepared.input,
        output: { workOrderId: data.id },
        links: [link("work_order", data.id, data.name)],
      };
    }

    case "update_status": {
      if (!c.status) return { status: "warning", message: "No status chosen", input: prepared.input };
      const table = RECORD_TYPES[ctx.recordType]?.table;
      if (!table || !ctx.record?.id) return { status: "warning", message: "No record to update", input: prepared.input };
      if (RECORD_TYPES[ctx.recordType]?.readOnly) return { status: "warning", message: `${RECORD_TYPES[ctx.recordType].label} records can't change status`, input: prepared.input };
      const { error } = await admin.from(table).update({ status: c.status }).eq("id", ctx.record.id);
      if (error) throw new Error(error.message);
      if (ownerType) {
        await logActivity(admin, {
          projectId: ctx.projectId,
          ownerType,
          ownerId: ctx.record.id,
          verb: "updated",
          summary: `Status set to ${c.status} by "${ctx.automation.name}"`,
          actorName: ctx.automation.name,
        });
      }
      return { status: "ok", message: `Status set to ${c.status}`, input: prepared.input, output: { status: c.status }, links: recordLink ? [recordLink] : [] };
    }

    case "assign": {
      if (ctx.recordType !== "work_order" || !ctx.record?.id) return { status: "warning", message: "Only work orders can be assigned", input: prepared.input };
      const today = isoDay(ctx.now);
      let vendor = null;
      if (c.mode === "vendor") {
        vendor = await loadRecord(admin, "vendor", c.vendorId, ctx.projectId);
        if (!vendor) throw new ReviewableError("no_vendor_match", { workflow: ctx.automation.name, recordLabel: ctx.recordLabel });
        const ok = await vendorCompliance(admin, vendor, today);
        if (!ok.ok) throw new ReviewableError("vendor_noncompliant", { vendor: vendor.name, workflow: ctx.automation.name });
      } else {
        const trade = String(ctx.record.category || "").toLowerCase();
        const pool = (await select(admin, "vendors", (q) => forProject(q, ctx.projectId)))
          .filter((v) => ["active", "preferred"].includes(String(v.status || "").toLowerCase()))
          .filter((v) => {
            const s = String(v.specialty || "").toLowerCase();
            return trade && s && (s.includes(trade) || trade.includes(s));
          })
          .sort((x, y) => (y.status === "Preferred") - (x.status === "Preferred") || (Number(y.rating) || 0) - (Number(x.rating) || 0));
        for (const v of pool) {
          if ((await vendorCompliance(admin, v, today)).ok) {
            vendor = v;
            break;
          }
        }
        if (!vendor) throw new ReviewableError("no_vendor_match", { category: ctx.record.category, workflow: ctx.automation.name, recordLabel: ctx.recordLabel });
      }
      const { error } = await admin.from("work_orders").update({ vendor_id: vendor.id, vendor_name: vendor.name }).eq("id", ctx.record.id);
      if (error) throw new Error(error.message);
      await logActivity(admin, {
        projectId: ctx.projectId,
        ownerType: "workorder",
        ownerId: ctx.record.id,
        verb: "updated",
        summary: `Assigned to ${vendor.name} by "${ctx.automation.name}"`,
        actorName: ctx.automation.name,
      });
      return {
        status: "ok",
        message: `Assigned to ${vendor.name}`,
        input: prepared.input,
        output: { vendorId: vendor.id },
        links: [link("vendor", vendor.id, vendor.name), recordLink].filter(Boolean),
      };
    }

    case "post_charge": {
      const amount = Number(prepared.amount) || 0;
      if (amount <= 0) return { status: "warning", message: "Nothing to charge (amount is $0)", input: prepared.input };
      const lease = await leaseOf(admin, ctx);
      if (!lease) throw new ReviewableError("ledger_error", { amount, workflow: ctx.automation.name, recordLabel: ctx.recordLabel, detail: "there's no lease to charge" });
      const lateFee = c.kind === "late_fee";
      // Late fees share the late-fees job's key, so the job and a workflow never both charge the same month.
      const key = lateFee ? `late:${lease.id}:${isoDay(ctx.now).slice(0, 7)}` : `auto:${ctx.run.id}:${step.id || ctx.stepIndex}`;
      const { data: dup } = await forProject(admin.from("ledger_entries").select("id").eq("idempotency_key", key).limit(1), ctx.projectId);
      if (dup?.length) {
        return {
          status: "ok",
          message: lateFee ? `This month's late fee is already on the ledger` : "Already posted",
          input: prepared.input,
          output: { entryId: dup[0].id, amount: 0, existing: true },
          links: [link("ledger_entry", dup[0].id, "Ledger entry"), link("lease", lease.id, lease.name)].filter(Boolean),
        };
      }
      const acct = await loadAccountIndex(admin, ctx.projectId);
      const built = buildCharge(
        {
          sourceType: lateFee ? "late_fee" : "charge",
          amount,
          date: isoDay(ctx.now),
          memo: merge(c.memo) || `${lateFee ? "Late fee" : "Charge"} · ${ctx.automation.name}`,
          leaseId: lease.id,
          tenantId: lease.tenant_id || ctx.refs.tenantId || undefined,
          unitId: lease.unit_id || undefined,
          propertyId: lease.property_id || undefined,
          sourceId: lease.id,
          idempotencyKey: key,
          metadata: { auto: true, automationId: ctx.automation.id, runId: ctx.run.id },
        },
        acct,
      );
      if (built.error) throw new ReviewableError("ledger_error", { amount, workflow: ctx.automation.name, recordLabel: ctx.recordLabel, detail: built.error });
      const entryId = await postBuilt(admin, built, { projectId: ctx.projectId });
      return {
        status: "ok",
        message: `Posted ${money(amount)} ${lateFee ? "late fee" : "charge"} to ${lease.name || "the lease"}`,
        input: prepared.input,
        output: { entryId, amount },
        links: [link("ledger_entry", entryId, `${lateFee ? "Late fee" : "Charge"} ${money(amount)}`), link("lease", lease.id, lease.name)].filter(Boolean),
      };
    }

    case "create_task": {
      const title = merge(c.title) || `Follow up: ${ctx.recordLabel || ctx.automation.name}`;
      const dueAt = Number(c.dueInDays) > 0 ? new Date(ctx.now.getTime() + Number(c.dueInDays) * DAY).toISOString() : null;
      const raised = await raiseReview(admin, {
        projectId: ctx.projectId,
        dedupeKey: `task:${ctx.run.id}:${step.id || ctx.stepIndex}`,
        kind: c.escalate ? "exception" : "task",
        sourceType: "automation_run",
        sourceId: ctx.run.id,
        recordType: ctx.recordType,
        recordId: ctx.record?.id || null,
        recordLabel: ctx.recordLabel,
        propertyId: ctx.refs.propertyId || null,
        title,
        reasonCode: c.escalate ? "escalation" : "task",
        context: { workflow: ctx.automation.name, recordLabel: ctx.recordLabel, note: merge(c.note) },
        severity: c.escalate ? "urgent" : "soon",
        dueAt,
        assigneeId: c.memberId || null,
        metadata: { automationId: ctx.automation.id, runId: ctx.run.id },
      });
      if (!raised) throw new Error("Couldn't create the task");
      return {
        status: "ok",
        message: `${c.escalate ? "Escalated" : "Task created"}: ${title}`,
        input: prepared.input,
        output: { reviewItemId: raised.item.id },
        links: recordLink ? [recordLink] : [],
      };
    }

    default: {
      const handler = PLAYBOOK_STEPS[step.type];
      if (handler?.perform) return handler.perform(admin, step, ctx, prepared);
      return { status: "warning", message: `Unknown step "${step.type}" skipped`, input: prepared.input };
    }
  }
}

// Per-batch message edits from a preview (ORCH-08): metadata.overrides = { [stepId]: { subject, body } }.
function applyOverrides(step, overrides) {
  const o = overrides?.[step.id];
  return o ? { ...step, config: { ...(step.config || {}), ...o } } : step;
}

// Raise the decision / approval a gated step waits on.
async function raiseStepReview(admin, ctx, step, index, verdict, prepared) {
  const a = ctx.automation;
  const action = describeAction(step, prepared);
  const autonomy = autonomyOf(a);
  return raiseReview(admin, {
    projectId: ctx.projectId,
    dedupeKey: `run:${ctx.run.id}:step:${index}`,
    kind: verdict.kind,
    sourceType: "automation_run",
    sourceId: ctx.run.id,
    recordType: ctx.recordType,
    recordId: ctx.record?.id || null,
    recordLabel: ctx.recordLabel,
    propertyId: ctx.refs.propertyId || null,
    title: `${a.name}: ${action.charAt(0).toUpperCase()}${action.slice(1)}`,
    reasonCode: verdict.reasonCode,
    context: { workflow: a.name, recordLabel: ctx.recordLabel, action, ...(verdict.context || {}), note: step.config?.note },
    amountAtStake: prepared.amount ?? null,
    assigneeRole: step.config?.approverRole || autonomy.approverRole || null,
    proposedAction: { type: "resume_run", runId: ctx.run.id, step: index, stepId: step.id || null, summary: action, input: prepared.input || {} },
    metadata: { automationId: a.id, runId: ctx.run.id, step: index },
  });
}

// Claim and execute one run from its current step.
async function executeRun(admin, run, pass, automation) {
  const { data: claimed } = await admin
    .from("automation_runs")
    .update({ status: "running" })
    .eq("id", run.id)
    .eq("status", run.status)
    .select("*");
  if (!claimed?.length) return "skipped";
  const r = claimed[0];

  const a = automation || { id: r.automation_id, name: r.automation_name || "Automation", autonomy: "auto", autonomyConfig: {} };
  const projectId = r.project_id || null;
  const meta = r.metadata && typeof r.metadata === "object" ? { ...r.metadata } : {};
  const steps = Array.isArray(r.steps) ? r.steps : [];
  const log = Array.isArray(r.log) ? [...r.log] : [];
  const save = (patch) => admin.from("automation_runs").update({ log, ...patch }).eq("id", r.id);

  const leaseId = runLeaseId(meta);
  const record = r.record_type ? await loadRecord(admin, r.record_type, r.record_id, projectId, { leaseId }) : null;
  if (r.record_type && r.record_id && !record) {
    const message = `${r.record_label || "The record"} no longer exists`;
    log.push({ step: Number(r.current_step) || 0, type: "record", status: "error", message, at: new Date().toISOString() });
    await save({ status: "failed", error: message, finished_at: new Date().toISOString(), metadata: { ...meta, reasonCode: "record_deleted" } });
    await raiseReview(admin, {
      projectId,
      dedupeKey: `run:${r.id}`,
      kind: "exception",
      sourceType: "automation_run",
      sourceId: r.id,
      recordType: r.record_type,
      recordId: r.record_id,
      recordLabel: r.record_label,
      reasonCode: "record_deleted",
      context: { workflow: a.name, recordLabel: r.record_label },
      severity: "routine",
      metadata: { automationId: a.id, runId: r.id },
    });
    return "failed";
  }

  // A run about one lease (rent.overdue) charges and quotes that lease.
  const refs = { ...refsFor(r.record_type, record, projectId), ...(leaseId ? { leaseId } : {}) };
  const proj = await projectContext(admin, pass, projectId);
  const { guardrails, tz } = await guardrailsFor(admin, pass, projectId, record?.property_id || null);
  const { values } = await buildMergeValues(admin, refs, { now: pass.now });
  const approvals = meta.approvals && typeof meta.approvals === "object" ? meta.approvals : {};
  const ctx = {
    automation: a,
    run: r,
    pass,
    projectId,
    record,
    recordType: r.record_type,
    recordLabel: r.record_label,
    refs,
    values,
    config: proj.config,
    now: pass.now,
    tz,
    guardrails,
    log,
  };

  for (let i = Number(r.current_step) || 0; i < steps.length; i += 1) {
    const step = applyOverrides(steps[i], meta.overrides);
    const at = new Date().toISOString();
    try {
      if (step.type === "wait") {
        const days = Math.max(0, Number(step.config?.days) || 0);
        const resumeAt = new Date(pass.now.getTime() + days * DAY);
        log.push({ step: i, type: "wait", status: "waiting", message: `Waiting ${days} day${days === 1 ? "" : "s"} — resumes ${isoDay(resumeAt)}`, at });
        await save({ status: "waiting", current_step: i + 1, resume_at: resumeAt.toISOString() });
        return "waiting";
      }

      if (step.type === "branch") {
        const fresh = record ? (await loadRecord(admin, r.record_type, record.id, projectId, { leaseId })) || record : {};
        const check = explainConditions(step.config?.conditions, fresh, r.record_type);
        if (check.matched) {
          log.push({ step: i, type: "branch", status: "ok", message: "Condition holds — continuing", output: { conditions: check }, at });
          await save({ current_step: i + 1 });
          continue;
        }
        if (step.config?.otherwise === "skip") {
          const n = Math.max(1, Number(step.config?.skip) || 1);
          log.push({ step: i, type: "branch", status: "ok", message: `Condition doesn't hold — skipped the next ${n} step${n === 1 ? "" : "s"}`, output: { conditions: check }, at });
          i += n;
          await save({ current_step: Math.min(i + 1, steps.length) });
          continue;
        }
        log.push({ step: i, type: "branch", status: "ok", message: "Condition no longer holds — stopped here", output: { conditions: check }, at });
        await save({ status: "completed", current_step: steps.length, finished_at: new Date().toISOString(), resume_at: null, metadata: { ...meta, stoppedAt: i } });
        return "completed";
      }

      if (step.type === "request_approval") {
        const ok = approvals[String(i)];
        if (ok) {
          log.push({ step: i, type: step.type, status: "ok", message: `Approved by ${ok.by || "a teammate"}${ok.note ? ` — ${ok.note}` : ""}`, at });
          await save({ current_step: i + 1 });
          continue;
        }
        const title = renderMerge(step.config?.title, values, { keepMissing: false }) || `Approve "${a.name}" for ${r.record_label || "this record"}`;
        await raiseReview(admin, {
          projectId,
          dedupeKey: `run:${r.id}:step:${i}`,
          kind: "approval",
          sourceType: "automation_run",
          sourceId: r.id,
          recordType: r.record_type,
          recordId: r.record_id,
          recordLabel: r.record_label,
          propertyId: refs.propertyId || null,
          title,
          reasonCode: "approval_required",
          context: {
            workflow: a.name,
            recordLabel: r.record_label,
            note: renderMerge(step.config?.note, values, { keepMissing: false }) || `${a.name} is waiting for approval before it continues.`,
          },
          assigneeRole: step.config?.approverRole || autonomyOf(a).approverRole || null,
          proposedAction: { type: "resume_run", runId: r.id, step: i, stepId: step.id || null, summary: "continue the workflow" },
          metadata: { automationId: a.id, runId: r.id, step: i },
        });
        log.push({ step: i, type: step.type, status: "waiting", message: "Waiting for approval in the Review Queue", at });
        await save({ status: "waiting_approval", current_step: i });
        return "waiting_approval";
      }

      const prepared = await prepareStep(admin, step, { ...ctx, stepIndex: i });
      const verdict = await gate(admin, step, { ...ctx, approved: Boolean(approvals[String(i)]) }, prepared);
      if (verdict.result === "defer") {
        log.push({ step: i, type: step.type, status: "waiting", message: `Held for quiet hours — resumes ${fmtTime(verdict.until)}`, at });
        await save({ status: "waiting", current_step: i, resume_at: verdict.until.toISOString() });
        return "waiting";
      }
      if (verdict.result === "skip") {
        log.push({ step: i, type: step.type, status: "skipped", message: verdict.notes.join("; ") || "Skipped by a guardrail", input: prepared.input, at });
        await save({ current_step: i + 1 });
        continue;
      }
      if (verdict.result === "review") {
        await raiseStepReview(admin, ctx, step, i, verdict, prepared);
        const waiting = verdict.kind === "decision" ? "waiting_review" : "waiting_approval";
        log.push({
          step: i,
          type: step.type,
          status: "waiting",
          message: verdict.kind === "decision" ? "Suggested — waiting for someone to run it" : `Waiting for approval — ${reasonOf(verdict.reasonCode).title.toLowerCase()}`,
          input: prepared.input,
          at,
        });
        await save({ status: waiting, current_step: i });
        return waiting;
      }

      const out = await performStep(admin, step, { ...ctx, stepIndex: i }, { ...prepared, recipients: verdict.recipients ?? prepared.recipients });
      log.push({
        step: i,
        type: step.type,
        status: out.status,
        message: [out.message, ...(verdict.notes || [])].filter(Boolean).join(" · "),
        input: out.input ?? prepared.input,
        output: out.output,
        links: out.links,
        at,
      });
      await save({ current_step: i + 1 });
    } catch (e) {
      const code = reasonFromError(e);
      const message = e?.message || String(e);
      const attempt = Number(r.attempt) || 0;
      const max = Math.max(1, Number(r.max_attempts) || 3);
      if (reasonOf(code).retryable && attempt + 1 < max) {
        const nextAt = new Date(Date.now() + BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length - 1)] * 60000);
        log.push({ step: i, type: step.type, status: "error", message: `${message} — retry ${attempt + 1} of ${max - 1} at ${fmtTime(nextAt)}`, at });
        await save({ status: "retrying", attempt: attempt + 1, next_retry_at: nextAt.toISOString(), current_step: i, error: message });
        return "retrying";
      }
      log.push({ step: i, type: step.type, status: "error", message, at });
      await save({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
        current_step: i,
        next_retry_at: null,
        metadata: { ...meta, reasonCode: code, failedStep: i },
      });
      await raiseReview(admin, {
        projectId,
        dedupeKey: `run:${r.id}`,
        kind: "exception",
        sourceType: "automation_run",
        sourceId: r.id,
        recordType: r.record_type,
        recordId: r.record_id,
        recordLabel: r.record_label,
        propertyId: refs.propertyId || null,
        reasonCode: code,
        context: { ...(e?.context || {}), workflow: a.name, recordLabel: e?.context?.recordLabel || r.record_label, stepLabel: stepSummary(step), detail: message },
        details: message,
        proposedAction: { type: "retry_run", runId: r.id, step: i, stepId: step.id || null },
        metadata: { automationId: a.id, runId: r.id, step: i, stepType: step.type },
      });
      return "failed";
    }
  }
  await save({ status: "completed", finished_at: new Date().toISOString(), resume_at: null, next_retry_at: null, error: null });
  await resolveRaised(admin, { projectId, dedupeKey: `run:${r.id}`, action: "completed", note: "The run completed" });
  return "completed";
}

// 3) Execute due runs: pending, waiting past resume_at, retrying past next_retry_at.
async function executeDueRuns(admin, automations, { now, projectId, result }) {
  const q = admin
    .from("automation_runs")
    .select("*")
    .in("status", DUE_STATUSES)
    .is("deleted_at", null)
    .order("started_at")
    .limit(200);
  const { data: runs, error } = await forProjectOrAll(q, projectId);
  if (error) throw new Error(`runs: ${error.message}`);
  const nowIso = now.toISOString();
  const due = (runs || []).filter((r) =>
    r.status === "retrying" ? !r.next_retry_at || r.next_retry_at <= nowIso : !r.resume_at || r.resume_at <= nowIso,
  );

  const byId = new Map(automations.map((a) => [a.id, a]));
  const pass = newPass(now);
  const paused = new Map();
  for (const run of due) {
    const key = run.project_id || "none";
    if (!paused.has(key)) paused.set(key, await automationsPaused(admin, run.project_id || null));
    if (paused.get(key)) {
      result.skipped += 1;
      continue;
    }
    // A paused/disabled automation leaves its runs parked, except runs a person launched by hand.
    let a = byId.get(run.automation_id);
    if (!a && run.metadata?.launch) a = await loadAutomation(admin, run.automation_id, run.project_id);
    if (!a) {
      result.skipped += 1;
      continue;
    }
    const outcome = await executeRun(admin, run, pass, a);
    result.processed += 1;
    if (outcome === "failed") result.errors.push(projectError(run.project_id, `${run.automation_name || "Automation"}: a step failed (see the Review Queue)`));
  }
}

export async function runAutomations({ admin, now = new Date(), projectId = null } = {}) {
  const result = emptyResult();
  if (!admin) return { ...result, errors: ["Service role not configured"] };
  try {
    // A workflow belongs to one project; one without a project never runs.
    const { data, error } = await forProjectOrAll(admin.from("automations").select("*").eq("enabled", true).is("deleted_at", null), projectId);
    if (error) throw new Error(`automations: ${error.message}`);
    const automations = (data || []).filter((r) => r.status !== "Paused").map(normalizeAutomation).filter((a) => a.projectId && a.steps.length);
    const live = automations.filter((a) => a.triggerEvent !== "manual");
    const moduleOn = await loadModuleCheck(admin);

    await drainEvents(admin, live, { now, projectId, result, moduleOn });
    await fireTimed(admin, live, { now, result, moduleOn });
    await executeDueRuns(admin, automations, { now, projectId, result });
  } catch (e) {
    result.errors.push(e?.message || String(e));
  }
  return result;
}

// --- Single-run control (review queue, launcher) ----------------------------------

async function loadRun(admin, runId, projectId) {
  if (!runId || !projectId) return null;
  const { data } = await forProject(admin.from("automation_runs").select("*").eq("id", runId), projectId).maybeSingle();
  return data && !data.deleted_at ? data : null;
}

// Execute one of the project's runs now if it's due-able. → { status, error } of the run afterwards, or { paused: true }.
export async function executeRunById(admin, runId, { projectId, now = new Date() } = {}) {
  const run = await loadRun(admin, runId, projectId);
  if (!run) return null;
  if (!DUE_STATUSES.includes(run.status)) return { status: run.status, error: run.error || null };
  if (await automationsPaused(admin, run.project_id || null)) return { status: run.status, paused: true };
  const automation = await loadAutomation(admin, run.automation_id, run.project_id);
  if (!automation) {
    const log = [...(Array.isArray(run.log) ? run.log : []), { step: Number(run.current_step) || 0, type: "run", status: "skipped", message: "The workflow was deleted, so this run was stopped", at: new Date().toISOString() }];
    await admin.from("automation_runs").update({ status: "cancelled", finished_at: new Date().toISOString(), log }).eq("id", runId).eq("status", run.status);
    return { status: "cancelled", error: "The workflow was deleted." };
  }
  await executeRun(admin, run, newPass(now), automation);
  const after = await loadRun(admin, runId, projectId);
  return { status: after?.status || run.status, error: after?.error || null };
}

// Retry a failed (or retrying) run from the failed step without repeating earlier steps (PLAT-13 rerunFromFailed).
// `adjust` = { step, config } edits that step's inputs first (another recipient, another amount).
export async function rerunFromFailed(admin, runId, { projectId, adjust = null, now = new Date(), actor = null } = {}) {
  const run = await loadRun(admin, runId, projectId);
  if (!run) return null;
  if (!["failed", "retrying"].includes(run.status)) return { status: run.status, error: run.error || null };
  const steps = Array.isArray(run.steps) ? [...run.steps] : [];
  if (adjust && steps[adjust.step]) steps[adjust.step] = { ...steps[adjust.step], config: { ...(steps[adjust.step].config || {}), ...(adjust.config || {}) } };
  const log = [
    ...(Array.isArray(run.log) ? run.log : []),
    {
      step: Number(run.current_step) || 0,
      type: "retry",
      status: "ok",
      message: `${adjust ? "Changed and retried" : "Retried"} by ${actor?.name || actor?.email || "a teammate"}`,
      at: new Date().toISOString(),
    },
  ];
  const { error } = await admin
    .from("automation_runs")
    .update({ status: "pending", error: null, finished_at: null, attempt: 0, next_retry_at: null, steps, log })
    .eq("id", runId)
    .eq("status", run.status);
  if (error) throw new Error(error.message);
  return executeRunById(admin, runId, { projectId, now });
}

// Approve the step a run is waiting on (approval or suggestion), then continue it.
export async function approveRunStep(admin, runId, step, { projectId, actor = null, note = "", now = new Date() } = {}) {
  const run = await loadRun(admin, runId, projectId);
  if (!run) return null;
  if (!["waiting_approval", "waiting_review"].includes(run.status)) return { status: run.status, error: run.error || null };
  const meta = run.metadata && typeof run.metadata === "object" ? run.metadata : {};
  const approvals = { ...(meta.approvals || {}), [String(step ?? run.current_step)]: { by: actor?.name || actor?.email || "A teammate", byId: actor?.id || null, at: new Date().toISOString(), note } };
  const { error } = await admin
    .from("automation_runs")
    .update({ status: "pending", metadata: { ...meta, approvals } })
    .eq("id", runId)
    .eq("status", run.status);
  if (error) throw new Error(error.message);
  return executeRunById(admin, runId, { projectId, now });
}

// Reject the waiting step: the run stops (cancelled) and records who decided.
export async function rejectRun(admin, runId, { projectId, actor = null, note = "" } = {}) {
  const run = await loadRun(admin, runId, projectId);
  if (!run) return null;
  if (!["waiting_approval", "waiting_review", "pending", "waiting", "retrying", "failed"].includes(run.status)) return { status: run.status };
  const meta = run.metadata && typeof run.metadata === "object" ? run.metadata : {};
  const by = actor?.name || actor?.email || "A teammate";
  const log = [
    ...(Array.isArray(run.log) ? run.log : []),
    { step: Number(run.current_step) || 0, type: "review", status: "skipped", message: `Rejected by ${by}${note ? ` — ${note}` : ""}`, at: new Date().toISOString() },
  ];
  await admin
    .from("automation_runs")
    .update({ status: "cancelled", finished_at: new Date().toISOString(), log, metadata: { ...meta, rejected: { by, byId: actor?.id || null, note, at: new Date().toISOString() } } })
    .eq("id", runId);
  return { status: "cancelled" };
}

// --- Manual launch and preview (ORCH-08) -------------------------------------------

// Records a launch may touch: the workflow's record type, in the workflow's project only.
async function launchTargets(admin, a, { recordType, recordIds }) {
  const type = a.recordType || recordType;
  const ids = [...new Set((recordIds || []).filter(Boolean))].slice(0, 500);
  const records = [];
  for (const id of ids) {
    const row = await loadRecord(admin, type, id, a.projectId);
    if (row && a.projectId && row.project_id === a.projectId) records.push(row);
  }
  return { type, records };
}

// Dry run: conditions and each step's resolved inputs and gate outcome per record, without writing anything.
// → { automation, recordType, records: [{ recordId, label, matched, conditions, steps: [{ index, type, summary,
//   outcome: run|approval|suggest|skip|defer|wait|stop|review|control, message, amount?, recipients? }] }] }
export async function simulateLaunch(admin, { automationId, projectId = null, recordType, recordIds, overrides = {}, now = new Date() }) {
  const a = await loadAutomation(admin, automationId, projectId);
  if (!a?.projectId || (projectId && a.projectId !== projectId)) return null;
  const { type, records } = await launchTargets(admin, a, { recordType, recordIds });
  const pass = newPass(now);
  const proj = await projectContext(admin, pass, a.projectId);
  const out = [];
  for (const record of records) {
    const explanation = buildExplanation(a, { eventType: "manual", record, recordType: type, context: { preview: true } });
    const refs = refsFor(type, record, a.projectId);
    const { guardrails, tz } = await guardrailsFor(admin, pass, a.projectId, record.property_id || null);
    const { values } = await buildMergeValues(admin, refs, { now });
    const ctx = {
      automation: a,
      run: { id: "preview", metadata: { explanation } },
      pass,
      projectId: a.projectId,
      record,
      recordType: type,
      recordLabel: recordTitle(type, record),
      refs,
      values,
      config: proj.config,
      now,
      tz,
      guardrails,
      log: [],
      dryRun: true,
    };
    const steps = [];
    let afterWait = false;
    for (let i = 0; i < a.steps.length; i += 1) {
      const step = applyOverrides(a.steps[i], overrides);
      const base = { index: i, type: step.type, stepId: step.id || null, summary: stepSummary(step), afterWait };
      if (step.type === "wait") {
        steps.push({ ...base, outcome: "wait", message: `Then waits ${Number(step.config?.days) || 0} day(s)` });
        afterWait = true;
        continue;
      }
      if (step.type === "branch") {
        const check = explainConditions(step.config?.conditions, record, type);
        if (check.matched || afterWait) {
          steps.push({ ...base, outcome: "control", message: afterWait ? "Checked again when the run gets here" : "Condition holds now" });
          continue;
        }
        if (step.config?.otherwise === "skip") {
          const n = Math.max(1, Number(step.config?.skip) || 1);
          steps.push({ ...base, outcome: "control", message: `Condition doesn't hold — skips the next ${n}` });
          i += n;
          continue;
        }
        steps.push({ ...base, outcome: "stop", message: "Condition doesn't hold — the run would stop here" });
        break;
      }
      if (step.type === "request_approval") {
        steps.push({ ...base, outcome: "approval", message: "Waits for approval in the Review Queue" });
        continue;
      }
      try {
        const prepared = await prepareStep(admin, step, { ...ctx, stepIndex: i });
        const partyRecipient = step.type === "send_email" && ["tenant", "vendor", "owner", "applicant"].includes(step.config?.recipient || "tenant");
        const addressed = (prepared.recipients || []).filter((p) => ((prepared.channel || "email") === "sms" ? p.phone : p.email));
        if (partyRecipient && !addressed.length) {
          const code = prepared.recipients?.length ? "no_recipient_email" : "no_recipient";
          steps.push({ ...base, outcome: "review", reasonCode: code, message: reasonOf(code).explain({ recipient: partyNames(prepared.recipients || []), workflow: a.name, recordLabel: ctx.recordLabel, recipientType: step.config?.recipient }) });
          continue;
        }
        const verdict = await gate(admin, step, ctx, prepared);
        const outcome =
          verdict.result === "allow" ? "run" : verdict.result === "review" ? (verdict.kind === "decision" ? "suggest" : "approval") : verdict.result;
        steps.push({
          ...base,
          outcome,
          action: describeAction(step, prepared),
          message:
            verdict.result === "allow"
              ? describeAction(step, prepared)
              : verdict.result === "defer"
                ? `Held for quiet hours until ${fmtTime(verdict.until)}`
                : verdict.result === "skip"
                  ? verdict.notes.join("; ")
                  : reasonOf(verdict.reasonCode).explain({ workflow: a.name, recordLabel: ctx.recordLabel, action: describeAction(step, prepared), amount: prepared.amount, ...(verdict.context || {}) }),
          amount: prepared.amount ?? null,
          recipients: (verdict.recipients || prepared.recipients || []).map((p) => p.name || p.email),
          subject: prepared.input?.subject || null,
          templateId: prepared.input?.templateId || null,
        });
      } catch (e) {
        const code = reasonFromError(e);
        steps.push({ ...base, outcome: "review", reasonCode: code, message: e?.message || reasonOf(code).title });
      }
    }
    out.push({
      recordId: record.id,
      label: recordTitle(type, record),
      matched: explanation.conditions.matched,
      conditions: explanation.conditions,
      steps,
    });
  }
  return {
    automation: { id: a.id, name: a.name, autonomy: a.autonomy, triggerEvent: a.triggerEvent, steps: a.steps },
    recordType: type,
    records: out,
    missing: (recordIds || []).length - records.length,
  };
}

// Start runs by hand on the chosen records ("manual" trigger), then execute them now (up to `executeLimit`; the
// rest wait for the runner). Conditions still apply: an unmatched record gets a skipped run, never a run.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function launchRuns(admin, { automationId, projectId = null, recordType, recordIds, overrides = {}, actor = null, source = {}, launchId: requestedId = null, now = new Date(), executeLimit = 25 }) {
  const a = await loadAutomation(admin, automationId, projectId);
  if (!a?.projectId || (projectId && a.projectId !== projectId)) return null;
  if (!a.steps.length) return { launchId: null, runs: [], started: 0, skipped: 0, error: "This workflow has no steps." };
  const { type, records } = await launchTargets(admin, a, { recordType, recordIds });
  const launchId = UUID.test(String(requestedId || "")) ? requestedId : crypto.randomUUID();
  const by = actor ? { id: actor.id || null, name: actor.name || actor.email || "A teammate" } : null;
  const result = emptyResult();
  const runs = [];
  for (const record of records) {
    const explanation = buildExplanation(a, { eventType: "manual", actor: by, record, recordType: type, context: { ...source, launchedBy: by?.name || null, launchId } });
    if (!explanation.conditions.matched) {
      await createRun(admin, a, { dedupeKey: `skip:manual:${launchId}:${record.id}`, eventType: "manual", recordType: type, record, now, explanation, status: "skipped", createdBy: by?.id || null });
      runs.push({ recordId: record.id, runId: null, status: "skipped" });
      result.skipped += 1;
      continue;
    }
    const runId = await createRun(admin, a, {
      dedupeKey: `manual:${launchId}:${record.id}`,
      eventType: "manual",
      recordType: type,
      record,
      now,
      explanation,
      createdBy: by?.id || null,
      metadata: { launch: { ...source, id: launchId, by }, ...(Object.keys(overrides || {}).length ? { overrides } : {}) },
    });
    if (runId) runs.push({ recordId: record.id, runId, status: "pending" });
  }
  let executed = 0;
  for (const run of runs) {
    if (!run.runId || executed >= executeLimit) continue;
    const res = await executeRunById(admin, run.runId, { projectId: a.projectId, now });
    run.status = res?.status || run.status;
    executed += 1;
  }
  return { launchId, runs, started: runs.filter((r) => r.runId).length, skipped: result.skipped };
}
