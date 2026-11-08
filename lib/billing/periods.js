// Pure date and period math for billing: dates are "YYYY-MM-DD", periods are "YYYY-MM", all calendar arithmetic in UTC.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

export const DEFAULT_TIME_ZONE = "America/New_York";

// Money rounding to cents (epsilon guards 1.005-style float drift).
export const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

// "YYYY-MM-DD" from a date string or Date, else "".
export function isoDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return typeof v === "string" && DATE_RE.test(v) ? v.slice(0, 10) : "";
}

const utc = (date) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

// The calendar date at `now` in a time zone (UTC when the zone is missing or invalid).
export function businessDate(now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = (tz) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  let p;
  try {
    p = parts(timeZone || "UTC");
  } catch {
    p = parts("UTC");
  }
  const get = (t) => p.find((x) => x.type === t)?.value || "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const periodOf = (date) => String(date || "").slice(0, 7);

export function daysInPeriod(period) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// { start, end, days } of a "YYYY-MM" period.
export function periodBounds(period) {
  const days = daysInPeriod(period);
  return { start: `${period}-01`, end: `${period}-${pad(days)}`, days };
}

export function addPeriods(period, n) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

// Periods from..to inclusive (capped at 600).
export function periodRange(from, to) {
  const out = [];
  for (let p = from; p <= to && out.length < 600; p = addPeriods(p, 1)) out.push(p);
  return out;
}

export const addDays = (date, n) => new Date(utc(date) + n * DAY).toISOString().slice(0, 10);

// Same day n months later, clamped to the month's last day.
export function addMonths(date, n) {
  const period = addPeriods(periodOf(date), n);
  return `${period}-${pad(Math.min(Number(date.slice(8, 10)), daysInPeriod(period)))}`;
}

export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
export const minDate = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
export const maxDate = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

// Due date of a period for a day-of-month (clamped to the month's last day).
export function dueDateFor(period, dueDay = 1) {
  const day = Math.min(Math.max(Math.trunc(Number(dueDay)) || 1, 1), daysInPeriod(period));
  return `${period}-${pad(day)}`;
}

export const periodLabel = (period) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const METHODS = new Set(["actual", "thirty"]);
const methodOf = (method) => (METHODS.has(method) ? method : "actual");

// Days of [from, to] inside a period: actual days, or a 30-day month where the period's last day counts as day 30.
export function prorationDays(from, to, period, method = "actual") {
  const { start, end } = periodBounds(period);
  const a = maxDate(from, start);
  const b = minDate(to, end);
  if (!a || !b || a > b) return 0;
  if (methodOf(method) === "actual") return daysBetween(a, b) + 1;
  const day = (d) => (d === end ? 30 : Math.min(Number(d.slice(8, 10)), 30));
  return Math.max(0, day(b) - day(a) + 1);
}

export const prorationBasis = (period, method = "actual") => (methodOf(method) === "thirty" ? 30 : daysInPeriod(period));

// `amount` for the part of a period between from and to (inclusive); the whole period returns the amount unchanged.
export function prorate(amount, from, to, period, method = "actual") {
  const full = round2(amount);
  const days = prorationDays(from, to, period, method);
  const basis = prorationBasis(period, method);
  if (days >= basis) return full;
  return round2((full * days) / basis);
}
