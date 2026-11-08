import { test } from "node:test";
import assert from "node:assert/strict";

import { FREQUENCY_OPTIONS, frequencyOf, monthlyEquivalent, nextOccurrence } from "./frequency";
import { addMonths } from "./periods";
import { amountThrough, anchorDayOf, chargeAdjKey, chargeKey, coveredBy, endAdjustments, parseChargeKey, planCharge, postedOccurrence } from "./charge_plan";
import { buildCharge, indexAccounts } from "@/lib/ledger/postings";

const charge = (over = {}) => ({ id: "C1", name: "Parking", amount: 100, frequency: "Monthly", next_date: "2026-11-01", status: "Active", bill_with_rent: true, prorate: false, ...over });
const dates = (plan) => plan.occurrences.map((o) => o.date);
const amounts = (plan) => plan.occurrences.map((o) => o.amount);
const LEASE = { start: "2026-01-01", end: null };

test("frequencies: one list, aliases, unknown values", () => {
  assert.deepEqual(FREQUENCY_OPTIONS.map((o) => o.value), ["Weekly", "Biweekly", "Monthly", "Quarterly", "Semi-annually", "Annually", "One-time"]);
  assert.equal(frequencyOf("semi-annual").value, "Semi-annually");
  assert.equal(frequencyOf("Every 2 weeks").value, "Biweekly");
  assert.equal(frequencyOf("yearly").value, "Annually");
  assert.equal(frequencyOf("").value, "Monthly");
  assert.equal(frequencyOf("Fortnightly-ish"), null);
  assert.match(planCharge(charge({ frequency: "Every blue moon" }), { window: LEASE, through: "2026-12-01" }).error, /Unknown frequency/);
  assert.equal(monthlyEquivalent(20, "Weekly"), 86.67);
  assert.equal(monthlyEquivalent(300, "Quarterly"), 100);
  assert.equal(monthlyEquivalent(600, "Semi-annually"), 100);
  assert.equal(monthlyEquivalent(225, "One-time"), 0);
});

test("nextOccurrence: days, anchored months, the rent due date", () => {
  assert.equal(nextOccurrence("2026-11-02", "Weekly"), "2026-11-09");
  assert.equal(nextOccurrence("2026-11-02", "Biweekly"), "2026-11-16");
  assert.equal(nextOccurrence("2026-06-01", "Semi-annually"), "2026-12-01");
  assert.equal(nextOccurrence("2026-01-31", "Monthly"), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-28", "Monthly", { anchorDay: 31 }), "2026-03-31");
  assert.equal(nextOccurrence("2026-11-15", "Monthly", { billWithRent: true, dueDay: 1 }), "2026-12-01");
  assert.equal(nextOccurrence("2026-11-05", "Monthly", { billWithRent: true, dueDay: "5" }), "2026-12-05");
  assert.equal(nextOccurrence("2026-11-05", "One-time"), null);
  assert.equal(addMonths("2027-01-31", 1, 31), "2027-02-28");
  assert.equal(addMonths("2027-02-28", 1, 31), "2027-03-31");
  assert.equal(addMonths("2027-02-28", 1), "2027-03-28");
});

test("weekly 20 from Nov 2: one run on Nov 23 catches up Nov 2, 9, 16 and 23", () => {
  const c = charge({ amount: 20, frequency: "Weekly", next_date: "2026-11-02" });
  const plan = planCharge(c, { window: LEASE, through: "2026-11-23" });
  assert.deepEqual(dates(plan), ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
  assert.deepEqual(amounts(plan), [20, 20, 20, 20]);
  assert.equal(plan.next, "2026-11-30");
  assert.equal(plan.status, "Active");
  assert.equal(planCharge({ ...c, next_date: plan.next }, { window: LEASE, through: "2026-11-23" }).occurrences.length, 0);
});

test("semi-annual posts every 6 months", () => {
  const plan = planCharge(charge({ amount: 600, frequency: "Semi-annually", next_date: "2026-06-01" }), { window: LEASE, through: "2027-06-01" });
  assert.deepEqual(dates(plan), ["2026-06-01", "2026-12-01", "2027-06-01"]);
  assert.equal(plan.next, "2027-12-01");
});

test("monthly 100 from Nov 15 with prorate, billed with rent due on the 1st: Nov 15 = 53.33, Dec 1 = 100", () => {
  const plan = planCharge(charge({ next_date: "2026-11-15", prorate: true }), { window: LEASE, through: "2026-12-01", dueDay: 1 });
  assert.deepEqual(dates(plan), ["2026-11-15", "2026-12-01"]);
  assert.deepEqual(amounts(plan), [53.33, 100]);
  assert.deepEqual([plan.occurrences[0].from, plan.occurrences[0].to], ["2026-11-15", "2026-11-30"]);
  assert.equal(plan.next, "2027-01-01");
  // Without prorate the partial first month bills in full; the 30-day method gives the same 16/30.
  assert.deepEqual(amounts(planCharge(charge({ next_date: "2026-11-15" }), { window: LEASE, through: "2026-11-30" })), [100]);
  assert.deepEqual(amounts(planCharge(charge({ next_date: "2026-11-15", prorate: true }), { window: LEASE, through: "2026-11-30", method: "thirty" })), [53.33]);
});

test("billed with rent: posts on the due day; a start that isn't the due day is a partial first period", () => {
  const p5 = planCharge(charge({ next_date: "2026-11-03", prorate: true }), { window: LEASE, through: "2026-12-31", dueDay: 5 });
  assert.deepEqual(dates(p5), ["2026-11-05", "2026-12-05"]);
  assert.deepEqual(amounts(p5), [93.33, 100]);
  const due = planCharge(charge({ next_date: "2026-12-05", prorate: true }), { window: LEASE, through: "2026-12-31", dueDay: 5 });
  assert.deepEqual(amounts(due), [100]);
  // Monthly not billed with rent keeps its own anchor day.
  const own = planCharge(charge({ next_date: "2026-11-15", bill_with_rent: false, prorate: true }), { window: LEASE, through: "2027-01-15" });
  assert.deepEqual(dates(own), ["2026-11-15", "2026-12-15", "2027-01-15"]);
  assert.deepEqual(amounts(own), [100, 100, 100]);
});

test("ends_on Dec 31: no January occurrence, status Ended", () => {
  const plan = planCharge(charge({ next_date: "2026-12-01", ends_on: "2026-12-31" }), { window: LEASE, through: "2027-01-05" });
  assert.deepEqual(dates(plan), ["2026-12-01"]);
  assert.equal(plan.status, "Ended");
  assert.equal(plan.next, "2027-01-01");
  // Nothing left to bill, but it stays Active until the end date passes, so a move-out can still true it up.
  const dec = planCharge(charge({ next_date: "2026-12-01", ends_on: "2026-12-31" }), { window: LEASE, through: "2026-12-05" });
  assert.deepEqual([dates(dec), dec.status, dec.next], [["2026-12-01"], "Active", "2027-01-01"]);
  // Already past the end: nothing posts.
  const late = planCharge(charge({ next_date: "2027-01-01", ends_on: "2026-12-31" }), { window: LEASE, through: "2027-02-05" });
  assert.deepEqual([late.occurrences.length, late.status], [0, "Ended"]);
});

test("last partial period prorates against the end date or the lease window", () => {
  const plan = planCharge(charge({ amount: 90, next_date: "2026-11-01", ends_on: "2026-11-20", prorate: true }), { window: LEASE, through: "2026-11-30" });
  assert.deepEqual([amounts(plan), plan.status], [[60], "Ended"]);
  const weekly = planCharge(charge({ amount: 70, frequency: "Weekly", next_date: "2026-11-02", prorate: true }), { window: { start: "2026-01-01", end: "2026-11-04" }, through: "2026-11-30" });
  assert.deepEqual([amounts(weekly), weekly.status], [[30], "Ended"]);
});

test("occurrences before the lease start are clipped: periods prorate, one-time charges post on the start", () => {
  const w = { start: "2026-11-10", end: null };
  const monthly = planCharge(charge({ amount: 300, next_date: "2026-11-01", prorate: true }), { window: w, through: "2026-11-30" });
  assert.deepEqual([dates(monthly), amounts(monthly)], [["2026-11-10"], [210]]);
  const weekly = planCharge(charge({ amount: 20, frequency: "Weekly", next_date: "2026-10-01" }), { window: w, through: "2026-11-20" });
  assert.deepEqual(dates(weekly), ["2026-11-10", "2026-11-12", "2026-11-19"]);
  const once = planCharge(charge({ amount: 225, frequency: "One-time", next_date: "2026-11-01" }), { window: w, through: "2026-11-30" });
  assert.deepEqual([dates(once), once.status, once.next], [["2026-11-10"], "Ended", "2026-11-01"]);
});

test("catch-up stops at 24 occurrences; the next run continues", () => {
  const plan = planCharge(charge({ amount: 5, frequency: "Weekly", next_date: "2026-01-05" }), { window: LEASE, through: "2026-12-31" });
  assert.equal(plan.occurrences.length, 24);
  assert.equal(plan.next, "2026-06-22");
});

test("post next: exactly one occurrence, due or not", () => {
  const plan = planCharge(charge({ next_date: "2027-03-01" }), { window: LEASE, through: null, limit: 1 });
  assert.deepEqual([dates(plan), plan.next, plan.status], [["2027-03-01"], "2027-04-01", "Active"]);
  const last = planCharge(charge({ next_date: "2027-03-01", ends_on: "2027-03-31" }), { window: LEASE, through: null, today: "2026-11-25", limit: 1 });
  assert.deepEqual([dates(last), last.status], [["2027-03-01"], "Active"]);
  const none = planCharge(charge({ next_date: "2027-04-01", ends_on: "2027-03-31" }), { window: LEASE, through: null, today: "2026-11-25", limit: 1 });
  assert.deepEqual([none.occurrences.length, none.status], [0, "Active"]);
});

test("month-end anchors survive a short month", () => {
  const c = charge({ next_date: "2026-01-31", bill_with_rent: false });
  const plan = planCharge(c, { window: LEASE, through: "2026-03-31" });
  assert.deepEqual(dates(plan), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.equal(anchorDayOf(charge({ next_date: "2026-02-28", metadata: { anchorDay: 31 } })), 31);
  assert.equal(anchorDayOf(charge({ next_date: "2026-02-15", metadata: { anchorDay: 31 } })), 15);
});

test("end-date true-ups: credit the cut-off days once, restore them when the end moves out", () => {
  const c = charge({ amount: 90, prorate: true });
  const occ = postedOccurrence(c, { entry_date: "2026-11-01", total: 90, metadata: { from: "2026-11-01", to: "2026-11-30", periodFrom: "2026-11-01", periodTo: "2026-11-30", period: "2026-11", basis: "month", rate: 90 } });
  const credit = endAdjustments(c, [{ date: "2026-11-01", entryId: "E1", occ, billed: 90, maxAdj: 0 }], { end: "2026-11-20" });
  assert.deepEqual(credit.map((a) => [a.delta, a.key]), [[-30, "rc-adj:C1:2026-11-01:1"]]);
  assert.equal(endAdjustments(c, [{ date: "2026-11-01", entryId: "E1", occ, billed: 60, maxAdj: 1 }], { end: "2026-11-20" }).length, 0);
  assert.deepEqual(endAdjustments(c, [{ date: "2026-11-01", entryId: "E1", occ, billed: 60, maxAdj: 1 }], { end: null }).map((a) => [a.delta, a.n]), [[30, 2]]);
  // Starting after the end: credit it all; without prorate a partial month stays billed.
  assert.equal(amountThrough(occ, "2026-10-31"), 0);
  assert.equal(amountThrough(occ, "2026-11-20", { prorate: false }), 90);
  // Legacy entries without coverage: the period is rebuilt from the date.
  const legacy = postedOccurrence(charge({ amount: 150 }), { entry_date: "2026-10-01", total: 150, metadata: {} });
  assert.deepEqual([legacy.from, legacy.to, legacy.rate], ["2026-10-01", "2026-10-31", 150]);
});

test("go-live floor: recurring occurrences before billing starts are passed over and reported; one-time charges still post", () => {
  const plan = planCharge(charge({ next_date: "2026-09-01" }), { window: LEASE, through: "2026-11-23", floor: "2026-11-01" });
  assert.deepEqual([dates(plan), plan.skipped, plan.next], [["2026-11-01"], ["2026-09-01", "2026-10-01"], "2026-12-01"]);
  const once = planCharge(charge({ amount: 225, frequency: "One-time", next_date: "2026-10-15" }), { window: LEASE, through: "2026-11-23", floor: "2026-11-01" });
  assert.deepEqual([dates(once), once.skipped, once.status], [["2026-10-15"], [], "Ended"]);
  const semi = planCharge(charge({ amount: 600, frequency: "Semi-annually", next_date: "2026-06-01" }), { window: LEASE, through: "2027-06-05", floor: "2026-11-01" });
  assert.deepEqual(dates(semi), ["2026-12-01", "2027-06-01"]);
});

test("coveredBy: a rewound or re-anchored occurrence over days already billed is caught", () => {
  const posted = [{ date: "2026-11-01", from: "2026-11-01", to: "2026-11-30" }];
  const [rewound] = planCharge(charge({ next_date: "2026-11-15", bill_with_rent: false }), { window: LEASE, through: "2026-11-15" }).occurrences;
  assert.equal(coveredBy(rewound, posted)?.date, "2026-11-01");
  const [december] = planCharge(charge({ next_date: "2026-12-01" }), { window: LEASE, through: "2026-12-01" }).occurrences;
  assert.equal(coveredBy(december, posted), null);
  assert.equal(coveredBy({ date: "2026-11-01", from: "2026-11-01", to: "2026-11-30" }, posted), null);
});

test("a move-out after the last posting still credits: $90 parking ending Jun 30, moved out Jun 15", () => {
  const c = charge({ amount: 90, next_date: "2027-06-01", ends_on: "2027-06-30", prorate: true });
  const june = planCharge(c, { window: LEASE, through: "2027-06-01" });
  assert.deepEqual([amounts(june), june.status], [[90], "Active"]);
  const occ = { ...june.occurrences[0], prorate: true };
  const credit = endAdjustments(c, [{ date: "2027-06-01", entryId: "E", occ, billed: 90, maxAdj: 0 }], { end: "2027-06-15" });
  assert.deepEqual(credit.map((a) => a.delta), [-45]);
  assert.equal(planCharge({ ...c, next_date: june.next }, { window: { ...LEASE, end: "2027-06-15" }, through: "2027-06-16" }).status, "Ended");
});

test("end moved later: a clipped occurrence is re-billed and the schedule resumes", () => {
  const c = charge({ amount: 90, next_date: "2026-11-01", ends_on: "2026-11-20", prorate: true });
  const nov = planCharge(c, { window: LEASE, through: "2026-11-25" });
  assert.deepEqual([amounts(nov), nov.status, nov.next], [[60], "Ended", "2026-12-01"]);
  const occ = { ...nov.occurrences[0], prorate: true };
  const rebill = endAdjustments({ ...c, ends_on: "2027-01-31" }, [{ date: "2026-11-01", entryId: "E", occ, billed: 60, maxAdj: 0 }], { end: "2027-01-31" });
  assert.deepEqual(rebill.map((a) => [a.delta, a.n]), [[30, 1]]);
  const resumed = planCharge({ ...c, ends_on: "2027-01-31", next_date: nov.next, status: "Active" }, { window: LEASE, through: "2027-01-05" });
  assert.deepEqual([dates(resumed), resumed.status], [["2026-12-01", "2027-01-01"], "Active"]);
  // A posting that wasn't prorated stays whole unless the end moves before it starts.
  const flat = { ...occ, amount: 90, prorate: false };
  assert.deepEqual([amountThrough(flat, "2026-11-10"), amountThrough(flat, "2026-10-31")], [90, 0]);
});

test("a proration-method change re-prices nothing; a later end uses the method the occurrence was posted with", () => {
  const c = charge({ next_date: "2026-11-15", prorate: true });
  const [nov] = planCharge(c, { window: LEASE, through: "2026-11-30", method: "actual" }).occurrences;
  const occ = { ...nov, prorate: true, method: "actual" };
  assert.equal(occ.amount, 53.33);
  assert.equal(endAdjustments(c, [{ date: nov.date, entryId: "E", occ, billed: 53.33, maxAdj: 0 }], { end: null, method: "thirty" }).length, 0);
  const [feb] = planCharge(charge({ next_date: "2027-02-01", prorate: true }), { window: LEASE, through: "2027-02-28" }).occurrences;
  const febOcc = { ...feb, prorate: true, method: "actual" };
  assert.equal(endAdjustments(c, [{ date: feb.date, entryId: "F", occ: febOcc, billed: 100, maxAdj: 0 }], { end: null, method: "thirty" }).length, 0);
  assert.deepEqual(endAdjustments(c, [{ date: feb.date, entryId: "F", occ: febOcc, billed: 100, maxAdj: 0 }], { end: "2027-02-14", method: "thirty" }).map((a) => a.delta), [-50]);
});

test("keys", () => {
  assert.equal(chargeKey("C1", "2026-11-02"), "rc:C1:2026-11-02");
  assert.equal(chargeAdjKey("C1", "2026-11-02", 2), "rc-adj:C1:2026-11-02:2");
  assert.deepEqual(parseChargeKey("rc-adj:C1:2026-11-02:2"), { kind: "adj", chargeId: "C1", date: "2026-11-02", n: 2 });
  assert.deepEqual(parseChargeKey("rc:C1:2026-11-02"), { kind: "rc", chargeId: "C1", date: "2026-11-02" });
  assert.equal(parseChargeKey("rent:L1:2026-11"), null);
});

test("buildCharge: a recurring charge without a GL books to Other Income, not rent", () => {
  const acct = indexAccounts([
    { id: "ar", systemKey: "accounts_receivable", subtype: "receivable", accountType: "Asset" },
    { id: "rent", systemKey: "rent_income", accountType: "Income" },
    { id: "other", systemKey: "other_income", accountType: "Income" },
    { id: "pet", number: "4070", accountType: "Income" },
  ]);
  const credit = (input) => buildCharge({ date: "2026-11-01", amount: 35, ...input }, acct).lines[1].glAccountId;
  assert.equal(credit({ metadata: { recurringChargeId: "C1" } }), "other");
  assert.equal(credit({ glAccountId: "pet", metadata: { recurringChargeId: "C1" } }), "pet");
  assert.equal(credit({}), "rent");
  assert.equal(credit({ incomeKey: "rent_income", metadata: { recurringChargeId: "C1" } }), "rent");
});
