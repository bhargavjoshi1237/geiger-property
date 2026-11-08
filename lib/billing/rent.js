import {
  addDays,
  addMonths,
  addPeriods,
  dueDateFor,
  isoDate,
  maxDate,
  minDate,
  periodBounds,
  periodOf,
  periodRange,
  prorate,
  round2,
} from "./periods";

// Pure rent schedule math (CORE-01): dated rent steps are the only source of billed rent; takes snake rows or camel view models, no I/O.

// Statuses that bill rent; Renewed leases bill through their term end (CORE-02 adds the other end dates).
export const BILLABLE_STATUSES = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction"];
export const PRE_LIVE_STATUSES = ["Draft", "Pending"];

export const STEP_SOURCES = ["initial", "schedule", "mtm_premium", "renewal", "amendment", "manual"];
export const STEP_SOURCE_LABELS = {
  initial: "Initial rent",
  schedule: "Scheduled change",
  mtm_premium: "Month-to-month premium",
  renewal: "Renewal rent",
  amendment: "Lease amendment",
  manual: "Rent change",
};

const meta = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});
const pick = (r, camel, snake) => r?.[camel] ?? r?.[snake] ?? null;

// The lease fields billing reads, from either shape.
export function leaseFacts(lease) {
  if (!lease) return null;
  return {
    id: lease.id,
    projectId: pick(lease, "projectId", "project_id"),
    name: lease.name || "",
    status: lease.status || "",
    rent: Number(lease.rent) || 0,
    termStart: isoDate(pick(lease, "termStart", "term_start")),
    termEnd: isoDate(pick(lease, "termEnd", "term_end")),
    moveInDate: isoDate(pick(lease, "moveInDate", "move_in_date")),
    moveOutDate: isoDate(pick(lease, "moveOutDate", "move_out_date")),
    createdAt: isoDate(pick(lease, "createdAt", "created_at")),
    termType: pick(lease, "termType", "term_type") || "",
    tenantId: pick(lease, "tenantId", "tenant_id") || "",
    unitId: pick(lease, "unitId", "unit_id") || "",
    propertyId: pick(lease, "propertyId", "property_id") || "",
    renewalOfId: pick(lease, "renewalOfId", "renewal_of_id") || "",
    unit: lease.unit || "",
    tenantName: pick(lease, "tenantName", "tenant_name") || "",
    metadata: meta(lease),
  };
}

export const isLiveForBilling = (lease) => BILLABLE_STATUSES.includes(leaseFacts(lease)?.status);
export const isPreLive = (lease) => PRE_LIVE_STATUSES.includes(leaseFacts(lease)?.status);

// Where rent bills: { start, end, billable }; end is null while open-ended (CORE-02 fills move-out / ended dates).
export function billingWindow(lease) {
  const l = leaseFacts(lease);
  if (!l) return { start: null, end: null, billable: false };
  const start = l.termStart || l.moveInDate || l.createdAt || null;
  const renewed = l.status === "Renewed";
  const end = renewed ? l.termEnd || null : null;
  return { start, end, billable: Boolean(start) && (BILLABLE_STATUSES.includes(l.status) || (renewed && Boolean(end))) };
}

export function normalizeStep(row) {
  if (!row) return null;
  const changeValue = pick(row, "changeValue", "change_value");
  return {
    id: row.id,
    leaseId: pick(row, "leaseId", "lease_id") || "",
    projectId: pick(row, "projectId", "project_id"),
    effectiveDate: isoDate(pick(row, "effectiveDate", "effective_date")),
    amount: round2(row.amount),
    changeMode: pick(row, "changeMode", "change_mode") || "amount",
    changeValue: changeValue === null || changeValue === "" ? null : Number(changeValue),
    source: row.source || "manual",
    note: row.note || "",
    status: row.status || "active",
    deletedAt: pick(row, "deletedAt", "deleted_at"),
    metadata: meta(row),
  };
}

// Active steps, oldest first.
export function activeSteps(steps) {
  return (steps || [])
    .map(normalizeStep)
    .filter((s) => s && s.status === "active" && !s.deletedAt && s.effectiveDate)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

// The step in force on a date: the latest on or before it, else the earliest.
export function stepInForce(steps, date) {
  const list = activeSteps(steps);
  if (!list.length) return null;
  let found = null;
  for (const s of list) if (s.effectiveDate <= date) found = s;
  return found || list[0];
}

export const currentRent = (steps, date) => stepInForce(steps, date)?.amount ?? null;

// Re-project percent steps from the step before each → [{ ...step, amount, changed }].
export function projectSteps(steps) {
  const list = activeSteps(steps);
  let prev = null;
  return list.map((s) => {
    const amount = s.changeMode === "percent" && prev ? round2(prev.amount * (1 + (Number(s.changeValue) || 0) / 100)) : s.amount;
    const out = { ...s, amount, changed: amount !== s.amount };
    prev = out;
    return out;
  });
}

// Amount for a new step: a new monthly amount, a percent of the rent in force the day before, or that rent plus a premium.
export function resolveStepAmount(steps, step) {
  const date = isoDate(step.effectiveDate);
  if (!date) return { error: "Pick the date the rent changes." };
  const prior = stepInForce(
    activeSteps(steps).filter((s) => s.effectiveDate < date && s.id !== step.replaces),
    addDays(date, -1),
  );
  const mode = step.changeMode === "percent" ? "percent" : "amount";
  if (step.source === "mtm_premium" && step.premium !== undefined && step.amount === undefined) {
    if (!prior) return { error: "Set the lease's rent before adding a month-to-month premium." };
    const premium = round2(step.premium);
    return { amount: round2(prior.amount + premium), changeMode: "amount", changeValue: round2(prior.amount + premium), premium };
  }
  if (mode === "percent") {
    if (!prior) return { error: "A percent change needs an earlier rent to apply to." };
    const pct = Number(step.changeValue);
    if (!Number.isFinite(pct)) return { error: "Enter the percent change." };
    return { amount: round2(prior.amount * (1 + pct / 100)), changeMode: "percent", changeValue: pct };
  }
  const amount = round2(step.amount ?? step.changeValue);
  if (!(amount >= 0)) return { error: "Enter the new monthly rent." };
  return { amount, changeMode: "amount", changeValue: amount };
}

const sameMethod = (policies) => (policies?.prorationMethod === "thirty" ? "thirty" : "actual");

// Billed rent for a period → { segments: [{ from, to, amount, rate, stepId }], total, full, from, to }; mid-period steps split by days, partial first / last periods prorate unless prorateFirstMonth / prorateLastMonth is off.
export function rentForPeriod(steps, period, window, policies = {}) {
  const empty = { segments: [], total: 0, full: false, from: null, to: null };
  const list = activeSteps(steps);
  if (!list.length || !window?.start) return empty;
  const { start: pStart, end: pEnd } = periodBounds(period);
  let from = maxDate(pStart, window.start);
  let to = window.end ? minDate(pEnd, window.end) : pEnd;
  if (from > to) return empty;
  if (from > pStart && from === window.start && policies?.prorateFirstMonth === false) from = pStart;
  if (to < pEnd && to === window.end && policies?.prorateLastMonth === false) to = pEnd;
  const method = sameMethod(policies);
  const changes = list.filter((s) => s.effectiveDate > from && s.effectiveDate <= to);
  const segments = [];
  let cursor = from;
  let step = stepInForce(list, from);
  for (const next of changes) {
    if (next.id === step.id) continue;
    segments.push({ from: cursor, to: addDays(next.effectiveDate, -1), step });
    cursor = next.effectiveDate;
    step = next;
  }
  segments.push({ from: cursor, to, step });
  const full = from === pStart && to === pEnd;
  const out = segments.map((s) => ({
    from: s.from,
    to: s.to,
    rate: s.step.amount,
    stepId: s.step.id,
    amount: full && segments.length === 1 ? s.step.amount : prorate(s.step.amount, s.from, s.to, period, method),
  }));
  return { segments: out, total: round2(out.reduce((t, s) => t + s.amount, 0)), full: full && segments.length === 1, from, to };
}

// The date a period's rent posts: its due date, or the lease start when that's later.
export const chargeDateFor = (period, window, dueDay) => maxDate(dueDateFor(period, dueDay), window?.start || "");

// Periods to bill as of `today`: window start (or `catchUpMonths` back) to the latest whose charge date − `leadDays` has come, never before `billingStartsOn`; `includeFirst` adds the first period early.
export function billablePeriods({ window, dueDay = 1, today, billingStartsOn = "", leadDays = 0, catchUpMonths = 3, includeFirst = false }) {
  if (!window?.start || !today) return [];
  const first = periodOf(window.start);
  const floor = catchUpMonths === null || catchUpMonths === undefined ? first : periodOf(addMonths(today, -catchUpMonths));
  const from = first > floor ? first : floor;
  const last = window.end ? periodOf(window.end) : null;
  const horizon = addDays(today, Math.max(0, Number(leadDays) || 0));
  const ok = (p) => {
    const charge = chargeDateFor(p, window, dueDay);
    return (!last || p <= last) && (!billingStartsOn || charge >= billingStartsOn);
  };
  const out = periodRange(from, addPeriods(periodOf(horizon), 1)).filter((p) => chargeDateFor(p, window, dueDay) <= horizon && ok(p));
  if (includeFirst && ok(first) && !out.includes(first)) out.unshift(first);
  return out;
}

// First charge preview for activation: { period, amount, from, to, prorated } or null.
export function firstCharge(lease, steps, policies = {}) {
  const window = billingWindow(lease);
  if (!window.start) return null;
  const period = periodOf(window.start);
  const r = rentForPeriod(steps, period, window, policies);
  return r.total > 0 ? { period, amount: r.total, from: r.from, to: r.to, prorated: !r.full } : null;
}

// Steps for a lease that has none yet: one initial step from its current rent at the window start.
export function initialStepFor(lease) {
  const l = leaseFacts(lease);
  const start = billingWindow(lease).start || isoDate(new Date());
  return { leaseId: l.id, projectId: l.projectId, effectiveDate: start, amount: round2(l.rent), changeMode: "amount", changeValue: round2(l.rent), source: "initial" };
}
