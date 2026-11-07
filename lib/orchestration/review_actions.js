import { executeJobByKey } from "@/lib/jobs/execute";
import { approveRunStep, launchRuns, rejectRun, rerunFromFailed } from "@/lib/automations/runner";
import { approveBill, rejectBill } from "./bill_approval";
import { proposedActionHandler } from "./proposed_actions";
import { closeReview, logReviewActivity, normalizeReview } from "./review";

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

async function loadItem(admin, projectId, id) {
  const { data } = await admin.from("review_items").select("*").eq("id", id).maybeSingle();
  if (!data || data.deleted_at) throw new Error("Review item not found.");
  if (projectId && data.project_id && data.project_id !== projectId) throw new Error("That item belongs to another project.");
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

async function retry(admin, row, actor, adjust = null) {
  if (row.source_type === "job_run" || row.metadata?.jobKey) {
    const res = await executeJobByKey(row.metadata?.jobKey, { admin, projectId: row.project_id, trigger: "manual", actorId: actor?.id || null });
    if (res?.status === "succeeded") {
      return { item: await closeReview(admin, row, { action: "retry", note: "The job ran cleanly", actor }), message: "Job re-ran without errors." };
    }
    return { item: normalizeReview(await appendHistory(admin, row, { action: "retry", by: byName(actor), note: res?.errors?.[0] || "Still failing" })), message: `Still failing: ${res?.errors?.[0] || res?.error || "see the job history"}`, ok: false };
  }
  const runId = runIdOf(row);
  if (!runId) throw new Error("This item has nothing to retry.");
  const res = await rerunFromFailed(admin, runId, { adjust, actor });
  if (!res) throw new Error("The workflow run no longer exists.");
  if (res.paused) return { item: normalizeReview(row), message: "Automations are paused — resume them to retry.", ok: false };
  if (["failed", "retrying"].includes(res.status)) {
    const { data } = await admin.from("review_items").select("*").eq("id", row.id).single();
    return { item: normalizeReview(data), message: `Still failing: ${res.error || "see the run"}`, ok: false, run: res };
  }
  const note = res.status === "completed" ? "The run completed" : `The run continued (${res.status.replace(/_/g, " ")})`;
  return { item: await creditResolution(admin, row.id, adjust ? "adjusted_and_retried" : "retry", actor, note), message: note, run: res };
}

async function decide(admin, row, actor, approve, note) {
  if (row.source_type === "bill") {
    const res = approve
      ? await approveBill(admin, { projectId: row.project_id, billId: row.source_id, actor, note })
      : await rejectBill(admin, { projectId: row.project_id, billId: row.source_id, actor, note });
    const { data } = await admin.from("review_items").select("*").eq("id", row.id).single();
    const item = CLOSED.includes(data.status) ? normalizeReview(data) : await closeReview(admin, data, { action: approve ? "approved" : "rejected", note, actor });
    return { item, message: res.message };
  }
  const runId = runIdOf(row);
  if (!runId) throw new Error("This item has nothing to approve.");
  const item = await closeReview(admin, row, { action: approve ? "approved" : "rejected", note, actor });
  if (!approve) {
    await rejectRun(admin, runId, { actor, note });
    return { item, message: "Rejected — the run stopped." };
  }
  const run = await approveRunStep(admin, runId, row.proposed_action?.step, { actor, note });
  return { item, message: run?.paused ? "Approved — it runs when automations are resumed." : `Approved — the run is ${String(run?.status || "queued").replace(/_/g, " ")}.`, run };
}

async function runSuggested(admin, row, actor, input) {
  const proposed = row.proposed_action || {};
  if (proposed.type === "resume_run") {
    const item = await closeReview(admin, row, { action: "ran_suggested", note: proposed.summary || "", actor });
    const run = await approveRunStep(admin, proposed.runId, proposed.step, { actor, note: "Ran the suggestion" });
    return { item, message: `Done — the run is ${String(run?.status || "queued").replace(/_/g, " ")}.`, run };
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
  const res = await handler(admin, normalizeReview(row), { actor, input });
  if (!res?.ok) return { item: normalizeReview(row), message: res?.message || "Couldn't run the suggestion.", ok: false };
  const { data } = await admin.from("review_items").select("*").eq("id", row.id).single();
  const item =
    res.resolve === false || CLOSED.includes(data.status)
      ? normalizeReview(data)
      : await closeReview(admin, data, { action: "ran_suggested", note: res.message || "", actor, extra: res.links ? { links: res.links } : {} });
  return { item, message: res.message || "Done.", links: res.links };
}

// → { ok, item, message, run? }
export async function actOnReview(admin, { projectId, id, action, input = {}, actor = null }) {
  if (!REVIEW_ACTIONS.includes(action)) throw new Error(`Unknown action "${action}".`);
  const row = await loadItem(admin, projectId, id);
  if (CLOSED.includes(row.status) && action !== "comment") throw new Error("This item is already closed.");
  const note = String(input.note || "").trim().slice(0, 2000);
  let out;
  switch (action) {
    case "resolve":
      out = { item: await closeReview(admin, row, { action: "resolved", note, actor }), message: "Resolved." };
      break;
    case "dismiss":
      out = { item: await closeReview(admin, row, { status: "dismissed", action: "dismissed", note, actor }), message: "Dismissed." };
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
      break;
    }
    case "comment":
      out = { item: normalizeReview(await appendHistory(admin, row, { action: "comment", by: byName(actor), note })), message: "Note added." };
      break;
    case "retry":
      out = await retry(admin, row, actor);
      break;
    case "adjust_and_retry": {
      const step = Number.isInteger(input.step) ? input.step : row.proposed_action?.step;
      if (!Number.isInteger(step) || !input.config || typeof input.config !== "object") throw new Error("Say which step to change and how.");
      out = await retry(admin, row, actor, { step, config: input.config });
      break;
    }
    case "approve":
      out = await decide(admin, row, actor, true, note);
      break;
    case "reject":
      out = await decide(admin, row, actor, false, note);
      break;
    case "run_suggested":
      out = await runSuggested(admin, row, actor, input);
      break;
    default:
      throw new Error(`Unknown action "${action}".`);
  }
  if (out.item) await logReviewActivity(admin, out.item, `${out.item.title}: ${out.message}`, actor);
  return { ok: out.ok !== false, ...out };
}

// Bulk resolve / dismiss / snooze / reassign; each item is handled (and audited) on its own.
export async function actOnReviews(admin, { projectId, ids, action, input = {}, actor = null }) {
  if (!BULK_ACTIONS.includes(action)) throw new Error(`"${action}" can't be done in bulk.`);
  const results = [];
  for (const id of [...new Set(ids || [])].slice(0, 200)) {
    try {
      const res = await actOnReview(admin, { projectId, id, action, input, actor });
      results.push({ id, ok: res.ok, item: res.item });
    } catch (e) {
      results.push({ id, ok: false, error: e?.message || String(e) });
    }
  }
  return { ok: results.every((r) => r.ok), results, done: results.filter((r) => r.ok).length };
}
