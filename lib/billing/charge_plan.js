import { addDays, addPeriods, daysBetween, dueDateFor, isoDate, maxDate, minDate, periodBounds, periodOf, prorate as prorateMonth, round2 } from "./periods";
import { frequencyOf, nextOccurrence } from "./frequency";

// Pure recurring-charge schedule (CORE-03): which occurrences are due, the days each covers, what it bills, and the end-date true-ups; no I/O.

// Most occurrences one run posts per charge (catch-up cap).
export const MAX_CATCH_UP = 24;
const GUARD = 600;

export const CHARGE_STATUSES = ["Active", "Paused", "Ended", "Draft"];

// Idempotency keys (file 1 Part A registry): rc:<chargeId>:<YYYY-MM-DD> per occurrence, rc-adj:<chargeId>:<date>:<n> per true-up of it.
export const chargeKey = (chargeId, date) => `rc:${chargeId}:${date}`;
export const chargeAdjKey = (chargeId, date, n) => `rc-adj:${chargeId}:${date}:${n}`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// rc-family key → { kind: "rc" | "adj", chargeId, date, n? }, else null.
export function parseChargeKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "rc" && parts.length === 3 && DATE.test(parts[2])) return { kind: "rc", chargeId: parts[1], date: parts[2] };
  if (parts[0] === "rc-adj" && parts.length === 4 && DATE.test(parts[2])) return { kind: "adj", chargeId: parts[1], date: parts[2], n: Number(parts[3]) || 0 };
  return null;
}

const meta = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});
const pick = (r, camel, snake) => r?.[camel] ?? r?.[snake] ?? null;
const flag = (v, dflt) => (v === null || v === undefined || v === "" ? dflt : v === true || v === "true");

// The charge fields billing reads, from a snake row or a camel view model.
export function chargeFacts(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: pick(row, "projectId", "project_id"),
    name: row.name || "Recurring charge",
    amount: round2(row.amount),
    frequency: row.frequency || "Monthly",
    nextDate: isoDate(pick(row, "nextDate", "next_date")),
    endsOn: isoDate(pick(row, "endsOn", "ends_on")),
    prorate: flag(row.prorate, false),
    billWithRent: flag(pick(row, "billWithRent", "bill_with_rent"), true),
    status: row.status || "Active",
    glAccountId: pick(row, "glAccountId", "gl_account_id") || "",
    leaseId: pick(row, "leaseId", "lease_id") || "",
    tenantId: pick(row, "tenantId", "tenant_id") || "",
    unitId: pick(row, "unitId", "unit_id") || "",
    propertyId: pick(row, "propertyId", "property_id") || "",
    metadata: meta(row),
  };
}

const isMonthEnd = (date) => date === periodBounds(periodOf(date)).end;

// Day a month-based schedule keeps: the stored anchor when next_date was clamped to a month end, else next_date's day.
export function anchorDayOf(charge) {
  const c = chargeFacts(charge);
  const day = Number(c.nextDate.slice(8, 10)) || 1;
  const stored = Math.trunc(Number(c.metadata.anchorDay)) || 0;
  return stored > day && stored <= 31 && isMonthEnd(c.nextDate) ? stored : day;
}

// The occurrence scheduled on `scheduled` → { scheduled, date, from, to, periodFrom, periodTo, period?, basis, rate, amount, full, empty }; window clips the covered days.
export function occurrenceAt(charge, scheduled, { window = {}, dueDay = 1, method = "actual", anchorDay } = {}) {
  const c = chargeFacts(charge);
  const f = frequencyOf(c.frequency) || { once: true };
  const start = window.start || null;
  const end = window.end || null;
  const rate = c.amount;
  if (f.once) {
    const date = maxDate(scheduled, start);
    return { scheduled, date, from: date, to: date, periodFrom: date, periodTo: date, basis: "once", rate, amount: rate, full: true, empty: false };
  }
  if (f.months === 1 && c.billWithRent) {
    // A calendar-month period posted with rent; a start that isn't the period's due date is a partial first period.
    const period = periodOf(scheduled);
    const { start: pStart, end: pEnd } = periodBounds(period);
    const due = dueDateFor(period, dueDay);
    const from = maxDate(scheduled === due ? pStart : scheduled, start);
    const to = minDate(pEnd, end);
    const full = from === pStart && to === pEnd;
    const amount = full || !c.prorate || from > to ? rate : prorateMonth(rate, from, to, period, method);
    return { scheduled, date: maxDate(due, from), from, to, periodFrom: pStart, periodTo: pEnd, period, basis: "month", rate, amount, full, empty: from > to };
  }
  const periodTo = addDays(nextOccurrence(scheduled, c.frequency, { dueDay, anchorDay }), -1);
  const from = maxDate(scheduled, start);
  const to = minDate(periodTo, end);
  const full = from === scheduled && to === periodTo;
  const span = daysBetween(scheduled, periodTo) + 1;
  const amount = full || !c.prorate || from > to ? rate : round2((rate * (daysBetween(from, to) + 1)) / span);
  return { scheduled, date: from, from, to, periodFrom: scheduled, periodTo, basis: "span", rate, amount, full, empty: from > to };
}

// The schedule step after an occurrence: the next period's due date (with rent) or the frequency's next date.
function stepAfter(c, occ, { dueDay, anchorDay }) {
  if (occ.basis === "month") return dueDateFor(addPeriods(occ.period, 1), dueDay);
  return nextOccurrence(occ.scheduled, c.frequency, { dueDay, anchorDay });
}

// Occurrences posting on or before `through` (null = the next one, whatever its date) inside window ∩ ends_on → { occurrences, next, status, anchorDay } or { error }.
export function planCharge(charge, { window = {}, through = null, dueDay = 1, method = "actual", limit = MAX_CATCH_UP } = {}) {
  const c = chargeFacts(charge);
  const f = frequencyOf(c.frequency);
  if (!f) return { error: `Unknown frequency "${c.frequency}".` };
  if (!c.nextDate) return { error: "Set the next charge date." };
  const end = minDate(c.endsOn || null, window.end || null);
  const clip = { start: window.start || null, end };
  const anchorDay = f.months ? anchorDayOf(c) : undefined;
  const occurrences = [];
  let next = c.nextDate;
  let status = c.status;
  for (let i = 0; i < GUARD && occurrences.length < limit; i += 1) {
    const occ = occurrenceAt(c, next, { window: clip, dueDay, method, anchorDay });
    if (end && occ.from > end) {
      status = "Ended";
      break;
    }
    if (through && occ.date > through) break;
    if (!occ.empty) occurrences.push(occ);
    if (f.once) {
      status = "Ended";
      break;
    }
    next = stepAfter(c, occ, { dueDay, anchorDay });
    if (through === null && occurrences.length) {
      if (end && occurrenceAt(c, next, { window: clip, dueDay, method, anchorDay }).from > end) status = "Ended";
      break;
    }
  }
  // Nothing left before the end: the charge is finished even when the last occurrence isn't due yet.
  if (status !== "Ended" && end && !f.once && occurrenceAt(c, next, { window: clip, dueDay, method, anchorDay }).from > end) status = "Ended";
  return { occurrences, next, status, anchorDay };
}

// What a posted occurrence should bill once the charge ends at `end`: unchanged through its last day, 0 when it starts after, else the covered days (prorate) or all of it.
export function amountThrough(occ, end, { prorate = false, method = "actual" } = {}) {
  if (!end || occ.to <= end) return round2(occ.amount);
  if (occ.from > end) return 0;
  if (!prorate) return round2(occ.amount);
  if (occ.basis === "month") return prorateMonth(occ.rate, occ.from, end, occ.period, method);
  const span = daysBetween(occ.periodFrom, occ.periodTo) + 1;
  return round2((occ.rate * (daysBetween(occ.from, end) + 1)) / span);
}

// True-ups for posted occurrences an end date cuts into (or no longer cuts into): [{ date, entryId, delta, n, key }]; posted = [{ date, entryId, occ, billed, maxAdj }].
export function endAdjustments(charge, posted, { end, method = "actual" } = {}) {
  const c = chargeFacts(charge);
  const out = [];
  for (const p of posted || []) {
    const expected = amountThrough(p.occ, end, { prorate: c.prorate, method });
    const delta = round2(expected - p.billed);
    if (Math.abs(delta) < 0.005) continue;
    const n = (p.maxAdj || 0) + 1;
    out.push({ date: p.date, entryId: p.entryId, delta, n, key: chargeAdjKey(c.id, p.date, n), expected });
  }
  return out;
}

// Occurrence coverage stored on a posted entry (metadata), else rebuilt from its date and the charge's schedule.
export function postedOccurrence(charge, entry, { dueDay = 1 } = {}) {
  const m = meta(entry);
  const amount = round2(entry.total ?? entry.amount);
  if (m.from && m.to && m.basis) {
    return { scheduled: m.scheduled || m.from, date: entry.entry_date || entry.date, from: m.from, to: m.to, periodFrom: m.periodFrom || m.from, periodTo: m.periodTo || m.to, period: m.period || null, basis: m.basis, rate: round2(m.rate ?? amount), amount };
  }
  const date = isoDate(entry.entry_date || entry.date);
  const occ = occurrenceAt({ ...chargeFacts(charge), amount }, date, { dueDay });
  return { ...occ, from: occ.basis === "month" ? occ.periodFrom : occ.from, rate: amount, amount };
}
