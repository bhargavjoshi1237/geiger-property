import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addMonths,
  addPeriods,
  businessDate,
  dueDateFor,
  periodBounds,
  periodOf,
  prorate,
  prorationDays,
} from "./periods";
import {
  billablePeriods,
  billingWindow,
  chargeDateFor,
  firstCharge,
  projectSteps,
  rentForPeriod,
  resolveStepAmount,
  stepInForce,
} from "./rent";
import { parseRentKey, rentAdjKey, rentKey } from "./keys";
import { normalizeBillingSettings } from "./settings";

const lease = (over = {}) => ({ id: "L1", status: "Active", term_start: "2026-11-15", rent: 2000, ...over });
const step = (effective_date, amount, over = {}) => ({ id: `s-${effective_date}`, lease_id: "L1", effective_date, amount, status: "active", ...over });
const ACTUAL = { prorationMethod: "actual", prorateFirstMonth: true, rentDueDay: "1" };

test("periods: bounds, shifting, due dates", () => {
  assert.deepEqual(periodBounds("2026-02"), { start: "2026-02-01", end: "2026-02-28", days: 28 });
  assert.equal(addPeriods("2026-11", 2), "2027-01");
  assert.equal(addPeriods("2027-01", -3), "2026-10");
  assert.equal(dueDateFor("2026-02", 31), "2026-02-28");
  assert.equal(dueDateFor("2026-11", "5"), "2026-11-05");
  assert.equal(addMonths("2026-11-30", -3), "2026-08-30");
  assert.equal(addMonths("2026-05-31", -3), "2026-02-28");
  assert.equal(periodOf("2026-11-15"), "2026-11");
});

test("business date follows the company time zone", () => {
  const now = new Date("2027-01-01T06:30:00Z");
  assert.equal(businessDate(now, "America/Los_Angeles"), "2026-12-31");
  assert.equal(businessDate(now, "Asia/Kolkata"), "2027-01-01");
  assert.equal(businessDate(now, "Not/AZone"), "2027-01-01");
});

test("proration: actual days and the 30-day month", () => {
  assert.equal(prorate(2000, "2026-11-15", "2026-11-30", "2026-11", "actual"), 1066.67);
  assert.equal(prorationDays("2026-12-10", "2026-12-31", "2026-12", "actual"), 22);
  assert.equal(prorate(1500, "2026-12-01", "2026-12-31", "2026-12", "actual"), 1500);
  assert.equal(prorationDays("2026-12-15", "2026-12-31", "2026-12", "thirty"), 16);
  assert.equal(prorate(3000, "2026-02-15", "2026-02-28", "2026-02", "thirty"), 1600);
  assert.equal(prorate(3000, "2026-02-01", "2026-02-28", "2026-02", "thirty"), 3000);
});

test("first period: lease from Nov 15 at 2,000 bills 1,066.67 (16/30) on Nov 15", () => {
  const steps = [step("2026-11-15", 2000)];
  const w = billingWindow(lease());
  const r = rentForPeriod(steps, "2026-11", w, ACTUAL);
  assert.equal(r.total, 1066.67);
  assert.equal(r.full, false);
  assert.equal(chargeDateFor("2026-11", w, 1), "2026-11-15");
  assert.deepEqual(firstCharge(lease(), steps, ACTUAL), { period: "2026-11", amount: 1066.67, from: "2026-11-15", to: "2026-11-30", prorated: true });
  assert.equal(rentForPeriod(steps, "2026-11", w, { ...ACTUAL, prorateFirstMonth: false }).total, 2000);
  assert.equal(rentForPeriod(steps, "2026-12", w, ACTUAL).total, 2000);
  assert.equal(rentForPeriod(steps, "2026-10", w, ACTUAL).total, 0);
});

test("percent chain: +3% on Jan 1 bills Dec 2,000 then Jan 2,060", () => {
  const base = [step("2026-11-15", 2000)];
  const added = resolveStepAmount(base, { effectiveDate: "2027-01-01", changeMode: "percent", changeValue: 3 });
  assert.equal(added.amount, 2060);
  const steps = [...base, step("2027-01-01", added.amount, { change_mode: "percent", change_value: 3 })];
  const w = billingWindow(lease());
  assert.equal(rentForPeriod(steps, "2026-12", w, ACTUAL).total, 2000);
  assert.equal(rentForPeriod(steps, "2027-01", w, ACTUAL).total, 2060);
  assert.equal(stepInForce(steps, "2026-12-31").amount, 2000);
  assert.equal(stepInForce(steps, "2027-01-01").amount, 2060);
});

test("percent steps re-project when an earlier step changes", () => {
  const steps = [
    step("2026-01-01", 1000),
    step("2027-01-01", 1030, { change_mode: "percent", change_value: 3 }),
    step("2028-01-01", 1060.9, { change_mode: "percent", change_value: 3 }),
  ];
  const raised = projectSteps([...steps, step("2026-06-01", 1100)]);
  assert.deepEqual(raised.map((s) => s.amount), [1000, 1100, 1133, 1166.99]);
  assert.deepEqual(raised.map((s) => s.changed), [false, false, true, true]);
});

test("mid-period step splits the month by days", () => {
  const steps = [step("2026-01-01", 2000), step("2026-12-16", 2100)];
  const r = rentForPeriod(steps, "2026-12", { start: "2026-01-01", end: null }, ACTUAL);
  assert.equal(r.segments.length, 2);
  assert.equal(r.segments[0].amount, 967.74);
  assert.equal(r.segments[1].amount, 1083.87);
  assert.equal(r.total, 2051.61);
});

test("month-to-month premium adds to the rent in force", () => {
  const steps = [step("2026-01-01", 1500)];
  const mtm = resolveStepAmount(steps, { effectiveDate: "2026-12-01", source: "mtm_premium", premium: 100 });
  assert.equal(mtm.amount, 1600);
  const r = rentForPeriod([...steps, step("2026-12-01", 1600)], "2026-12", { start: "2026-01-01", end: null }, ACTUAL);
  assert.equal(r.total, 1600);
});

test("renewed leases bill through term end; drafts never bill", () => {
  assert.deepEqual(billingWindow(lease({ status: "Renewed", term_start: "2025-12-01", term_end: "2026-11-30" })), {
    start: "2025-12-01",
    end: "2026-11-30",
    billable: true,
  });
  assert.equal(billingWindow(lease({ status: "Draft" })).billable, false);
  assert.equal(billingWindow(lease({ status: "Pending" })).billable, false);
  const r = rentForPeriod([step("2025-12-01", 1500)], "2026-12", { start: "2025-12-01", end: "2026-11-30" }, ACTUAL);
  assert.equal(r.total, 0);
});

test("billable periods: due date, catch-up, go-live and lead days", () => {
  const w = { start: "2026-01-01", end: null, billable: true };
  assert.deepEqual(billablePeriods({ window: w, today: "2026-11-08" }), ["2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(billablePeriods({ window: w, today: "2026-11-08", billingStartsOn: "2026-11-01" }), ["2026-11"]);
  assert.deepEqual(billablePeriods({ window: w, today: "2026-11-08", billingStartsOn: "2026-12-01" }), []);
  assert.deepEqual(billablePeriods({ window: w, today: "2026-11-24", billingStartsOn: "2026-11-01", leadDays: 6 }), ["2026-11"]);
  assert.deepEqual(billablePeriods({ window: w, today: "2026-11-25", billingStartsOn: "2026-11-01", leadDays: 6 }), ["2026-11", "2026-12"]);
  const late = { start: "2026-11-15", end: null, billable: true };
  assert.deepEqual(billablePeriods({ window: late, today: "2026-11-08", billingStartsOn: "2026-11-01" }), []);
  assert.deepEqual(billablePeriods({ window: late, today: "2026-11-08", billingStartsOn: "2026-11-01", includeFirst: true }), ["2026-11"]);
  assert.deepEqual(billablePeriods({ window: { start: "2026-06-01" }, today: "2026-11-08", catchUpMonths: null, includeFirst: true }), [
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
  ]);
});

test("keys and settings", () => {
  assert.equal(rentKey("L1", "2026-11"), "rent:L1:2026-11");
  assert.deepEqual(parseRentKey(rentAdjKey("L1", "2026-11", 2)), { kind: "adj", owner: "L1", period: "2026-11", n: 2 });
  assert.deepEqual(parseRentKey("movein:L1:rent"), { kind: "movein", owner: "L1" });
  assert.equal(parseRentKey("rent:L1:bad"), null);
  assert.deepEqual(normalizeBillingSettings({ rentPostLeadDays: "5", jobsPaused: 1 }), {
    rentPostLeadDays: 5,
    jobsPaused: true,
    autoBillRent: true,
    billingStartsOn: "",
  });
});
