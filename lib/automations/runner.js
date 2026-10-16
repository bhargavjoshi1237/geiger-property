import { effectivePolicies } from "@/lib/policies";
import { getNotificationConfig } from "@/lib/email/notifications";
import { buildMergeValues, getProjectSetting } from "@/lib/messaging/context";
import { renderMerge } from "@/lib/messaging/merge_fields";
import { deliver } from "@/lib/messaging/deliver";
import { sendPartyMessage } from "@/lib/messaging/send";
import { loadParty, logActivity } from "@/lib/messaging/threads";
import { emptyResult } from "@/lib/jobs/contract";
import {
  RECORD_TYPES,
  TABLE_RECORD_TYPE,
  evaluateConditions,
  normalizeTriggerKey,
  recordTitle,
  triggerRecordType,
} from "./catalog";

// Server-only workflow runner (the `automations` scheduled job). Each pass:
// 1) drains property.automation_events into runs, 2) fires timed triggers
// (lease ending, rent overdue, schedules), 3) executes due runs step by step.
// Idempotent: runs are unique per (automation_id, dedupe_key), each step's
// progress is persisted before the next, and runs are claimed before executing.

const DAY = 86400000;
const isoDay = (d) => d.toISOString().slice(0, 10);
const AUTOMATION_ACTOR = { id: null, name: "Automation", email: "" };

const scoped = (q, projectId) => (projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q);

async function select(admin, table, apply = (q) => q) {
  const { data, error } = await apply(admin.from(table).select("*").is("deleted_at", null));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function loadRecord(admin, type, id) {
  const table = RECORD_TYPES[type]?.table;
  if (!table || !id) return null;
  const { data } = await admin.from(table).select("*").eq("id", id).maybeSingle();
  return data && !data.deleted_at ? data : null;
}

function normalizeAutomation(row) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const triggerEvent = normalizeTriggerKey(row.trigger_event);
  const trigger = meta.trigger && typeof meta.trigger === "object" ? meta.trigger : {};
  return {
    id: row.id,
    projectId: row.project_id || null,
    name: row.name || "Automation",
    triggerEvent,
    trigger,
    recordType: triggerRecordType(triggerEvent, trigger),
    conditionRules: Array.isArray(meta.conditionRules) ? meta.conditionRules : [],
    steps: Array.isArray(meta.steps) ? meta.steps.filter((s) => s && s.type) : [],
    runCount: Number(row.run_count) || 0,
  };
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
    default:
      return { ...base, tenantId: row.tenant_id, leaseId: row.lease_id };
  }
}

// Insert a run unless (automation, dedupeKey) already exists. Returns true when created.
async function createRun(admin, a, { dedupeKey, eventId = null, eventType, recordType, record, now }) {
  const { data, error } = await admin
    .from("automation_runs")
    .upsert(
      {
        project_id: a.projectId || record?.project_id || null,
        automation_id: a.id,
        automation_name: a.name,
        dedupe_key: dedupeKey,
        event_id: eventId,
        event_type: eventType,
        record_type: recordType,
        record_id: record?.id || null,
        record_label: record ? recordTitle(recordType, record) : null,
        status: "pending",
        current_step: 0,
        steps: a.steps,
        log: [],
        started_at: now.toISOString(),
      },
      { onConflict: "automation_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`run: ${error.message}`);
  if (!data?.length) return false;
  a.runCount += 1;
  await admin
    .from("automations")
    .update({ run_count: a.runCount, last_run_on: isoDay(now) })
    .eq("id", a.id);
  return true;
}

// 1) Record events → runs.
async function drainEvents(admin, automations, { now, projectId, result }) {
  let q = admin.from("automation_events").select("*").eq("status", "pending").order("created_at").limit(500);
  if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
  const { data: events, error } = await q;
  if (error) throw new Error(`events: ${error.message}`);

  for (const ev of events || []) {
    result.processed += 1;
    const matches = automations.filter(
      (a) => a.triggerEvent === ev.event_type && (!a.projectId || !ev.project_id || a.projectId === ev.project_id),
    );
    let started = 0;
    let evError = null;
    if (matches.length) {
      const recordType = TABLE_RECORD_TYPE[ev.source_table] || matches[0].recordType;
      try {
        const record = await loadRecord(admin, recordType, ev.record_id);
        for (const a of matches) {
          // Skip records this automation created itself (no self-loops).
          if (record?.metadata?.createdByAutomation === a.id) continue;
          if (!evaluateConditions(a.conditionRules, record || {})) {
            result.skipped += 1;
            continue;
          }
          if (await createRun(admin, a, { dedupeKey: `event:${ev.id}`, eventId: ev.id, eventType: ev.event_type, recordType, record, now })) {
            result.created += 1;
            started += 1;
          }
        }
      } catch (e) {
        evError = e?.message || String(e);
        result.errors.push(`Event ${ev.event_type}: ${evError}`);
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

// 2) Timed triggers.
async function fireTimed(admin, automations, { now, result }) {
  const today = isoDay(now);
  const timed = automations.filter((a) => ["lease.ending", "rent.overdue", "schedule"].includes(a.triggerEvent));
  if (!timed.length) return;

  const policyCache = new Map();
  const policiesFor = async (projectId, propertyRow, leaseRow) => {
    const key = projectId || "none";
    if (!policyCache.has(key)) policyCache.set(key, await getProjectSetting(admin, projectId, "fees_policies"));
    return effectivePolicies({ company: policyCache.get(key), property: propertyRow, lease: leaseRow });
  };

  for (const a of timed) {
    try {
      const fire = async (recordType, record, dedupeKey) => {
        if (record && !evaluateConditions(a.conditionRules, record)) {
          result.skipped += 1;
          return;
        }
        if (await createRun(admin, a, { dedupeKey, eventType: a.triggerEvent, recordType, record, now })) result.created += 1;
      };

      if (a.triggerEvent === "lease.ending") {
        const days = Math.max(1, Number(a.trigger.daysBefore) || 60);
        const until = isoDay(new Date(now.getTime() + days * DAY));
        const leases = await select(admin, "leases", (q) =>
          scoped(q, a.projectId).gte("term_end", today).lte("term_end", until).not("status", "in", "(Ended,Draft)"),
        );
        for (const l of leases) await fire("lease", l, `lease.ending:${l.id}:${l.term_end}`);
      } else if (a.triggerEvent === "rent.overdue") {
        const daysOverdue = Math.max(1, Number(a.trigger.daysOverdue) || 5);
        const minBalance = Number(a.trigger.minBalance ?? 1);
        const tenants = await select(admin, "tenants", (q) => scoped(q, a.projectId).gt("balance", 0));
        const props = new Map((await select(admin, "properties", (q) => scoped(q, a.projectId))).map((p) => [p.id, p]));
        for (const t of tenants) {
          if (t.status === "Past" || Number(t.balance) < minBalance) continue;
          const policies = await policiesFor(t.project_id, props.get(t.property_id), null);
          const dueDay = Math.min(28, Number(policies.rentDueDay) || 1);
          if (now.getUTCDate() - dueDay < daysOverdue) continue;
          await fire("tenant", t, `rent.overdue:${t.id}:${today.slice(0, 7)}`);
        }
      } else if (a.triggerEvent === "schedule") {
        const freq = a.trigger.frequency || "weekly";
        let period = null;
        if (freq === "daily") period = today;
        else if (freq === "weekly" && String(now.getUTCDay()) === String(a.trigger.weekday ?? "1")) period = today;
        else if (freq === "monthly" && now.getUTCDate() >= (Number(a.trigger.monthDay) || 1)) period = today.slice(0, 7);
        if (!period) continue;
        const scope = a.trigger.scope || "none";
        if (scope === "active_leases") {
          const leases = await select(admin, "leases", (q) => scoped(q, a.projectId).eq("status", "Active"));
          for (const l of leases) await fire("lease", l, `schedule:${period}:${l.id}`);
        } else if (scope === "tenants_with_balance") {
          const tenants = await select(admin, "tenants", (q) => scoped(q, a.projectId).gt("balance", 0));
          for (const t of tenants) if (t.status !== "Past") await fire("tenant", t, `schedule:${period}:${t.id}`);
        } else {
          await fire(null, null, `schedule:${period}`);
        }
      }
    } catch (e) {
      result.errors.push(`${a.name}: ${e?.message || e}`);
    }
  }
}

// --- Step execution ----------------------------------------------------------

async function resolveRecipients(admin, step, ctx) {
  const c = step.config || {};
  const refs = ctx.refs;
  switch (c.recipient || "tenant") {
    case "tenant": {
      const p = await loadParty(admin, "tenant", refs.tenantId);
      return p ? [p] : [];
    }
    case "vendor": {
      const p = await loadParty(admin, "vendor", refs.vendorId);
      return p ? [p] : [];
    }
    case "owner": {
      if (!refs.propertyId) return [];
      const { data } = await admin
        .from("property_owners")
        .select("owner_id")
        .eq("property_id", refs.propertyId)
        .is("deleted_at", null);
      const owners = await Promise.all((data || []).map((l) => loadParty(admin, "owner", l.owner_id)));
      return owners.filter(Boolean);
    }
    case "applicant": {
      const r = ctx.record;
      if (!r?.email) return [];
      return [{ type: "other", id: null, name: r.applicant_name || r.name || "", email: r.email, phone: r.phone || "" }];
    }
    case "team":
      return (ctx.config.alertEmails || []).map((email) => ({ type: "team", id: null, name: "", email }));
    case "custom":
      return c.email ? [{ type: "other", id: null, name: c.name || "", email: c.email }] : [];
    default:
      return [];
  }
}

async function runStep(admin, step, ctx) {
  const c = step.config || {};
  const merge = (t) => renderMerge(t, ctx.values, { keepMissing: false });
  const ownerType = RECORD_TYPES[ctx.recordType]?.ownerType;

  switch (step.type) {
    case "send_email": {
      const recipients = await resolveRecipients(admin, step, ctx);
      if (!recipients.length) return { status: "warning", message: "No recipient with an address on file" };
      const outcomes = [];
      for (const party of recipients) {
        const res = await sendPartyMessage({
          db: admin,
          projectId: ctx.projectId,
          actor: AUTOMATION_ACTOR,
          party,
          channel: c.channel || "email",
          subject: c.subject,
          body: c.body,
          templateId: c.templateId || undefined,
          refs: ctx.refs,
          notification: c.recipient === "team" ? "staff_alerts" : "message",
          skipThread: c.recipient === "team",
          metadata: { automationId: ctx.automation.id, runId: ctx.run.id },
        });
        outcomes.push(res);
      }
      const failed = outcomes.filter((o) => !o.ok);
      if (failed.length === outcomes.length) throw new Error(failed[0]?.error || "Send failed");
      const statuses = [...new Set(outcomes.map((o) => o.status))].join(", ");
      const warn = outcomes.some((o) => o.status !== "sent");
      return {
        status: warn ? "warning" : "ok",
        message: `${outcomes.length} recipient${outcomes.length === 1 ? "" : "s"} — ${statuses}${
          warn && outcomes.find((o) => o.error) ? ` (${outcomes.find((o) => o.error).error})` : ""
        }`,
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
      const emails = new Set(c.emailTeam ? ctx.config.alertEmails || [] : []);
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
      return { status: "ok", message: sent.length ? `${message} (emailed ${sent.length}: ${[...new Set(sent)].join(", ")})` : message };
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
            createdByAutomation: ctx.automation.id,
            automationRunId: ctx.run.id,
          },
        })
        .select("id, name")
        .single();
      if (error) throw new Error(error.message);
      return { status: "ok", message: `Created work order "${data.name}"`, output: { workOrderId: data.id } };
    }

    case "update_status": {
      if (!c.status) return { status: "warning", message: "No status chosen" };
      const table = RECORD_TYPES[ctx.recordType]?.table;
      if (!table || !ctx.record?.id) return { status: "warning", message: "No record to update" };
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
      return { status: "ok", message: `Status set to ${c.status}` };
    }

    default:
      return { status: "warning", message: `Unknown step "${step.type}" skipped` };
  }
}

// Claim and execute one run from its current step.
async function executeRun(admin, run, { now, automations, configs }) {
  const { data: claimed } = await admin
    .from("automation_runs")
    .update({ status: "running" })
    .eq("id", run.id)
    .eq("status", run.status)
    .select("*");
  if (!claimed?.length) return "skipped";
  const r = claimed[0];

  const automation = automations.get(r.automation_id) || { id: r.automation_id, name: r.automation_name || "Automation" };
  const projectId = r.project_id || null;
  const record = r.record_type ? await loadRecord(admin, r.record_type, r.record_id) : null;
  const refs = refsFor(r.record_type, record, projectId);
  if (!configs.has(projectId || "none")) configs.set(projectId || "none", await getNotificationConfig(projectId, admin));
  const { values } = await buildMergeValues(admin, refs, { now });
  const ctx = {
    automation,
    run: r,
    projectId,
    record,
    recordType: r.record_type,
    recordLabel: r.record_label,
    refs,
    values,
    config: configs.get(projectId || "none"),
  };

  const steps = Array.isArray(r.steps) ? r.steps : [];
  const log = Array.isArray(r.log) ? [...r.log] : [];
  const save = (patch) => admin.from("automation_runs").update({ log, ...patch }).eq("id", r.id);

  for (let i = Number(r.current_step) || 0; i < steps.length; i += 1) {
    const step = steps[i];
    const at = new Date().toISOString();
    if (step.type === "wait") {
      const days = Math.max(0, Number(step.config?.days) || 0);
      const resumeAt = new Date(now.getTime() + days * DAY);
      log.push({ step: i, type: "wait", status: "waiting", message: `Waiting ${days} day${days === 1 ? "" : "s"} — resumes ${isoDay(resumeAt)}`, at });
      await save({ status: "waiting", current_step: i + 1, resume_at: resumeAt.toISOString() });
      return "waiting";
    }
    try {
      const out = await runStep(admin, step, ctx);
      log.push({ step: i, type: step.type, status: out.status, message: out.message, output: out.output, at });
      await save({ current_step: i + 1 });
    } catch (e) {
      const message = e?.message || String(e);
      log.push({ step: i, type: step.type, status: "error", message, at });
      await save({ status: "failed", error: message, finished_at: new Date().toISOString(), current_step: i });
      return "failed";
    }
  }
  await save({ status: "completed", finished_at: new Date().toISOString(), resume_at: null });
  return "completed";
}

// 3) Execute due runs.
async function executeDueRuns(admin, automations, { now, projectId, result }) {
  let q = admin
    .from("automation_runs")
    .select("*")
    .in("status", ["pending", "waiting"])
    .or(`resume_at.is.null,resume_at.lte."${now.toISOString()}"`)
    .is("deleted_at", null)
    .order("started_at")
    .limit(200);
  if (projectId) q = q.eq("project_id", projectId);
  const { data: runs, error } = await q;
  if (error) throw new Error(`runs: ${error.message}`);

  const byId = new Map(automations.map((a) => [a.id, a]));
  const configs = new Map();
  for (const run of runs || []) {
    // A paused/disabled automation leaves its waiting runs parked.
    if (!byId.has(run.automation_id)) {
      result.skipped += 1;
      continue;
    }
    const outcome = await executeRun(admin, run, { now, automations: byId, configs });
    result.processed += 1;
    if (outcome === "failed") result.errors.push(`${run.automation_name || "Automation"}: a step failed (see run history)`);
  }
}

export async function runAutomations({ admin, now = new Date(), projectId = null } = {}) {
  const result = emptyResult();
  if (!admin) return { ...result, errors: ["Service role not configured"] };
  try {
    let q = admin.from("automations").select("*").eq("enabled", true).is("deleted_at", null);
    if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
    const { data, error } = await q;
    if (error) throw new Error(`automations: ${error.message}`);
    const automations = (data || []).filter((r) => r.status !== "Paused").map(normalizeAutomation).filter((a) => a.steps.length);

    await drainEvents(admin, automations, { now, projectId, result });
    await fireTimed(admin, automations, { now, result });
    await executeDueRuns(admin, automations, { now, projectId, result });
  } catch (e) {
    result.errors.push(e?.message || String(e));
  }
  return result;
}
