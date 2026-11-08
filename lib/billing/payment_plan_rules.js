import { allocateOldestFirst } from "@/lib/ledger/postings";
import { addDays, addMonths, daysBetween, isoDate, round2 } from "./periods";

// Pure payment-plan rules (CORE-14): keys, the installment schedule, validation, what a plan defers and each installment's standing; safe in the browser.

export const PLAN_PERMISSION = "property.accounting.payment_plans";
export const PLAN_STATUSES = ["Draft", "Active", "Completed", "Defaulted", "Cancelled"];
export const INSTALLMENT_STATUSES = ["Scheduled", "Billed", "Paid", "Missed"];
export const PLAN_FREQUENCIES = ["Monthly", "Biweekly", "Weekly"];
export const OPEN_PLAN_STATUSES = ["Draft", "Active"];
export const MAX_INSTALLMENTS = 120;
export const DEFAULT_GRACE_DAYS = 5;

// Keys (file 1 registry, permanent): the deferral, each installment re-billed to AR, and the remainder posted back on default or cancel.
export const planDeferKey = (planId) => `plan:${planId}:defer`;
export const planInstallmentKey = (planId, seq) => `plan:${planId}:inst:${seq}`;
export const planAccelerateKey = (planId) => `plan:${planId}:accelerate`;

// plan: key → { planId, kind: "defer" | "inst" | "accelerate", seq? }, else null.
export function parsePlanKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] !== "plan" || !parts[1]) return null;
  if (parts.length === 3 && (parts[2] === "defer" || parts[2] === "accelerate")) return { planId: parts[1], kind: parts[2] };
  if (parts.length === 4 && parts[2] === "inst" && Number(parts[3]) > 0) return { planId: parts[1], kind: "inst", seq: Number(parts[3]) };
  return null;
}

export const installmentMemo = (seq, count) => `Payment plan ${seq} of ${count}`;
export const frequencyNoun = (frequency) => ({ Weekly: "weekly", Biweekly: "every two weeks", Monthly: "monthly" })[frequency] || "monthly";

// Due date of installment `seq` (1-based): weekly / every two weeks by day, monthly on the first due date's day of month (clamped).
export function installmentDueDate(firstDue, frequency, seq) {
  const i = Math.max(0, Number(seq) - 1);
  if (frequency === "Weekly") return addDays(firstDue, 7 * i);
  if (frequency === "Biweekly") return addDays(firstDue, 14 * i);
  return addMonths(firstDue, i, Number(String(firstDue).slice(8, 10)));
}

// What the installments finance: the total less the down payment.
export const financedOf = (plan) => round2(Number(plan?.totalAmount ?? plan?.total_amount ?? 0) - Number(plan?.downPayment ?? plan?.down_payment ?? 0));

// (total − down payment) split into `installmentCount` equal installments to the cent, the leftover cents on the last → [{ seq, dueDate, amount }].
export function buildSchedule({ totalAmount, downPayment = 0, installmentCount, frequency = "Monthly", firstDue }) {
  const count = Math.trunc(Number(installmentCount)) || 0;
  const cents = Math.round(financedOf({ totalAmount, downPayment }) * 100);
  const due = isoDate(firstDue);
  if (count < 1 || cents <= 0 || !due) return [];
  const each = Math.floor(cents / count);
  return Array.from({ length: count }, (_, i) => ({
    seq: i + 1,
    dueDate: installmentDueDate(due, frequency, i + 1),
    amount: (i === count - 1 ? cents - each * (count - 1) : each) / 100,
  }));
}

// Why a plan can't be set up as entered, else "" (`openTotal`: what the lease owes in open charges now).
export function validatePlan(input, { today, openTotal = null } = {}) {
  const total = round2(input?.totalAmount);
  const down = round2(input?.downPayment || 0);
  const count = Number(input?.installmentCount);
  const firstDue = isoDate(input?.firstDue);
  const grace = Number(input?.graceDays ?? DEFAULT_GRACE_DAYS);
  if (!(total > 0)) return "Enter the plan total.";
  if (down < 0) return "The down payment can't be negative.";
  if (down >= total) return "The down payment must be less than the plan total.";
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) return `Pick between 1 and ${MAX_INSTALLMENTS} installments.`;
  if (!PLAN_FREQUENCIES.includes(input?.frequency || "Monthly")) return "Pick weekly, every two weeks or monthly.";
  if (!firstDue) return "Pick the first installment's due date.";
  if (today && firstDue < today) return "The first installment can't be due before today.";
  if (!Number.isInteger(grace) || grace < 0 || grace > 60) return "The grace period must be 0 to 60 days.";
  if (Math.round((total - down) * 100) < count) return "Each installment must be at least $0.01.";
  if (openTotal !== null && total - round2(openTotal) > 0.004) {
    return `The plan total (${usd(total)}) is more than the lease owes in open charges (${usd(openTotal)}).`;
  }
  return "";
}

const usd = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Open charges dated before `today` (the past-due balance a plan defaults to).
export const pastDueOf = (items, today) => round2((items || []).filter((i) => !today || String(i.date) < today).reduce((s, i) => s + (Number(i.open) || 0), 0));
export const openTotalOf = (items) => round2((items || []).reduce((s, i) => s + (Number(i.open) || 0), 0));

// The open charges a plan defers, oldest first, up to `amount` → { allocations, short } (short > 0 when the lease owes less).
export function deferAllocations(items, amount) {
  const { allocations, unapplied } = allocateOldestFirst(items || [], round2(amount));
  return { allocations, short: round2(unapplied) };
}

// Each installment's standing on `today` from what its charge still has open → { installments, missed, paid, billed, scheduled, unbilled, open, nextDue, inGoodStanding, allPaid }.
// Billed with nothing open → Paid; still open past due + grace → Missed; an accelerated installment (default / cancel) keeps Billed until its share is paid.
export function planStanding(plan, installments, { openByEntry = new Map(), today } = {}) {
  const grace = Number(plan?.graceDays ?? plan?.grace_days ?? DEFAULT_GRACE_DAYS) || 0;
  const rows = [...(installments || [])].sort((a, b) => a.seq - b.seq);
  // An accelerate entry carries several installments: what has been paid on it settles them in schedule order.
  const paidPool = new Map();
  for (const r of rows.filter((x) => x.accelerated && x.chargeEntryId)) {
    if (paidPool.has(r.chargeEntryId)) continue;
    const total = round2(rows.filter((x) => x.accelerated && x.chargeEntryId === r.chargeEntryId).reduce((s, x) => s + round2(x.amount), 0));
    paidPool.set(r.chargeEntryId, round2(Math.max(0, total - (openByEntry.get(r.chargeEntryId) ?? total))));
  }
  const out = rows.map((i) => {
    const amount = round2(i.amount);
    if (!i.chargeEntryId) return { ...i, amount, open: 0, status: "Scheduled" };
    let open;
    if (i.accelerated) {
      const paid = Math.min(amount, paidPool.get(i.chargeEntryId) || 0);
      paidPool.set(i.chargeEntryId, round2((paidPool.get(i.chargeEntryId) || 0) - paid));
      open = round2(amount - paid);
    } else open = round2(Math.max(0, Math.min(amount, openByEntry.get(i.chargeEntryId) ?? amount)));
    const late = today && i.dueDate && daysBetween(i.dueDate, today) > grace;
    const status = open <= 0.004 ? "Paid" : late && !i.accelerated ? "Missed" : "Billed";
    return { ...i, amount, open, status };
  });
  const count = (s) => out.filter((i) => i.status === s).length;
  const unbilled = round2(out.filter((i) => i.status === "Scheduled").reduce((s, i) => s + i.amount, 0));
  const missed = count("Missed");
  return {
    installments: out,
    missed,
    paid: count("Paid"),
    billed: count("Billed"),
    scheduled: count("Scheduled"),
    unbilled,
    open: round2(out.reduce((s, i) => s + i.open, 0)),
    nextDue: out.find((i) => i.status !== "Paid") || null,
    inGoodStanding: missed === 0,
    allPaid: out.length > 0 && out.every((i) => i.status === "Paid"),
  };
}

// Open amount per installment charge from a lease's open AR items (a charge no longer open is paid) → Map entryId → open.
export function openByEntryOf(items, installments) {
  const open = new Map((items || []).map((i) => [i.entryId, round2(i.open)]));
  return new Map((installments || []).filter((i) => i.chargeEntryId).map((i) => [i.chargeEntryId, open.get(i.chargeEntryId) || 0]));
}

// Installments missed before a plan defaults (policy planDefaultAfterMissed; 0 = never automatically).
export function defaultsAfter(policies) {
  const n = Number(policies?.planDefaultAfterMissed);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 1;
}

export const shouldDefault = (standing, policies) => {
  const after = defaultsAfter(policies);
  return after > 0 && standing.missed >= after;
};

// CORE-06's late-fee seam: { status, inGoodStanding, suspendLateFees } for an active plan.
export const lateFeePlan = (plan, standing) =>
  plan ? { id: plan.id, status: plan.status, inGoodStanding: standing ? standing.inGoodStanding : true, suspendLateFees: plan.suspendLateFees !== false } : null;

export const PLAN_STATUS_LABEL = {
  Draft: "Draft",
  Active: "Active",
  Completed: "Completed",
  Defaulted: "Defaulted",
  Cancelled: "Cancelled",
};
