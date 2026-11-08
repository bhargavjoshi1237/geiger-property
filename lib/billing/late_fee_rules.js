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

// The second late fee's key (CORE-19, file 1 registry): one per lease and rent month.
export const late2Key = (leaseId, period) => `late2:${leaseId}:${period}`;
export function parseLate2Key(key) {
  const parts = String(key || "").split(":");
  return parts[0] === "late2" && parts.length === 3 && PERIOD.test(parts[2]) ? { owner: parts[1], period: parts[2] } : null;
}

export const emptyLateHistory = () => ({ posted: 0, own: 0, inherited: 0, waived: false, keys: [] });

// Late-fee history from normalized entries (any status, soft-deleted ones flagged deletedAt) → Map leaseId → { [period]: { posted, own, inherited, waived, keys, second? } }; a voided fee marks the month waived, keys list every key used, `second` holds late2: entries the same way.
export function summarizeLateEntries(entries) {
  const out = new Map();
  const seen = new Set();
  for (const e of entries || []) {
    if (!e?.id || seen.has(e.id)) continue;
    seen.add(e.id);
    const k = parseLateKey(e.idempotencyKey) || parseLate2Key(e.idempotencyKey);
    if (!k || !e.leaseId || k.owner !== e.leaseId) continue;
    const byPeriod = out.get(e.leaseId) || {};
    out.set(e.leaseId, byPeriod);
    const month = byPeriod[k.period] || (byPeriod[k.period] = emptyLateHistory());
    const h = parseLate2Key(e.idempotencyKey) ? (month.second ||= emptyLateHistory()) : month;
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
  waiting: "Not due yet",
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
const totalCapOf = (policies) => (Number(policies?.maxLateFeeTotal) > 0 ? round2(policies.maxLateFeeTotal) : null);
export const DEFAULT_LATE_FEE2_DAYS = 15;

// The second late fee's policy (CORE-19) → { daysLate, type, amount, counts }, else null when it's off.
export function secondFeePolicy(policies) {
  const p = policies || {};
  if (!isOn(p.lateFee2Enabled) || !p.lateFeeType || p.lateFeeType === "none") return null;
  return {
    daysLate: Number(p.lateFee2DaysLate) > 0 ? Math.round(Number(p.lateFee2DaysLate)) : DEFAULT_LATE_FEE2_DAYS,
    type: p.lateFee2Type === "percent" ? "percent" : "flat",
    amount: Math.max(0, Number(p.lateFee2Amount) || 0),
    counts: p.lateFee2CountsTowardTotal === undefined || p.lateFee2CountsTowardTotal === "" ? true : isOn(p.lateFee2CountsTowardTotal),
  };
}

// The second fee for one month's billed rent: flat, or a percent of it.
export const secondFeeAmount = (s, base) => round2(s.type === "percent" ? (Number(base) * s.amount) / 100 : s.amount);

// One lease's late fees on business date `today` → { stop, periods: [{ period, due, daysLate, base, open, target, posted, delta, status, key, first, second }] }.
// Per rent month: target = computeLateFee(policies, billed rent, days late) capped by maxLateFee; post target − posted (posted spans leases the rent was carried from) under the month key, then a dated key; months before `startsOn` or more than `catchUpMonths` back are left alone.
// A payment plan in good standing (CORE-14) suspends rent months; with lateFeeOnInstallments its installments still accrue, each month's base being the installments billed in it.
// CORE-19: `second` is the month's one-time second fee ({ daysLate, target, posted, delta, status, key, counts }, null when off) once rent is lateFee2DaysLate days late; maxLateFeeTotal caps both fees together, the first fee keeping what it has posted.
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
  const totalCap = totalCapOf(policies);
  const s2 = secondFeePolicy(policies);
  const months = [...new Set([...open.keys(), ...Object.keys(history)])].sort();
  const periods = [];
  for (const period of months) {
    const o = open.get(period) || { open: 0, from: "" };
    const due = maxDate(dueDateFor(period, policies?.rentDueDay), o.from);
    if (due > today || (floor && period < floor) || (startsOn && due < startsOn)) continue;
    const h = history[period] || emptyLateHistory();
    const h2 = h.second || emptyLateHistory();
    const daysLate = daysBetween(due, today);
    const base = round2((planOnly ? 0 : Number(billed?.get?.(period)) || 0) + (installmentBase.get(period) || 0));
    const raw = daysLate > 0 ? computeLateFee(policies, base, daysLate) : 0;
    const posted = round2(h.posted);
    const posted2 = round2(h2.posted);
    // The combined cap leaves the first fee what the second hasn't used, never less than it has posted.
    const target = totalCap === null ? raw : round2(Math.min(raw, Math.max(posted, totalCap - posted2)));
    let status = stop;
    if (!status) {
      if (planOnly && o.open <= 0.004 && (rentOpen.get(period)?.open || 0) > 0.004) status = "payment_plan";
      else if (o.open <= minBalance + 0.004) status = o.open > 0.004 ? "min_balance" : "paid";
      else if (h.waived) status = "waived";
      else if (raw <= 0) status = daysLate <= grace ? "grace" : "no_fee";
      else if (target - posted < 0.005) status = (cap !== null && target >= cap) || target < raw ? "capped" : "posted";
    }
    const key = h.keys.includes(lateKey(leaseId, period)) ? lateDayKey(leaseId, period, today) : lateKey(leaseId, period);
    const delta = status ? 0 : round2(target - posted);

    // Second fee: once per month at lateFee2DaysLate while the month's rent is open; a payment plan's pause, a waived month or a used key stops it.
    let second = null;
    if (s2) {
      const want = daysLate >= s2.daysLate ? secondFeeAmount(s2, base) : 0;
      const room = totalCap === null ? want : round2(Math.max(0, totalCap - posted - delta));
      const target2 = round2(Math.max(posted2, Math.min(want, room)));
      let status2 = leaseStop || (["paid", "min_balance", "payment_plan"].includes(status) ? status : null);
      if (!status2) {
        if (h2.keys.length || h2.inherited > 0) status2 = posted2 > 0 ? "posted" : "waived";
        else if (h.waived) status2 = "waived";
        else if (daysLate < s2.daysLate) status2 = "waiting";
        else if (want <= 0) status2 = "no_fee";
        else if (target2 <= 0.004) status2 = "capped";
      }
      const delta2 = status2 ? 0 : round2(target2 - posted2);
      second = { daysLate: s2.daysLate, target: status2 === "waiting" ? secondFeeAmount(s2, base) : target2, posted: posted2, delta: delta2, status: status2 || "due", key: late2Key(leaseId, period), counts: s2.counts };
    }
    periods.push({ period, due, daysLate, base, open: o.open, target, posted, delta, status: status || "due", key, first: !h.keys.length && !(h.inherited > 0), second });
  }
  return { stop, periods };
}

// Late-fee count (CORE-19): distinct rent months in [from, to] with a live late fee on the entry's own lease; a second fee counts unless it was posted not to (metadata.lateFee.countsTowardTotal false) → { count, periods }.
export function lateFeeMonths(entries, { from = "", to = "" } = {}) {
  const months = new Set();
  for (const e of entries || []) {
    if (!e || e.deletedAt || e.reversalOf || e.status === "void") continue;
    const first = parseLateKey(e.idempotencyKey);
    const k = first || parseLate2Key(e.idempotencyKey);
    if (!k || k.owner !== e.leaseId || (from && k.period < from) || (to && k.period > to)) continue;
    if (!first && metaOf(e).lateFee?.countsTowardTotal === false) continue;
    months.add(k.period);
  }
  const periods = [...months].sort();
  return { count: periods.length, periods };
}

// Warnings for the Late Fees tab (warn, never block): an uncapped daily fee, a second fee with no combined cap, a state whose Legal Resources cover late fees,
// and `rules`: jurisdiction late-fee caps the user maintains ({ maxAmount, maxPct, minGraceDays, oncePerPeriod, citation }; HOUS-12 supplies them, none ship).
export function lateFeeWarnings(policies, { stateName = "", sources = 0, rules = [] } = {}) {
  const out = [];
  const s2 = secondFeePolicy(policies);
  if (policies?.lateFeeType === "daily" && capOf(policies) === null) out.push("Daily late fees have no maximum, so they grow every day until rent is paid. Set a maximum late fee in Fees & Policies.");
  if (s2 && totalCapOf(policies) === null) out.push("The second late fee has no combined maximum. Some states allow only one late fee per month or cap the total — set a combined maximum in Fees & Policies if yours does.");
  if (stateName && sources > 0 && policies?.lateFeeType !== "none") {
    out.push(`${stateName} law limits late fees or when they can start. Geiger doesn't check your policy against it yet — review the sources below.`);
  }
  // The most a month can be charged: the combined cap, else the first fee's cap when there's no second fee.
  const total = totalCapOf(policies) ?? (s2 ? null : capOf(policies));
  for (const r of rules || []) {
    const cite = r.citation ? ` (${r.citation})` : "";
    if (isOn(r.oncePerPeriod) && s2) out.push(`Your rule${cite} allows one late fee per rent month, but a second late fee is on.`);
    if (Number(r.maxAmount) > 0 && (total === null || total > Number(r.maxAmount))) out.push(`Your rule${cite} caps late fees at $${round2(r.maxAmount).toFixed(2)} a month; the policy can charge more.`);
    if (Number(r.maxPct) > 0 && policies?.lateFeeType === "percent" && Number(policies.lateFeeAmount) > Number(r.maxPct)) out.push(`Your rule${cite} caps late fees at ${r.maxPct}% of rent; the policy charges ${policies.lateFeeAmount}%.`);
    if (Number(r.minGraceDays) > 0 && (Number(policies?.graceDays) || 0) < Number(r.minGraceDays)) out.push(`Your rule${cite} requires a ${r.minGraceDays}-day grace period; the policy allows ${Number(policies?.graceDays) || 0}.`);
  }
  return out;
}
