import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closableMonths,
  closedThroughLabel,
  firstOpenDate,
  fiscalYearOf,
  fiscalYearRange,
  isLockError,
  isLocked,
  isPeriodOpenAfter,
  lockMessage,
  lockedThroughOf,
  monthEnd,
  monthLabel,
  nextClosablePeriod,
  normalizeStartMonth,
  openDateFor,
} from "./periods";

// CORE-40: fiscal years, the lock date and the months a project can close.

test("fiscalYearRange: calendar and July fiscal years, named for the year they end in", () => {
  assert.deepEqual(fiscalYearRange("2027-06-30", 1), { start: "2027-01-01", end: "2027-12-31", year: 2027 });
  assert.deepEqual(fiscalYearRange("2027-06-30", 7), { start: "2026-07-01", end: "2027-06-30", year: 2027 });
  assert.deepEqual(fiscalYearRange("2027-07-01", 7), { start: "2027-07-01", end: "2028-06-30", year: 2028 });
  assert.equal(fiscalYearOf("2026-03-31", 4), 2026);
  assert.equal(fiscalYearOf("2026-04-01", 4), 2027);
  assert.deepEqual(fiscalYearRange("2028-02-29", 3), { start: "2027-03-01", end: "2028-02-29", year: 2028 });
});

test("normalizeStartMonth: strings and bad values", () => {
  assert.equal(normalizeStartMonth("7"), 7);
  assert.equal(normalizeStartMonth(""), 1);
  assert.equal(normalizeStartMonth("13"), 1);
  assert.equal(normalizeStartMonth(null), 1);
});

test("the lock date: first open day, locked dates, open periods and redirected posting dates", () => {
  assert.equal(firstOpenDate("2027-03-31"), "2027-04-01");
  assert.equal(firstOpenDate("2027-12-31"), "2028-01-01");
  assert.equal(firstOpenDate(null), "");
  assert.equal(isLocked("2027-03-15", "2027-03-31"), true);
  assert.equal(isLocked("2027-03-31", "2027-03-31"), true);
  assert.equal(isLocked("2027-04-01", "2027-03-31"), false);
  assert.equal(isLocked("2027-03-15", ""), false);
  assert.equal(isPeriodOpenAfter("2027-03", "2027-03-31"), false);
  assert.equal(isPeriodOpenAfter("2027-04", "2027-03-31"), true);
  assert.equal(isPeriodOpenAfter("2027-03", null), true);
  assert.equal(openDateFor("2027-03-01", "2027-03-31"), "2027-04-01");
  assert.equal(openDateFor("2027-04-05", "2027-03-31"), "2027-04-05");
  assert.equal(openDateFor("2027-03-01", null), "2027-03-01");
});

test("nextClosablePeriod / closableMonths: in order once something is closed, any ended month before that", () => {
  assert.deepEqual(nextClosablePeriod("2027-03-31", "2027-05-02"), { start: "2027-04-01", end: "2027-04-30", key: "2027-04" });
  assert.equal(nextClosablePeriod("2027-04-30", "2027-05-20"), null, "May hasn't ended");
  assert.deepEqual(nextClosablePeriod("", "2027-05-02"), { start: "2027-04-01", end: "2027-04-30", key: "2027-04" });
  assert.deepEqual(closableMonths("2027-03-31", "2027-05-02").map((m) => m.key), ["2027-04"]);
  const first = closableMonths("", "2027-05-02", { limit: 3 });
  assert.deepEqual(first.map((m) => m.end), ["2027-04-30", "2027-03-31", "2027-02-28"]);
  assert.deepEqual(closableMonths("", "2027-05-02", { earliest: "2027-03-15" }).map((m) => m.key), ["2027-04", "2027-03"]);
  assert.equal(monthEnd("2028-02-10"), "2028-02-29");
});

test("lock errors: the trigger message, its SQLSTATE and the sentence a person reads", () => {
  const err = { code: "GL001", message: "ledger: period closed through 2027-03-31" };
  assert.equal(lockedThroughOf(err), "2027-03-31");
  assert.equal(isLockError(err), true);
  assert.equal(isLockError({ code: "GL001", message: "x" }), true);
  assert.equal(isLockError({ code: "42501", message: "nope" }), false);
  assert.equal(lockMessage("2027-03-31"), "The books are closed through Mar 31, 2027. Date it Apr 1, 2027 or later, or reopen the period first.");
  assert.match(lockMessage(""), /closed period/);
  assert.equal(closedThroughLabel("2027-03-31"), "Books closed through Mar 31, 2027");
  assert.equal(closedThroughLabel(""), "");
  assert.equal(monthLabel("2027-03-01"), "March 2027");
});
