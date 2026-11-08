// Pure scheduling math for jobs (CORE-10): cron parsing and next-run times (UTC), schedule labels, as-of dates, and the watchdog's due/stale rules.

const MINUTE = 60000;
const DAY_MINUTES = 1440;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Successful outcomes: a skipped run (paused project, module off) counts as handled.
export const OK_STATUSES = ["succeeded", "partial", "skipped"];
// How far back a run as of a past date may go (management fees and deposit interest catch up older months this way).
export const AS_OF_MAX_MONTHS = 12;
// A missed-run alert fires when the last scheduled success is older than this many intervals.
export const STALE_FACTOR = 1.5;
// A running row older than this belongs to a dead worker (maxDuration is 5 minutes): the next start marks it abandoned.
export const LOCK_STALE_MINUTES = 15;

export const intervalOf = (job) => Number(job?.intervalMinutes) || DAY_MINUTES;

const FIELDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6 },
];

// One cron field → the set of allowed values (supports *, */n, a, a-b, a-b/n and lists); null when it is "*".
function parseField(src, { min, max }) {
  if (src === "*") return null;
  const out = new Set();
  for (const part of src.split(",")) {
    const m = part.match(/^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!m) throw new Error(`Bad cron field "${src}"`);
    const from = m[1] === "*" ? min : Number(m[1]);
    const to = m[2] !== undefined ? Number(m[2]) : m[1] === "*" || m[3] ? max : from;
    const step = Number(m[3]) || 1;
    if (from < min || to > max || from > to) throw new Error(`Cron field "${src}" is out of range`);
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Cron "${expr}" needs 5 fields`);
  const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(p, FIELDS[i]));
  return { minute, hour, dom, month, dow };
}

const has = (set, v) => !set || set.has(v);

// Day match: when both day fields are restricted cron accepts either.
function dayMatches(c, d) {
  const byDom = has(c.dom, d.getUTCDate());
  const byDow = has(c.dow, d.getUTCDay());
  return c.dom && c.dow ? byDom || byDow : byDom && byDow;
}

// The first time strictly after `from` that matches the cron expression (UTC, as Vercel Cron runs).
export function nextCronTime(expr, from = new Date()) {
  const c = parseCron(expr);
  const t = new Date(Math.floor(from.getTime() / MINUTE) * MINUTE + MINUTE);
  const limit = t.getTime() + 366 * DAY_MINUTES * MINUTE;
  while (t.getTime() <= limit) {
    if (!has(c.month, t.getUTCMonth() + 1)) {
      t.setUTCMonth(t.getUTCMonth() + 1, 1);
      t.setUTCHours(0, 0, 0, 0);
    } else if (!dayMatches(c, t)) {
      t.setUTCDate(t.getUTCDate() + 1);
      t.setUTCHours(0, 0, 0, 0);
    } else if (!has(c.hour, t.getUTCHours())) {
      t.setUTCHours(t.getUTCHours() + 1, 0, 0, 0);
    } else if (!has(c.minute, t.getUTCMinutes())) {
      t.setTime(t.getTime() + MINUTE);
    } else {
      return new Date(t);
    }
  }
  return null;
}

const pad = (n) => String(n).padStart(2, "0");

// "Every 15 minutes", "Hourly at :15", "Daily at 10:05 UTC" — else the raw expression.
export function describeSchedule(expr) {
  const p = String(expr || "").trim().split(/\s+/);
  if (p.length !== 5 || p.slice(2).some((x) => x !== "*")) return expr || "";
  const every = p[0].match(/^\*\/(\d+)$/);
  if (every && p[1] === "*") return `Every ${every[1]} minutes`;
  if (/^\d+$/.test(p[0]) && p[1] === "*") return `Hourly at :${pad(p[0])}`;
  if (/^\d+$/.test(p[0]) && /^\d+$/.test(p[1])) return `Daily at ${pad(p[1])}:${pad(p[0])} UTC`;
  return expr;
}

// Minutes between a zone's wall clock and UTC at instant `t` (UTC when the zone is missing or invalid).
function zoneOffsetMinutes(t, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t));
  } catch {
    return 0;
  }
  const get = (type) => Number(parts.find((x) => x.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((local - Math.floor(t / MINUTE) * MINUTE) / MINUTE);
}

// Noon on `date` ("YYYY-MM-DD") in a time zone, as an instant: an as-of run's `now`.
export function zonedNoon(date, timeZone) {
  const [y, m, d] = String(date).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 12);
  let t = guess - zoneOffsetMinutes(guess, timeZone) * MINUTE;
  const again = guess - zoneOffsetMinutes(t, timeZone) * MINUTE;
  if (again !== t) t = again;
  return new Date(t);
}

const monthsBack = (date, n) => {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 - n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
};

// Why an as-of date can't be used ("" when it can): a real date, not after the project's business date, within AS_OF_MAX_MONTHS.
export function asOfProblem(asOf, today) {
  if (typeof asOf !== "string" || !DATE_RE.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) return "Pick a valid date.";
  if (asOf > today) return "Pick today or an earlier date — a run can't be dated in the future.";
  if (asOf < monthsBack(today, AS_OF_MAX_MONTHS)) return `Pick a date within the last ${AS_OF_MAX_MONTHS} months.`;
  return "";
}

const ageMinutes = (at, now) => (at ? (now.getTime() - new Date(at).getTime()) / MINUTE : Infinity);

// Watchdog retry: nothing handled or running within the interval plus a grace (half of it, at most an hour) that lets the job's own cron fire first.
export function isOverdue(status, job, now = new Date()) {
  const interval = intervalOf(job);
  const window = interval + Math.min(interval / 2, 60);
  if (status?.lastStatus === "running" && ageMinutes(status.lastStartedAt, now) < LOCK_STALE_MINUTES) return false;
  return ageMinutes(status?.lastOkAt, now) > window;
}

// "Run everything due" (one project, by hand): nothing handled or running within the interval.
export function isDueNow(status, job, now = new Date()) {
  const window = intervalOf(job) - 1;
  if (status?.lastStatus === "running" && ageMinutes(status.lastStartedAt, now) < LOCK_STALE_MINUTES) return false;
  return ageMinutes(status?.lastOkAt, now) > window;
}

// Missed run: the last scheduled success is older than STALE_FACTOR intervals (projects never run on schedule are left to the ops check).
export function isStale(status, job, now = new Date()) {
  if (!status?.lastScheduledOkAt) return false;
  return ageMinutes(status.lastScheduledOkAt, now) > STALE_FACTOR * intervalOf(job);
}

// Which outcome raises an alert: a failed or partial run, or a second skipped_locked in a row.
export function alertReason(status, prevStatus) {
  if (status === "failed") return "failed";
  if (status === "partial") return "partial";
  if (status === "skipped_locked" && prevStatus === "skipped_locked") return "locked";
  return "";
}

const shortDate = (at) => new Date(at).toISOString().slice(0, 10);

// The Scheduled Jobs badge for one job in one project: { kind, message } or null (a paused project shows a banner instead).
export function jobAlertOf(status, job, now = new Date(), { schedulerLive = false, paused = false } = {}) {
  if (!status || paused) return null;
  if (status.lastStatus === "failed") return { kind: "failed", message: "The last run failed" };
  if (status.lastStatus === "partial") return { kind: "partial", message: "The last run finished with errors" };
  if (status.lastStatus === "abandoned") return { kind: "abandoned", message: "The last run stopped part-way" };
  if (alertReason(status.lastStatus, status.prevStatus) === "locked") return { kind: "locked", message: "Skipped twice — an earlier run is stuck" };
  if (schedulerLive && isStale(status, job, now)) return { kind: "missed", message: `No scheduled run since ${shortDate(status.lastScheduledOkAt)}` };
  return null;
}

// Parent (cross-project) status from its children: failed when every project that ran failed, partial when some did.
export function parentStatus(children) {
  const ran = children.filter((c) => !["skipped", "skipped_locked"].includes(c.status));
  const bad = ran.filter((c) => c.status === "failed");
  if (ran.length && bad.length === ran.length) return "failed";
  if (ran.some((c) => c.status === "failed" || c.status === "partial")) return "partial";
  return "succeeded";
}

// Vercel Cron entries for vercel.json: one per job (its own function budget) plus the run-due watchdog; paths carry the basePath.
export const WATCHDOG_SCHEDULE = "0 20 * * *";
export function cronEntries(jobs, basePath = "") {
  return [
    ...jobs.map((j) => ({ path: `${basePath}/api/cron/${j.key}`, schedule: j.schedule })),
    { path: `${basePath}/api/cron/run-due`, schedule: WATCHDOG_SCHEDULE },
  ];
}
