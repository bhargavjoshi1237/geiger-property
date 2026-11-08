import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  alertReason,
  asOfProblem,
  cronEntries,
  describeSchedule,
  isDueNow,
  isOverdue,
  isStale,
  jobAlertOf,
  nextCronTime,
  parentStatus,
  parseCron,
  zonedNoon,
} from "./schedule";
import { JOBS } from "./registry";
import { RUNBOOK } from "./runbook";
import { alertCopy } from "./alerts";

// CORE-10: cron math, the watchdog's due and stale rules, as-of dates, the launch cron plan and the runbook.

const at = (s) => new Date(s);
const iso = (d) => d.toISOString();
const ago = (now, minutes) => new Date(now.getTime() - minutes * 60000).toISOString();
const daily = { key: "d" };
const quarter = { key: "q", intervalMinutes: 15 };

test("nextCronTime: daily, hourly and every-15-minute schedules in UTC, strictly after `from`", () => {
  assert.equal(iso(nextCronTime("5 10 * * *", at("2026-11-08T09:00:00Z"))), "2026-11-08T10:05:00.000Z");
  assert.equal(iso(nextCronTime("5 10 * * *", at("2026-11-08T10:05:00Z"))), "2026-11-09T10:05:00.000Z");
  assert.equal(iso(nextCronTime("5 10 * * *", at("2026-12-31T23:59:30Z"))), "2027-01-01T10:05:00.000Z");
  assert.equal(iso(nextCronTime("*/15 * * * *", at("2026-11-08T10:07:12Z"))), "2026-11-08T10:15:00.000Z");
  assert.equal(iso(nextCronTime("*/15 * * * *", at("2026-11-08T23:50:00Z"))), "2026-11-09T00:00:00.000Z");
  assert.equal(iso(nextCronTime("0 * * * *", at("2026-11-08T10:00:30Z"))), "2026-11-08T11:00:00.000Z");
  assert.equal(iso(nextCronTime("15 * * * *", at("2026-11-08T10:20:00Z"))), "2026-11-08T11:15:00.000Z");
  assert.equal(iso(nextCronTime("0 9 1 * *", at("2026-11-08T10:00:00Z"))), "2026-12-01T09:00:00.000Z");
  assert.throws(() => parseCron("61 * * * *"), /out of range/);
  assert.throws(() => parseCron("* * *"), /5 fields/);
});

test("describeSchedule labels the plan's shapes", () => {
  assert.equal(describeSchedule("*/15 * * * *"), "Every 15 minutes");
  assert.equal(describeSchedule("15 * * * *"), "Hourly at :15");
  assert.equal(describeSchedule("5 10 * * *"), "Daily at 10:05 UTC");
  assert.equal(describeSchedule("0 9 1 * *"), "0 9 1 * *");
});

test("zonedNoon: noon on the business date in the company time zone, across DST", () => {
  assert.equal(iso(zonedNoon("2026-07-01", "America/Los_Angeles")), "2026-07-01T19:00:00.000Z");
  assert.equal(iso(zonedNoon("2026-12-01", "America/Los_Angeles")), "2026-12-01T20:00:00.000Z");
  assert.equal(iso(zonedNoon("2026-03-08", "America/New_York")), "2026-03-08T16:00:00.000Z");
  assert.equal(iso(zonedNoon("2026-11-01", "America/New_York")), "2026-11-01T17:00:00.000Z");
  assert.equal(iso(zonedNoon("2026-11-08", "Pacific/Honolulu")), "2026-11-08T22:00:00.000Z");
  assert.equal(iso(zonedNoon("2026-11-08", "Not/AZone")), "2026-11-08T12:00:00.000Z");
});

test("asOfProblem: a real date, not after the business date, within 12 months", () => {
  assert.equal(asOfProblem("2026-11-08", "2026-11-08"), "");
  assert.equal(asOfProblem("2025-11-08", "2026-11-08"), "");
  assert.match(asOfProblem("2026-11-09", "2026-11-08"), /future/);
  assert.match(asOfProblem("2025-11-07", "2026-11-08"), /12 months/);
  assert.match(asOfProblem("2026-13-01", "2026-11-08"), /valid/);
  assert.match(asOfProblem("", "2026-11-08"), /valid/);
  assert.match(asOfProblem(undefined, "2026-11-08"), /valid/);
});

test("watchdog rules: overdue after interval plus grace, due by hand after the interval, stale after 1.5 intervals of no scheduled success", () => {
  const now = at("2026-11-08T20:00:00Z");
  assert.equal(isOverdue(null, daily, now), true, "never ran");
  assert.equal(isOverdue({ lastOkAt: ago(now, 9 * 60 + 55) }, daily, now), false, "ran at 10:05 today");
  assert.equal(isOverdue({ lastOkAt: ago(now, 24 * 60 + 30) }, daily, now), false, "within the hour of grace");
  assert.equal(isOverdue({ lastOkAt: ago(now, 34 * 60) }, daily, now), true, "today's 10:05 run never came");
  assert.equal(isOverdue({ lastOkAt: ago(now, 15) }, quarter, now), false, "the 15-minute job's own cron fires first");
  assert.equal(isOverdue({ lastOkAt: ago(now, 30) }, quarter, now), true);
  assert.equal(isOverdue({ lastOkAt: ago(now, 3000), lastStatus: "running", lastStartedAt: ago(now, 2) }, daily, now), false, "running now");
  assert.equal(isOverdue({ lastOkAt: ago(now, 3000), lastStatus: "running", lastStartedAt: ago(now, 40) }, daily, now), true, "a dead run");

  assert.equal(isDueNow({ lastOkAt: ago(now, 23 * 60) }, daily, now), false);
  assert.equal(isDueNow({ lastOkAt: ago(now, 24 * 60) }, daily, now), true);

  assert.equal(isStale({ lastScheduledOkAt: ago(now, 30 * 60) }, daily, now), false);
  assert.equal(isStale({ lastScheduledOkAt: ago(now, 37 * 60) }, daily, now), true);
  assert.equal(isStale({ lastScheduledOkAt: null, lastOkAt: ago(now, 5) }, daily, now), false, "never on schedule: the operator check covers it");
  assert.equal(isStale({ lastScheduledOkAt: ago(now, 23) }, quarter, now), true);
});

test("alerts fire on failed, partial and a second skipped_locked in a row; the parent fails only when every project that ran failed", () => {
  assert.equal(alertReason("failed"), "failed");
  assert.equal(alertReason("partial"), "partial");
  assert.equal(alertReason("skipped_locked", "succeeded"), "");
  assert.equal(alertReason("skipped_locked", "skipped_locked"), "locked");
  assert.equal(alertReason("succeeded"), "");
  assert.equal(alertReason("skipped"), "");

  assert.equal(parentStatus([]), "succeeded");
  assert.equal(parentStatus([{ status: "skipped" }, { status: "succeeded" }]), "succeeded");
  assert.equal(parentStatus([{ status: "failed" }, { status: "succeeded" }]), "partial");
  assert.equal(parentStatus([{ status: "failed" }, { status: "skipped" }, { status: "skipped_locked" }]), "failed");
  assert.equal(parentStatus([{ status: "partial" }]), "partial");
});

test("jobAlertOf: the dialog badge per job", () => {
  const now = at("2026-11-08T20:00:00Z");
  assert.equal(jobAlertOf(null, daily, now), null);
  assert.equal(jobAlertOf({ lastStatus: "failed" }, daily, now).kind, "failed");
  assert.equal(jobAlertOf({ lastStatus: "failed" }, daily, now, { paused: true }), null);
  assert.equal(jobAlertOf({ lastStatus: "skipped_locked", prevStatus: "skipped_locked" }, daily, now).kind, "locked");
  const stale = { lastStatus: "succeeded", lastScheduledOkAt: ago(now, 50 * 60) };
  assert.equal(jobAlertOf(stale, daily, now), null, "no missed-run badge before the scheduler is live");
  assert.deepEqual(jobAlertOf(stale, daily, now, { schedulerLive: true }), { kind: "missed", message: "No scheduled run since 2026-11-06" });
});

test("alertCopy words each kind and points at the dialog", () => {
  const failed = alertCopy({ label: "Bill rent & charges", kind: "failed", errors: ["lease 4B: boom", "lease 5C: boom"] });
  assert.equal(failed.title, "Bill rent & charges failed");
  assert.match(failed.body, /First error: lease 4B: boom \(\+1 more\)/);
  assert.match(failed.body, /Scheduled Jobs/);
  const missed = alertCopy({ label: "Bill rent & charges", kind: "missed", since: "2026-11-06T10:05:00Z", rerun: "succeeded" });
  assert.match(missed.paragraphs[0], /since 2026-11-06 10:05 UTC\. The watchdog ran it now: succeeded\./);
  assert.match(alertCopy({ label: "X", kind: "locked" }).title, /stuck/);
});

test("the launch cron plan: one entry per job plus the watchdog, under the /property basePath; vercel.json has none until launch, then exactly the plan", () => {
  const plan = JSON.parse(readFileSync("docs/vercel-crons.json", "utf8"));
  assert.deepEqual(plan.crons, cronEntries(JOBS, "/property"));
  assert.equal(new Set(plan.crons.map((c) => c.path)).size, JOBS.length + 1);
  for (const c of plan.crons) assert.ok(nextCronTime(c.schedule, at("2026-11-08T00:00:00Z")), c.path);
  // Vercel Pro: only these run more than once a day.
  const subDaily = JOBS.filter((j) => (j.intervalMinutes || 1440) < 1440).map((j) => j.key).sort();
  assert.deepEqual(subDaily, ["automations", "briefings", "orchestration-housekeeping", "scheduled-announcements"]);
  assert.equal(JOBS.find((j) => j.key === "scheduled-announcements").schedule, "*/15 * * * *");
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  if (config.crons !== undefined) assert.deepEqual(config.crons, plan.crons, "vercel.json crons must match docs/vercel-crons.json");
});

test("financial jobs run after local midnight in every US zone (10:00 UTC = midnight in Hawaii), late fees and autopay after billing", () => {
  const minuteOf = (key) => {
    const [m, h] = JOBS.find((j) => j.key === key).schedule.split(" ").map(Number);
    return h * 60 + m;
  };
  for (const key of ["billing", "late-fees", "management-fees", "deposit-interest", "autopay"]) assert.ok(minuteOf(key) >= 600, key);
  assert.ok(minuteOf("late-fees") > minuteOf("billing"));
  assert.ok(minuteOf("autopay") > minuteOf("billing"));
});

test("every job has a runbook entry in the dialog and the docs; as-of runs are the ledger jobs only", () => {
  const doc = readFileSync("docs/scheduled-jobs-runbook.md", "utf8");
  for (const j of JOBS) {
    assert.ok(RUNBOOK[j.key], `${j.key} runbook`);
    for (const f of ["writes", "rerun", "catchUp", "fix"]) assert.ok(RUNBOOK[j.key][f], `${j.key}.${f}`);
    assert.ok(doc.includes(`\`${j.key}\``), `${j.key} in docs/scheduled-jobs-runbook.md`);
  }
  assert.deepEqual(JOBS.filter((j) => j.asOf).map((j) => j.key).sort(), ["billing", "deposit-interest", "late-fees", "management-fees"]);
  assert.deepEqual(JOBS.filter((j) => j.manualWhilePaused).map((j) => j.key).sort(), ["impact", "orchestration-housekeeping", "signals"]);
});
