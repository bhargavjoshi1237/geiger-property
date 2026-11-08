// Pure period-close math (CORE-40): fiscal years, the lock date and the months a project can close. Dates are ISO "YYYY-MM-DD" strings.

// SQLSTATE the period-lock triggers raise ('ledger: period closed through <date>').
export const LOCK_ERROR_CODE = "GL001";
const LOCK_RE = /period closed through (\d{4}-\d{2}-\d{2})/;

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTH_OPTIONS = MONTH_NAMES.map((label, i) => ({ value: String(i + 1), label }));

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (date) => String(date || "").slice(0, 10).split("-").map(Number);
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// "YYYY-MM-DD" ± n days.
export function addDays(date, n) {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export const monthStart = (date) => `${String(date).slice(0, 7)}-01`;
export function monthEnd(date) {
  const [y, m] = parts(date);
  return iso(y, m, daysIn(y, m));
}

// First day of the month n months after `date`'s month.
export function shiftMonth(date, n) {
  const [y, m] = parts(date);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
}

// A fiscal-year start month as 1–12 (January when unset or invalid).
export function normalizeStartMonth(startMonth) {
  const n = Number(startMonth);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 1;
}

// { start, end, year } of the fiscal year holding `date`; a year is named for the calendar year it ends in.
export function fiscalYearRange(date, startMonth = 1) {
  const sm = normalizeStartMonth(startMonth);
  const [y, m] = parts(date);
  const startYear = m >= sm ? y : y - 1;
  const start = iso(startYear, sm, 1);
  const end = addDays(shiftMonth(start, 12), -1);
  return { start, end, year: Number(end.slice(0, 4)) };
}

export const fiscalYearOf = (date, startMonth = 1) => fiscalYearRange(date, startMonth).year;

// The day after the lock date ("" when nothing is closed).
export const firstOpenDate = (lockedThrough) => (lockedThrough ? addDays(lockedThrough, 1) : "");

// Is `date` on or before the lock date?
export const isLocked = (date, lockedThrough) => Boolean(lockedThrough && date && String(date).slice(0, 10) <= lockedThrough);

// A posting date moved past the lock: the later of `date` and the first open day.
export function openDateFor(date, lockedThrough) {
  const open = firstOpenDate(lockedThrough);
  return open && (!date || date < open) ? open : date;
}

// Is a "YYYY-MM" period after the lock date (locks fall on month ends, so a month is wholly open or closed)?
export const isPeriodOpenAfter = (period, lockedThrough) => !lockedThrough || `${period}-01` > lockedThrough;

// The month that closes next → { start, end, key } or null when it hasn't ended by `today`; with nothing closed, last month.
export function nextClosablePeriod(lockedThrough, today) {
  const start = lockedThrough ? addDays(lockedThrough, 1) : shiftMonth(today, -1);
  const end = monthEnd(start);
  return end < today ? { start, end, key: start.slice(0, 7) } : null;
}

// Months a first close may pick: ended months back to `earliest` (default 24 months), newest first; afterwards only the next one.
export function closableMonths(lockedThrough, today, { earliest = "", limit = 24 } = {}) {
  if (lockedThrough) {
    const next = nextClosablePeriod(lockedThrough, today);
    return next ? [next] : [];
  }
  const out = [];
  for (let start = shiftMonth(today, -1); out.length < limit; start = shiftMonth(start, -1)) {
    if (earliest && monthEnd(start) < earliest) break;
    out.push({ start, end: monthEnd(start), key: start.slice(0, 7) });
  }
  return out;
}

// "March 2026".
export function monthLabel(date) {
  const [y, m] = parts(date);
  return y && m ? `${MONTH_NAMES[m - 1]} ${y}` : "";
}

// "Mar 31, 2026".
export function shortDate(date) {
  const [y, m, d] = parts(date);
  return y && m && d ? `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}` : "";
}

// "Books closed through Mar 31, 2026" (or "" when nothing is closed).
export const closedThroughLabel = (lockedThrough) => (lockedThrough ? `Books closed through ${shortDate(lockedThrough)}` : "");

// The readable refusal for a posting dated on or before the lock date.
export const lockMessage = (lockedThrough) =>
  lockedThrough
    ? `The books are closed through ${shortDate(lockedThrough)}. Date it ${shortDate(addDays(lockedThrough, 1))} or later, or reopen the period first.`
    : "That date is in a closed period. Pick a later date, or reopen the period first.";

// The lock date named by a period-lock error (code GL001 or its message), else null.
export function lockedThroughOf(error) {
  if (!error) return null;
  const match = String(error.message || error).match(LOCK_RE);
  if (match) return match[1];
  return error.code === LOCK_ERROR_CODE ? "" : null;
}

export const isLockError = (error) => lockedThroughOf(error) !== null;
