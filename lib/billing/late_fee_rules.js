import { computeLateFee } from "@/lib/policies";
import { addPeriods, daysBetween, dueDateFor, maxDate, minDate, periodOf, round2 } from "./periods";
import { BILLABLE_STATUSES, isAcceptedRenewal, leaseFacts } from "./rent";

// Pure late-fee rules (CORE-06): keys, history, lease-level stops and each rent month's cumulative target; no I/O, safe in the browser.

// Leases late fees run on: live statuses (Eviction stops below) and accepted renewals still Pending, which already bill (CORE-01).
const LEGACY_LIVE = ["active", "current"];
export const LATE_FEE_STATUSES = [...BILLABLE_STATUSES, "Pending", ...LEGACY_LIVE];
export function isLateFeeLease(lease) {
  const l = leaseFacts(lease);
  return Boolean(l) && (BILLABLE_STATUSES.includes(l.status) || LEGACY_LIVE.includes(l.status) || isAcceptedRenewal(l));
}

// Keys (file 1 registry, permanent): late:<leaseId>:<YYYY-MM> is a month's first assessment (shared with the manual post and the post_charge automation step), late:<leaseId>:<YYYY-MM>:<YYYY-MM-DD> each later increment on that business date.
export const lateKey = (leaseId, period) => `late:${leaseId}:${period}`;
export const lateDayKey = (leaseId, period, date) => `late:${leaseId}:${period}:${date}`;

const PERIOD = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isOn = (v) => v === true || v === "true";
const metaOf = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});

// late: key → { owner, period, date }, else null (late2: belongs to CORE-19).
export function parseLateKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] !== "late" || !PERIOD.test(parts[2] || "")) return null;
  if (parts.length === 3) return { owner: parts[1], period: parts[2], date: null };
  if (parts.length === 4 && DATE.test(parts[3])) return { owner: parts[1], period: parts[2], date: parts[3] };
  return null;
}

export const emptyLateHistory = () => ({ posted: 0, own: 0, inherited: 0, waived: false, keys: [] });

// Late-fee history from normalized entries (any status, soft-deleted ones flagged deletedAt) → Map leaseId → { [period]: { posted, own, inherited, waived, keys } }; a voided fee marks the month waived, keys list every key used.
export function summarizeLateEntries(entries) {
  const out = new Map();
  const seen = new Set();
  for (const e of entries || []) {
    if (!e?.id || seen.has(e.id)) continue;
    seen.add(e.id);
    const k = parseLateKey(e.idempotencyKey);
    if (!k || !e.leaseId || k.owner !== e.leaseId) continue;
    const byPeriod = out.get(e.leaseId) || {};
    out.set(e.leaseId, byPeriod);
    const h = byPeriod[k.period] || (byPeriod[k.period] = emptyLateHistory());
    h.keys.push(e.idempotencyKey);
    if (e.deletedAt || e.reversalOf) continue;
    if (e.status === "void") h.waived = true;
    else {
      h.own = round2(h.own + (Number(e.total) || 0));
      h.posted = h.own;
    }
  }
  return out;
}

// Why a lease gets no late fees at all, else null; `plan` is CORE-14's active plan ({ status, inGoodStanding, suspendLateFees }).
export const isEviction = (lease) => String(lease?.status || "") === "Eviction" || isOn(metaOf(lease).evictionActive);
export function lateFeeStop({ lease, tenant, policies, plan }) {
  if (lease && !isLateFeeLease(lease)) return "inactive";
  if (!policies || !policies.lateFeeType || policies.lateFeeType === "none") return "no_fee";
  if (isOn(metaOf(tenant).lateFeeExempt)) return "exempt";
  if (isEviction(lease) && !isOn(policies.lateFeesDuringEviction)) return "eviction";
  if (plan && plan.status === "Active" && plan.inGoodStanding !== false && plan.suspendLateFees !== false) return "payment_plan";
  return null;
}

export const LATE_FEE_STATUS = {
  due: "Due now",
  posted: "Up to date",
  capped: "At the maximum",
  grace: "In grace period",
  paid: "Rent paid",
  min_balance: "Under the minimum balance",
  waived: "Waived (fee voided)",
  no_fee: "No late fee",
  exempt: "Tenant exempt",
  eviction: "Eviction — fees off",
  payment_plan: "On a payment plan",
  inactive: "Lease isn't live",
};

// Open rent per month after unapplied credit (applied to the oldest rent first) → Map period → { open, from, fromLeaseIds }; `from` is the oldest still-open rent date.
// `kinds` widens what counts as a month's rent: payment-plan installments too when lateFeeOnInstallments is on (CORE-14).
export function openRentByPeriod(items, credit = 0, kinds = ["rent"]) {
  const rent = (items || []).filter((i) => kinds.includes(i.kind) && i.period && Number(i.open) > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let left = Math.max(0, round2(credit));
  const out = new Map();
  for (const i of rent) {
    const take = round2(Math.min(left, i.open));
    left = round2(left - take);
    const rest = round2(i.open - take);
    const p = out.get(i.period) || { open: 0, from: "", fromLeaseIds: [] };
    p.open = round2(p.open + rest);
    if (rest > 0.004) p.from = minDate(p.from, i.date);
    if (i.fromLeaseId && !p.fromLeaseIds.includes(i.fromLeaseId)) p.fromLeaseIds.push(i.fromLeaseId);
    out.set(i.period, p);
  }
  return out;
}

// Late-fee base per month: the lease's billed rent plus what the leases its open rent was carried from billed that month (rentLedger from loadRentLedger).
export function billedRentByPeriod(rentLedger, leaseId, items) {
  const sources = new Map();
  const add = (period, id) => sources.set(period, new Set([...(sources.get(period) || []), id]));
  for (const period of rentLedger?.get(leaseId)?.keys() || []) add(period, leaseId);
  for (const i of items || []) if (i.kind === "rent" && i.fromLeaseId && i.period) add(i.period, i.fromLeaseId);
  const out = new Map();
  for (const [period, ids] of sources) out.set(period, round2([...ids].reduce((s, id) => s + (Number(rentLedger?.get(id)?.get(period)?.total) || 0), 0)));
  return out;
}

const capOf = (policies) => (Number(policies?.maxLateFee) > 0 ? round2(policies.maxLateFee) : null);

// One lease's late fees on business date `today` → { stop, periods: [{ period, due, daysLate, base, open, target, posted, delta, status, key, first }] }.
// Per rent month: target = computeLateFee(policies, billed rent, days late) capped by maxLateFee; post target − posted (posted spans leases the rent was carried from) under the month key, then a dated key; months before `startsOn` or more than `catchUpMonths` back are left alone.
// A payment plan in good standing (CORE-14) suspends rent months; with lateFeeOnInstallments its installments still accrue, each month's base being the installments billed in it.
export function planLateFees({ leaseId, lease, policies, tenant = null, plan = null, receivable, billed, today, startsOn = "", catchUpMonths = 3 }) {
  const leaseStop = lateFeeStop({ lease, tenant, policies, plan });
  const onInstallments = isOn(policies?.lateFeeOnInstallments);
  const planOnly = leaseStop === "payment_plan" && onInstallments;
  const stop = planOnly ? null : leaseStop;
  const kinds = planOnly ? ["installment"] : onInstallments ? ["rent", "installment"] : ["rent"];
  const rec = receivable || { items: [], credit: 0, lateFees: {} };
  const history = rec.lateFees || {};
  const open = openRentByPeriod(rec.items, rec.credit, kinds);
  const rentOpen = planOnly ? openRentByPeriod(rec.items, rec.credit) : null;
  const installmentBase = new Map();
  for (const i of rec.items || []) if (i.kind === "installment" && kinds.includes("installment")) installmentBase.set(i.period, round2((installmentBase.get(i.period) || 0) + (Number(i.amount) || 0)));
  const floor = catchUpMonths === null || catchUpMonths === undefined ? "" : addPeriods(periodOf(today), -Number(catchUpMonths));
  const minBalance = Math.max(0, Number(policies?.lateFeeMinBalance) || 0);
  const grace = Number(policies?.graceDays) || 0;
  const cap = capOf(policies);
  const months = [...new Set([...open.keys(), ...Object.keys(history)])].sort();
  const periods = [];
  for (const period of months) {
    const o = open.get(period) || { open: 0, from: "" };
    const due = maxDate(dueDateFor(period, policies?.rentDueDay), o.from);
    if (due > today || (floor && period < floor) || (startsOn && due < startsOn)) continue;
    const h = history[period] || emptyLateHistory();
    const daysLate = daysBetween(due, today);
    const base = round2((planOnly ? 0 : Number(billed?.get?.(period)) || 0) + (installmentBase.get(period) || 0));
    const target = daysLate > 0 ? computeLateFee(policies, base, daysLate) : 0;
    const posted = round2(h.posted);
    let status = stop;
    if (!status) {
      if (planOnly && o.open <= 0.004 && (rentOpen.get(period)?.open || 0) > 0.004) status = "payment_plan";
      else if (o.open <= minBalance + 0.004) status = o.open > 0.004 ? "min_balance" : "paid";
      else if (h.waived) status = "waived";
      else if (target <= 0) status = daysLate <= grace ? "grace" : "no_fee";
      else if (target - posted < 0.005) status = cap !== null && target >= cap ? "capped" : "posted";
    }
    const key = h.keys.includes(lateKey(leaseId, period)) ? lateDayKey(leaseId, period, today) : lateKey(leaseId, period);
    const delta = status ? 0 : round2(target - posted);
    periods.push({ period, due, daysLate, base, open: o.open, target, posted, delta, status: status || "due", key, first: !h.keys.length && !(h.inherited > 0) });
  }
  return { stop, periods };
}

// Warnings for the Late Fees tab (warn, never block): an uncapped daily fee, and a state whose Legal Resources cover late fees (HOUS-12 adds checked caps).
export function lateFeeWarnings(policies, { stateName = "", sources = 0 } = {}) {
  const out = [];
  if (policies?.lateFeeType === "daily" && capOf(policies) === null) out.push("Daily late fees have no maximum, so they grow every day until rent is paid. Set a maximum late fee in Fees & Policies.");
  if (stateName && sources > 0 && policies?.lateFeeType !== "none") {
    out.push(`${stateName} law limits late fees or when they can start. Geiger doesn't check your policy against it yet — review the sources below.`);
  }
  return out;
}
