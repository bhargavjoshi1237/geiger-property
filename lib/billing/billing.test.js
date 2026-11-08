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
  billingStartFor,
  billingWindow,
  chargeDateFor,
  firstCharge,
  projectSteps,
  rentForPeriod,
  resolveStepAmount,
  stepInForce,
} from "./rent";
import { isRentTrueUpCredit, parseRentKey, rentAdjKey, rentKey, summarizeRentEntries } from "./keys";
import { buildArTransfer, buildRentAdjustment, indexAccounts, openItems } from "@/lib/ledger/postings";
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

// --- Review fixes (CORE-01) ------------------------------------------------------------

const ACCT = indexAccounts([
  { id: "ar", systemKey: "accounts_receivable", subtype: "receivable", accountType: "Asset" },
  { id: "rent", systemKey: "rent_income", subtype: "income", accountType: "Income" },
  { id: "conc", systemKey: "concessions", subtype: "income", accountType: "Income" },
]);
const sumOf = (lines, side) => lines.reduce((t, l) => t + (Number(l[side]) || 0), 0);

test("30-day proration: segments always sum to 30 days, day 31 folds into day 30", () => {
  assert.equal(prorationDays("2027-01-01", "2027-01-30", "2027-01", "thirty") + prorationDays("2027-01-31", "2027-01-31", "2027-01", "thirty"), 30);
  assert.equal(prorationDays("2027-01-01", "2027-01-15", "2027-01", "thirty") + prorationDays("2027-01-16", "2027-01-31", "2027-01", "thirty"), 30);
  assert.equal(prorationDays("2027-02-01", "2027-02-14", "2027-02", "thirty") + prorationDays("2027-02-15", "2027-02-28", "2027-02", "thirty"), 30);
  const steps = [
    { id: "a", effectiveDate: "2026-01-01", amount: 3000 },
    { id: "b", effectiveDate: "2027-01-31", amount: 3300 },
  ];
  assert.equal(rentForPeriod(steps, "2027-01", { start: "2026-01-01" }, { prorationMethod: "thirty" }).total, 3000);
});

test("leap year: February 2028 prorates over 29 actual days", () => {
  assert.equal(prorationDays("2028-02-15", "2028-02-29", "2028-02", "actual"), 15);
  assert.equal(prorate(2900, "2028-02-15", "2028-02-29", "2028-02", "actual"), 1500);
  const r = rentForPeriod([{ id: "a", effectiveDate: "2028-02-15", amount: 2900 }], "2028-02", { start: "2028-02-15" }, {});
  assert.equal(r.total, 1500);
  assert.equal(r.full, false);
});

test("billing window: a Renewed lease ends the day before its successor; an accepted renewal bills while Pending", () => {
  const old = { id: "o", status: "Renewed", term_start: "2025-07-01", term_end: "2026-06-30", metadata: { billingEndsOn: "2026-11-30" } };
  assert.deepEqual(billingWindow(old), { start: "2025-07-01", end: "2026-11-30", billable: true });
  assert.equal(billingWindow({ id: "n", status: "Pending", term_start: "2026-12-01", renewal_of_id: "o" }).billable, false);
  assert.equal(billingWindow({ id: "n", status: "Pending", term_start: "2026-12-01", renewal_of_id: "o", metadata: { renewalAcceptedOn: "2026-11-20" } }).billable, true);
  assert.equal(billingStartFor({ id: "x", metadata: { billingStartsOn: "2027-02-01" } }, { billingStartsOn: "2026-11-01" }), "2027-02-01");
  assert.equal(billingStartFor({ id: "x" }, { billingStartsOn: "2026-11-01" }), "2026-11-01");
});

test("activation catch-up: the first period only when it is inside the 3-month window", () => {
  const old = { start: "2025-01-15" };
  assert.deepEqual(billablePeriods({ window: old, today: "2026-11-08", billingStartsOn: "2025-01-01", includeFirst: true }), ["2026-08", "2026-09", "2026-10", "2026-11"]);
  const recent = { start: "2026-10-15" };
  assert.deepEqual(billablePeriods({ window: recent, today: "2026-11-08", billingStartsOn: "2026-10-01", includeFirst: true }), ["2026-10", "2026-11"]);
});

test("a month-to-month premium stays relative to the rent before it", () => {
  const steps = [
    { id: "a", effectiveDate: "2025-12-01", amount: 1500 },
    { id: "m", effectiveDate: "2026-12-01", amount: 1600, source: "mtm_premium", metadata: { premium: 100 } },
  ];
  assert.deepEqual(projectSteps(steps).map((s) => [s.amount, s.changed]), [[1500, false], [1600, false]]);
  const corrected = [{ ...steps[0], amount: 1550 }, steps[1]];
  assert.deepEqual(projectSteps(corrected).map((s) => s.amount), [1550, 1650]);
  const plain = [steps[0], { ...steps[1], metadata: {} }];
  assert.equal(projectSteps(plain)[1].amount, 1600);
});

test("buildRentAdjustment: up is a rent charge, down is a credit applied to the period's rent", () => {
  const up = buildRentAdjustment({ date: "2026-11-20", amount: 50, leaseId: "L" }, ACCT);
  assert.equal(up.entry.sourceType, "charge");
  assert.deepEqual(up.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0]), [["ar", 50, 0], ["rent", 0, 50]]);
  const down = buildRentAdjustment({ date: "2026-11-20", amount: -50, leaseId: "L", allocations: [{ entryId: "rent-nov", amount: 50 }] }, ACCT);
  assert.equal(down.entry.sourceType, "credit");
  assert.deepEqual(down.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.appliesToEntryId || ""]), [["rent", 50, 0, ""], ["ar", 0, 50, "rent-nov"]]);
  assert.ok(buildRentAdjustment({ amount: 0 }, ACCT).error);
});

test("buildArTransfer: items keep their age, credit moves per source, uncovered credit stays put", () => {
  const out = buildArTransfer(
    {
      fromLeaseId: "old",
      toLeaseId: "new",
      date: "2026-11-20",
      items: [
        { entryId: "c1", open: 200, date: "2026-09-05", memo: "Fee" },
        { entryId: "c2", open: 300, date: "2026-10-05", seq: 2 },
      ],
      credit: 150,
      creditSources: [{ entryId: "p1", amount: 100 }],
    },
    ACCT,
  );
  assert.deepEqual(out.entries.map((e) => e.entry.idempotencyKey), ["xfer:new:c1", "xfer:new:c2:2", "xfer:new:credit:p1"]);
  assert.equal(out.uncovered, 50);
  for (const e of out.entries) assert.equal(sumOf(e.lines, "debit"), sumOf(e.lines, "credit"));
  const [first, , credit] = out.entries;
  assert.deepEqual(first.lines.map((l) => [l.leaseId, l.debit || 0, l.credit || 0, l.appliesToEntryId || "", l.metadata?.originalDate || ""]), [
    ["new", 200, 0, "", "2026-09-05"],
    ["old", 0, 200, "c1", ""],
  ]);
  assert.deepEqual(credit.lines.map((l) => [l.leaseId, l.debit || 0, l.credit || 0, l.appliesToEntryId || ""]), [
    ["old", 100, 0, "p1"],
    ["new", 0, 100, ""],
  ]);
});

test("openItems dates a carried item by its original date", () => {
  const lines = [
    { entryId: "x1", glAccountId: "ar", debit: 200, credit: 0, date: "2026-11-20", metadata: { originalDate: "2026-09-05" }, entry: { status: "posted" } },
    { entryId: "pay", glAccountId: "ar", debit: 0, credit: 50, date: "2026-11-21", appliesToEntryId: "x1", entry: { status: "posted" } },
  ];
  const [item] = openItems(lines, ACCT, "receivable");
  assert.deepEqual([item.date, item.open], ["2026-09-05", 150]);
});

test("summarizeRentEntries: what each period billed, from rent, true-up, legacy and move-in keys", () => {
  const e = (id, key, total, extra = {}) => ({ id, lease_id: "L", idempotency_key: key, total, entry_date: "2026-11-01", status: "posted", source_type: "charge", ...extra });
  const rows = [
    e("r1", "rent:L:2026-11", 1500),
    e("a1", "rent-adj:L:2026-11:1", 50),
    e("a2", "rent-adj:L:2026-11:2", 50, { source_type: "credit" }),
    e("a3", "rent-adj:L:2026-11:3", 80, { status: "void" }),
    e("g1", "rent:ACCOUNT:2026-10", 1500, { entry_date: "2026-10-01" }),
    e("m1", "movein:L:rent", 700, { entry_date: "2026-09-15" }),
    e("x", "rc:L:2026-11", 99),
  ];
  const byPeriod = summarizeRentEntries(rows, ["L"]).get("L");
  assert.equal(byPeriod.get("2026-11").total, 1500);
  assert.equal(byPeriod.get("2026-11").maxAdj, 3);
  assert.equal(byPeriod.get("2026-11").primaryEntryId, "r1");
  assert.equal(byPeriod.get("2026-11").mainKeyTaken, true);
  assert.deepEqual([byPeriod.get("2026-10").total, byPeriod.get("2026-10").entries[0].kind], [1500, "legacy"]);
  assert.deepEqual([byPeriod.get("2026-09").total, byPeriod.get("2026-09").entries[0].kind], [700, "movein"]);
  assert.equal(isRentTrueUpCredit({ sourceType: "credit", idempotencyKey: "rent-adj:L:2026-11:2" }), true);
  assert.equal(isRentTrueUpCredit({ sourceType: "credit", idempotencyKey: "conc:L:1" }), false);
});
