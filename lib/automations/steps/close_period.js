import { raiseReview } from "@/lib/orchestration/review";
import { checklistSnapshot, runCloseChecks } from "@/lib/accounting/close_checks";
import { firstOpenDate, monthLabel, shortDate } from "@/lib/ledger/periods";
import { closingPeriod } from "./month_end_checks";

// close_period (Month-end close checklist playbook, CORE-40): after the run's approval, locks the closing month in the books when every close
// check passes. Out of order, unapproved or failing checks lock nothing: it hands a person the close in General Ledger → Close periods instead.

const isoDay = (d) => d.toISOString().slice(0, 10);

// The latest approval recorded on the run ({ by, byId, at }) or null.
export function latestApproval(run) {
  const all = Object.values(run?.metadata?.approvals || {}).filter((a) => a && typeof a === "object");
  return all.sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))).pop() || null;
}

// What the step does for a lock date and the checks → { action: "skip" | "handoff" | "close", reason }. Pure.
export function closeDecision({ period, lockedThrough, today, approved, failing = [] }) {
  if (!approved) return { action: "handoff", reason: "Closing the books needs an approval step before this one." };
  if (lockedThrough && lockedThrough >= period.end) return { action: "skip", reason: `${period.label} is already closed.` };
  if (period.end >= today) return { action: "handoff", reason: `${period.label} hasn't ended yet.` };
  if (lockedThrough && firstOpenDate(lockedThrough) !== period.start) {
    return { action: "handoff", reason: `${monthLabel(firstOpenDate(lockedThrough))} isn't closed yet, and periods close in order.` };
  }
  if (failing.length) return { action: "handoff", reason: `${failing.length === 1 ? "1 check still fails" : `${failing.length} checks still fail`}: ${failing.map((c) => c.label.toLowerCase()).join("; ")}.` };
  return { action: "close", reason: "" };
}

async function handOff(admin, ctx, period, reason) {
  await raiseReview(admin, {
    projectId: ctx.projectId,
    dedupeKey: `close:${period.key}:finish`,
    kind: "task",
    sourceType: "automation_run",
    sourceId: ctx.run.id,
    title: `${period.label} close: finish it in General Ledger`,
    reasonCode: "readiness_blocker",
    context: { note: `${reason} Open General Ledger → Close periods to close ${period.label}; failing checks can be overridden there with a note.` },
    severity: "soon",
    metadata: { automationId: ctx.automation.id, runId: ctx.run.id, period: period.key, check: "close_period" },
  });
}

export const closePeriodStep = {
  prepare(admin, step, ctx) {
    const period = closingPeriod(ctx.now, step.config?.period);
    return { input: { period: period.key, periodEnd: period.end } };
  },

  async perform(admin, step, ctx, prepared) {
    const period = closingPeriod(ctx.now, step.config?.period);
    const approval = latestApproval(ctx.run);
    const { data, error } = await admin.rpc("ledger_locked_through", { p_project: ctx.projectId });
    if (error) throw new Error(`lock date: ${error.message}`);
    const lockedThrough = data ? String(data).slice(0, 10) : "";
    const base = { period, lockedThrough, today: isoDay(ctx.now), approved: Boolean(approval) };
    let decision = closeDecision(base);
    let checks = [];
    if (decision.action === "close") {
      checks = await runCloseChecks(admin, ctx.projectId, period);
      decision = closeDecision({ ...base, failing: checks.filter((c) => !c.ok) });
    }
    if (decision.action === "skip") return { status: "ok", message: decision.reason, input: prepared.input };
    if (decision.action === "handoff") {
      await handOff(admin, ctx, period, decision.reason);
      return { status: "warning", message: `${period.label} not locked — ${decision.reason} A task is in the Review Queue.`, input: prepared.input };
    }
    const { data: id, error: closeError } = await admin.rpc("accounting_period_close", {
      p_project: ctx.projectId,
      p_period_end: period.end,
      p_checklist: checklistSnapshot(checks),
      p_actor_name: `Month-end close playbook (approved by ${approval.by || "a teammate"})`,
      p_actor: approval.byId || null,
    });
    if (closeError) {
      await handOff(admin, ctx, period, closeError.message);
      return { status: "warning", message: `${period.label} not locked — ${closeError.message}`, input: prepared.input };
    }
    return {
      status: "ok",
      message: `Closed ${period.label} — books closed through ${shortDate(period.end)}`,
      input: prepared.input,
      output: { periodId: id, lockedThrough: period.end },
    };
  },
};
