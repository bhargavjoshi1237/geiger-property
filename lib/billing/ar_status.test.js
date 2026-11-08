import { test } from "node:test";
import assert from "node:assert/strict";
import { rentAccountStatus, rentOverdueOf } from "./ar_status";

// CORE-07: rent-account statuses and the rent.overdue gate come from the lease's tenant AR.

test("rent account status: Current at zero or credit, Due within grace, Overdue past it", () => {
  const at = (over) => rentAccountStatus({ today: "2026-11-08", graceDays: 5, ...over });
  assert.equal(at({ balance: 0, oldestOpenDate: null }), "Current");
  assert.equal(at({ balance: -25, oldestOpenDate: "2026-11-01" }), "Current");
  assert.equal(at({ balance: 1500, oldestOpenDate: "2026-11-03" }), "Due");
  assert.equal(at({ balance: 1500, oldestOpenDate: "2026-11-03", graceDays: 5 }), "Due"); // day 5 of grace
  assert.equal(at({ balance: 1500, oldestOpenDate: "2026-11-02" }), "Overdue");
  assert.equal(at({ balance: 1500, oldestOpenDate: "2026-11-20" }), "Due"); // only a future-dated charge
  assert.equal(at({ balance: 10, oldestOpenDate: null }), "Due");
});

test("rent account status: In collections is sticky, Draft and manual statuses follow the ledger", () => {
  assert.equal(rentAccountStatus({ balance: 0, today: "2026-11-08", current: "In collections" }), "In collections");
  assert.equal(rentAccountStatus({ balance: 900, oldestOpenDate: "2026-09-01", today: "2026-11-08", current: "In collections" }), "In collections");
  assert.equal(rentAccountStatus({ balance: 0, today: "2026-11-08", current: "Partial" }), "Current");
});

test("rent.overdue fires for 6-day-old open rent at daysOverdue 5, never for a future-dated charge", () => {
  const today = "2026-11-08";
  const fired = rentOverdueOf({ balance: 1500, oldestOpenDate: "2026-11-02" }, { today, daysOverdue: 5, minBalance: 1 });
  assert.deepEqual(fired, { balance: 1500, oldestOpenDate: "2026-11-02", daysLate: 6 });
  assert.equal(rentOverdueOf({ balance: 1500, oldestOpenDate: "2026-11-04" }, { today, daysOverdue: 5 }), null); // 4 days
  assert.equal(rentOverdueOf({ balance: 1500, oldestOpenDate: "2026-11-03" }, { today, daysOverdue: 5 })?.daysLate, 5);
  assert.equal(rentOverdueOf({ balance: 1500, oldestOpenDate: "2026-12-01" }, { today, daysOverdue: 5 }), null);
});

test("rent.overdue respects the minimum balance and ignores credit balances", () => {
  const today = "2026-11-08";
  assert.equal(rentOverdueOf({ balance: 40, oldestOpenDate: "2026-10-01" }, { today, daysOverdue: 5, minBalance: 50 }), null);
  assert.equal(rentOverdueOf({ balance: 50, oldestOpenDate: "2026-10-01" }, { today, daysOverdue: 5, minBalance: 50 })?.balance, 50);
  assert.equal(rentOverdueOf({ balance: -10, oldestOpenDate: "2026-10-01" }, { today, daysOverdue: 5, minBalance: 0 }), null);
  assert.equal(rentOverdueOf(undefined, { today }), null);
});
