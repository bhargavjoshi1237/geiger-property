import { executeJobByKey } from "@/lib/jobs/execute";
import { approveRunStep, launchRuns, rejectRun, rerunFromFailed } from "@/lib/automations/runner";
import { approveBill, rejectBill } from "./bill_approval";
import { proposedActionHandler } from "./proposed_actions";
import { closeReview, logReviewActivity, normalizeReview, notifyAssignee } from "./review";
import { forProject } from "@/lib/supabase/scope";

// Review queue actions (server-only, admin client created with the actor's audit headers). Every action writes a
// history entry and an activity entry on the record; closing actions (resolve, dismiss, and any action that clears
// the cause) write a resolution — the database refuses to close an item without one.
//   resolve(note) · dismiss(note) · snooze(until) · reassign(assigneeId | assigneeRole) · comment(note)
//   retry() · adjust_and_retry({ step, config }) · approve(note) · reject(note) · run_suggested(input)

export const REVIEW_ACTIONS = ["resolve", "dismiss", "snooze", "reassign", "comment", "retry", "adjust_and_retry", "approve", "reject", "run_suggested"];
export const BULK_ACTIONS = ["resolve", "dismiss", "snooze", "reassign"];

const nowIso = () => new Date().toISOString();
const byName = (actor) => actor?.name || actor?.email || "A teammate";
const CLOSED = ["resolved", "dismissed"];

// Only the item's own project acts on it (read inside it, then checked); project-less job failures are operator-only (PLAT-01b).
async function loadItem(admin, projectId, id) {
  if (!projectId) throw new Error("That item belongs to another project.");
  const { data } = await forProject(admin.from("review_items").select("*").eq("id", id), projectId).maybeSingle();
  if (!data || data.deleted_at) throw new Error("Review item not found.");
  if (data.project_id !== projectId) throw new Error("That item belongs to another project.");
  return data;
}

async function appendHistory(admin, row, entry, patch = {}) {
  const { data, error } = await admin
    .from("review_items")
    .update({ ...patch, history: [...(row.history || []), { at: nowIso(), ...entry }] })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Record who cleared an item whose cause the runner already resolved (e.g. a retried run that completed).
async function creditResolution(admin, id, action, actor, note) {
  const { data } = await admin.from("review_items").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  if (!CLOSED.includes(data.status)) return closeReview(admin, data, { action, note, actor });
  const resolution = { ...(data.resolution || {}), action, note, by: byName(actor), byId: actor?.id || null, at: nowIso() };
  const { data: updated } = await admin
    .from("review_items")
    .update({ resolution, history: [...(data.history || []), { at: nowIso(), action, note, by: byName(actor) }] })
    .eq("id", id)
    .select("*")
    .single();
  return normalizeReview(updated);
}

const runIdOf = (row) => row.proposed_action?.runId || (row.source_type === "automation_run" ? row.source_id : null);

async function retry(admin, row, actor, adjust = null, { canRunJobs = false } = {}) {
  if (row.source_type === "job_run" || row.metadata?.jobKey) {
    if (!row.project_id) throw new Error("This job failure isn't tied to a project.");
    // Re-running a job is the scheduled jobs' "Run now", so it needs the same permission (PLAT-01f).
    if (!canRunJobs) throw new Error("Re-running a scheduled job needs the Manage settings permission.");
    // A retry reruns the job for the item's project only.
    const res = await executeJobByKey(row.metadata?.jobKey, { admin, projectId: row.project_id, trigger: "manual", actorId: actor?.id || null });
    if (res?.status === "succeeded") {
      return { item: await closeReview(admin, row, { action: "retry", note: "The job ran cleanly", actor }), message: "Job re-ran without errors." };
    }
    return { item: normalizeReview(await appendHistory(admin, row, { action: "retry", by: byName(actor), note: res?.errors?.[0] || "Still failing" })), message: `Still failing: ${res?.errors?.[0] || res?.error || "see the job history"}`, ok: false };
  }
  const runId = runIdOf(row);
  if (!runId) throw new Error("This item has nothing to retry.");
  const res = await rerunFromFailed(admin, runId, { projectId: row.project_id, adjust, actor });
  if (!res) throw new Error("The workflow run no longer exists.");
  if (res.paused) return { item: normalizeReview(row), message: "Automations are paused — resume them to retry.", ok: false };
  if (["failed", "retrying"].includes(res.status)) {
    const { data } = await admin.from("review_items").select("*").eq("id", row.id).single();
    return { item: normalizeReview(data), message: `Still failing: ${res.error || "see the run"}`, ok: false, run: res };
  }
  const note = res.status === "completed" ? "The run completed" : `The run continued (${res.status.replace(/_/g, " ")})`;
  return { item: await creditResolution(admin, row.id, adjust ? "adjusted_and_retried" : "retry", actor, note), message: note, run: res };
}

const isWaitingStep = (row) => row.proposed_action?.type === "resume_run";

async function decide(admin, row, actor, approve, note, { canPostLedger = false } = {}) {
  if (row.source_type === "bill") {
    if (approve && !canPostLedger) throw new Error("Approving a bill posts it to payables, which your role can't do.");
    const res = approve
      ? await approveBill(admin, { projectId: row.project_id, billId: row.source_id, actor, note })
      : await rejectBill(admin, { projectId: row.project_id, billId: row.source_id, actor, note });
    const { data } = await admin.from("review_items").select("*").eq("id", row.id).single();
    const item = CLOSED.includes(data.status) ? normalizeReview(data) : await closeReview(admin, data, { action: approve ? "approved" : "rejected", note, actor });
    return { item, message: res.message };
  }
  if (!isWaitingStep(row)) throw new Error("There's nothing to approve or reject on this item.");
  const runId = row.proposed_action.runId;
  // Advance (or stop) the run first, then close the item, so a failure never leaves a run waiting on a closed item.
  if (!approve) {
    await rejectRun(admin, runId, { projectId: row.project_id, actor, note });
    const item = await closeReview(admin, row, { action: "rejected", note, actor });
    return { item, message: "Rejected — the run stopped." };
  }
  const run = await approveRunStep(admin, runId, row.proposed_action.step, { projectId: row.project_id, actor, note });
  if (!run) throw new Error("The workflow run no longer exists.");
  const item = await closeReview(admin, row, { action: "approved", note, actor });
  return { item, message: run.paused ? "Approved — it runs when automations are resumed." : `Approved — the run is ${String(run.status || "queued").replace(/_/g, " ")}.`, run };
}

async function runSuggested(admin, row, actor, input, { canPostLedger = false } = {}) {
  const proposed = row.proposed_action || {};
  if (proposed.type === "resume_run") {
    const run = await approveRunStep(admin, proposed.runId, proposed.step, { projectId: row.project_id, actor, note: "Ran the suggestion" });
    if (!run) throw new Error("The workflow run no longer exists.");
    const item = await closeReview(admin, row, { action: "ran_suggested", note: proposed.summary || "", actor });
    return { item, message: `Done — the run is ${String(run.status || "queued").replace(/_/g, " ")}.`, run };
  }
  if (proposed.type === "launch") {
    const res = await launchRuns(admin, {
      automationId: proposed.automationId,
      projectId: row.project_id,
      recordType: proposed.recordType,
      recordIds: input.recordIds || proposed.recordIds,
      actor,
      source: { reviewItemId: row.id },
    });
    if (!res) throw new Error("That workflow no longer exists.");
    const item = await closeReview(admin, row, { action: "ran_suggested", note: `Started ${res.started} run(s)`, actor });
    return { item, message: `Started ${res.started} run${res.started === 1 ? "" : "s"}.` };
  }
  const handler = proposedActionHandler(proposed.type);
  if (!handler) throw new Error("There's no suggested action to run.");
  const res = await handler(admin, normalizeReview(row), { actor, input, canPostLedger });
  if (!res?.ok) return { item: normalizeReview(row), message: res?.message || "Couldn't run the suggestion.", ok: false };
  const { data } = await admin.from("review_items").select("*").eq("id", row.id).single();
  const item =
    res.resolve === false || CLOSED.includes(data.status)
      ? normalizeReview(data)
      : await closeReview(admin, data, { action: "ran_suggested", note: res.message || "", actor, extra: res.links ? { links: res.links } : {} });
  return { item, message: res.message || "Done.", links: res.links };
}

// → { ok, item, message, run? }
// Resolving or dismissing an item a run waits on stops that run (it would otherwise wait forever); a pending bill
// approval can only be closed by approving or rejecting the bill.
async function closeWaiting(admin, row, { status, action, note, actor }) {
  if (row.source_type === "bill") {
    const { data: bill } = await admin.from("bills").select("approval_status").eq("id", row.source_id).maybeSingle();
    if (String(bill?.approval_status || "").toLowerCase() === "pending") throw new Error("Approve or reject the bill instead — it's still waiting for a decision.");
  }
  if (isWaitingStep(row)) await rejectRun(admin, row.proposed_action.runId, { projectId: row.project_id, actor, note: note || `${action === "dismissed" ? "Dismissed" : "Resolved"} without running` });
  const item = await closeReview(admin, row, { status, action, note, actor });
  return { item, message: isWaitingStep(row) ? `${status === "dismissed" ? "Dismissed" : "Resolved"} — the waiting run was stopped.` : status === "dismissed" ? "Dismissed." : "Resolved." };
}

// canPostLedger / canRunJobs are the caller's accounting.post and settings.manage, checked by the route.
export async function actOnReview(admin, { projectId, id, action, input = {}, actor = null, canPostLedger = false, canRunJobs = false }) {
  if (!REVIEW_ACTIONS.includes(action)) throw new Error(`Unknown action "${action}".`);
  const row = await loadItem(admin, projectId, id);
  if (CLOSED.includes(row.status) && action !== "comment") throw new Error("This item is already closed.");
  const note = String(input.note || "").trim().slice(0, 2000);
  let out;
  switch (action) {
    case "resolve":
      out = await closeWaiting(admin, row, { status: "resolved", action: "resolved", note, actor });
      break;
    case "dismiss":
      out = await closeWaiting(admin, row, { status: "dismissed", action: "dismissed", note, actor });
      break;
    case "snooze": {
      const until = new Date(input.until);
      if (Number.isNaN(until.getTime()) || until <= new Date()) throw new Error("Pick a time in the future.");
      out = {
        item: normalizeReview(await appendHistory(admin, row, { action: "snoozed", by: byName(actor), note: `Until ${until.toISOString().slice(0, 16).replace("T", " ")} UTC` }, { status: "snoozed", snoozed_until: until.toISOString() })),
        message: "Snoozed.",
      };
      break;
    }
    case "reassign": {
      const patch = { assignee_id: input.assigneeId || null, assignee_role: input.assigneeRole || null };
      out = {
        item: normalizeReview(await appendHistory(admin, row, { action: "reassigned", by: byName(actor), note: input.assigneeLabel || input.assigneeRole || "Unassigned" }, patch)),
        message: input.assigneeId || input.assigneeRole ? "Reassigned." : "Unassigned.",
      };
      if (out.item.assigneeId || out.item.assigneeRole) await notifyAssignee(admin, out.item);
      break;
    }
    case "comment":
      out = { item: normalizeReview(await appendHistory(admin, row, { action: "comment", by: byName(actor), note })), message: "Note added." };
      break;
    case "retry":
      out = await retry(admin, row, actor, null, { canRunJobs });
      break;
    case "adjust_and_retry": {
      const step = Number.isInteger(input.step) ? input.step : row.proposed_action?.step;
      if (!Number.isInteger(step) || !input.config || typeof input.config !== "object") throw new Error("Say which step to change and how.");
      out = await retry(admin, row, actor, { step, config: input.config }, { canRunJobs });
      break;
    }
    case "approve":
      out = await decide(admin, row, actor, true, note, { canPostLedger });
      break;
    case "reject":
      out = await decide(admin, row, actor, false, note, { canPostLedger });
      break;
    case "run_suggested":
      out = await runSuggested(admin, row, actor, input, { canPostLedger });
      break;
    default:
      throw new Error(`Unknown action "${action}".`);
  }
  if (out.item) await logReviewActivity(admin, out.item, `${out.item.title}: ${out.message}`, actor);
  return { ok: out.ok !== false, ...out };
}

// Bulk resolve / dismiss / snooze / reassign; each item is handled (and audited) on its own.
export async function actOnReviews(admin, { projectId, ids, action, input = {}, actor = null, canPostLedger = false }) {
  if (!BULK_ACTIONS.includes(action)) throw new Error(`"${action}" can't be done in bulk.`);
  const results = [];
  for (const id of [...new Set(ids || [])].slice(0, 200)) {
    try {
      const res = await actOnReview(admin, { projectId, id, action, input, actor, canPostLedger });
      results.push({ id, ok: res.ok, item: res.item });
    } catch (e) {
      results.push({ id, ok: false, error: e?.message || String(e) });
    }
  }
  return { ok: results.every((r) => r.ok), results, done: results.filter((r) => r.ok).length };
}
