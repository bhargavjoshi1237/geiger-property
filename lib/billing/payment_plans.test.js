import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPlanDeferral, buildPlanRebill, indexAccounts, summarize } from "@/lib/ledger/postings";
import { buildPlanMergeValues } from "@/lib/leasing/merge";
import { deferredByLease } from "@/lib/reports/ledger_math";
import { classifyEntry } from "./ar_summary";
import { planLateFees } from "./late_fee_rules";
import {
  buildSchedule,
  deferAllocations,
  installmentDueDate,
  installmentMemo,
  lateFeePlan,
  openByEntryOf,
  parsePlanKey,
  pastDueOf,
  planAccelerateKey,
  planDeferKey,
  planInstallmentKey,
  planStanding,
  shouldDefault,
  validatePlan,
} from "./payment_plan_rules";

const ACCOUNTS = indexAccounts([
  { id: "ar", number: "1200", accountType: "Asset", subtype: "receivable", systemKey: "accounts_receivable" },
  { id: "def", number: "1210", accountType: "Asset", subtype: "deferred_receivable", systemKey: "deferred_receivable" },
  { id: "inc", number: "4000", accountType: "Income", subtype: "income", systemKey: "rent_income" },
]);
const PLAN = { id: "PL", totalAmount: 1800, downPayment: 300, installmentCount: 5, frequency: "Monthly", firstDue: "2026-12-01", graceDays: 5, status: "Active", suspendLateFees: true };
const installments = (over = {}) =>
  buildSchedule(PLAN).map((s) => ({ id: `i${s.seq}`, ...s, status: "Scheduled", chargeEntryId: "", ...(over[s.seq] || {}) }));

test("keys: deferral, each installment and the accelerated remainder", () => {
  assert.equal(planDeferKey("PL"), "plan:PL:defer");
  assert.equal(planInstallmentKey("PL", 3), "plan:PL:inst:3");
  assert.equal(planAccelerateKey("PL"), "plan:PL:accelerate");
  assert.deepEqual(parsePlanKey("plan:PL:inst:3"), { planId: "PL", kind: "inst", seq: 3 });
  assert.deepEqual(parsePlanKey("plan:PL:defer"), { planId: "PL", kind: "defer" });
  assert.equal(parsePlanKey("plan:PL:inst:x"), null);
  assert.equal(parsePlanKey("rent:L1:2026-11"), null);
  assert.equal(installmentMemo(3, 6), "Payment plan 3 of 6");
});

test("schedule: 1,800 less 300 down in 5 × 300 monthly from Dec 1", () => {
  assert.deepEqual(
    buildSchedule(PLAN).map((s) => [s.seq, s.dueDate, s.amount]),
    [
      [1, "2026-12-01", 300],
      [2, "2027-01-01", 300],
      [3, "2027-02-01", 300],
      [4, "2027-03-01", 300],
      [5, "2027-04-01", 300],
    ],
  );
});

test("schedule: leftover cents land on the last installment; month-end and weekly dates", () => {
  const s = buildSchedule({ totalAmount: 1000, installmentCount: 3, frequency: "Monthly", firstDue: "2027-01-31" });
  assert.deepEqual(s.map((x) => x.amount), [333.33, 333.33, 333.34]);
  assert.deepEqual(s.map((x) => x.dueDate), ["2027-01-31", "2027-02-28", "2027-03-31"]);
  assert.equal(installmentDueDate("2026-11-12", "Weekly", 3), "2026-11-26");
  assert.equal(installmentDueDate("2026-11-12", "Biweekly", 2), "2026-11-26");
  assert.deepEqual(buildSchedule({ totalAmount: 100, downPayment: 100, installmentCount: 2, firstDue: "2026-12-01" }), []);
});

test("validation: amounts, count, dates and the open-charges ceiling", () => {
  const ok = { totalAmount: 1800, downPayment: 300, installmentCount: 5, frequency: "Monthly", firstDue: "2026-12-01" };
  assert.equal(validatePlan(ok, { today: "2026-11-10", openTotal: 1800 }), "");
  assert.match(validatePlan({ ...ok, downPayment: 1800 }), /less than the plan total/);
  assert.match(validatePlan({ ...ok, installmentCount: 0 }), /between 1 and 120/);
  assert.match(validatePlan({ ...ok, frequency: "Daily" }), /weekly/);
  assert.match(validatePlan({ ...ok, firstDue: "2026-11-01" }, { today: "2026-11-10" }), /before today/);
  assert.match(validatePlan({ ...ok, graceDays: 90 }), /0 to 60/);
  assert.match(validatePlan(ok, { openTotal: 1500 }), /more than the lease owes/);
  assert.match(validatePlan({ totalAmount: 0.02, installmentCount: 3, firstDue: "2026-12-01" }), /at least \$0.01/);
});

test("deferral: oldest open charges first up to total − down payment; a shortfall is reported", () => {
  const items = [
    { entryId: "sep", date: "2026-09-01", open: 600 },
    { entryId: "oct", date: "2026-10-01", open: 900 },
    { entryId: "nov", date: "2026-11-01", open: 900 },
  ];
  assert.equal(pastDueOf(items, "2026-11-01"), 1500);
  assert.deepEqual(deferAllocations(items, 1500), { allocations: [{ entryId: "sep", amount: 600 }, { entryId: "oct", amount: 900 }], short: 0 });
  assert.equal(deferAllocations(items.slice(0, 1), 1500).short, 900);
});

test("builders: Dr 1210 / Cr AR applied to each deferred charge; installments and the remainder Dr AR / Cr 1210", () => {
  const defer = buildPlanDeferral({ leaseId: "L", date: "2026-11-10", amount: 1500, paymentPlanId: "PL", allocations: [{ entryId: "sep", amount: 600 }, { entryId: "oct", amount: 900 }] }, ACCOUNTS);
  assert.equal(defer.entry.sourceType, "payment_plan");
  assert.deepEqual(defer.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.appliesToEntryId || ""]), [["def", 1500, 0, ""], ["ar", 0, 600, "sep"], ["ar", 0, 900, "oct"]]);
  assert.ok(defer.lines.every((l) => l.metadata.paymentPlanId === "PL"));
  assert.match(buildPlanDeferral({ amount: 1500, allocations: [{ entryId: "sep", amount: 600 }] }, ACCOUNTS).error, /exactly/);
  const inst = buildPlanRebill({ leaseId: "L", date: "2026-12-01", amount: 300, sourceType: "charge", memo: installmentMemo(1, 5), paymentPlanId: "PL" }, ACCOUNTS);
  assert.deepEqual(inst.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0]), [["ar", 300, 0], ["def", 0, 300]]);
  assert.equal(inst.entry.sourceType, "charge");
  assert.equal(buildPlanRebill({ amount: 300, sourceType: "payment_plan" }, ACCOUNTS).entry.sourceType, "payment_plan");
  assert.ok(buildPlanRebill({ amount: 300 }, indexAccounts([])).error);
});

test("summarize: a deferred bucket next to receivable; the lease's 1210 balance by date", () => {
  const lines = [
    { glAccountId: "ar", debit: 1800, credit: 0, leaseId: "L", date: "2026-10-01" },
    { glAccountId: "ar", debit: 0, credit: 1500, leaseId: "L", date: "2026-11-10" },
    { glAccountId: "def", debit: 1500, credit: 0, leaseId: "L", date: "2026-11-10" },
    { glAccountId: "ar", debit: 300, credit: 0, leaseId: "L", date: "2026-12-01" },
    { glAccountId: "def", debit: 0, credit: 300, leaseId: "L", date: "2026-12-01" },
  ];
  const s = summarize(lines, ACCOUNTS);
  assert.equal(s.receivable, 600);
  assert.equal(s.deferred, 1200);
  assert.equal(deferredByLease(lines, ACCOUNTS, "2026-11-30").get("L").amount, 1500);
  assert.equal(deferredByLease(lines, ACCOUNTS, "2026-12-31").get("L").amount, 1200);
});

test("standing: paid when nothing is open, missed past due + grace, billed in between", () => {
  const rows = installments({ 1: { chargeEntryId: "e1" }, 2: { chargeEntryId: "e2" } });
  const open = new Map([["e1", 0], ["e2", 300]]);
  const jan6 = planStanding(PLAN, rows, { openByEntry: open, today: "2027-01-06" });
  assert.deepEqual(jan6.installments.map((i) => i.status), ["Paid", "Billed", "Scheduled", "Scheduled", "Scheduled"]);
  assert.equal(jan6.inGoodStanding, true);
  assert.equal(jan6.unbilled, 900);
  assert.equal(jan6.nextDue.seq, 2);
  const jan7 = planStanding(PLAN, rows, { openByEntry: open, today: "2027-01-07" });
  assert.equal(jan7.installments[1].status, "Missed");
  assert.equal(jan7.missed, 1);
  assert.equal(jan7.inGoodStanding, false);
  assert.deepEqual(lateFeePlan(PLAN, jan7), { id: "PL", status: "Active", inGoodStanding: false, suspendLateFees: true });
  const paid = planStanding(PLAN, installments(Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, { chargeEntryId: `e${n}` }]))), { openByEntry: new Map([1, 2, 3, 4, 5].map((n) => [`e${n}`, 0])), today: "2027-05-01" });
  assert.equal(paid.installments.every((i) => i.status === "Paid"), true);
  assert.equal(paid.allPaid, true);
});

test("standing: accelerated installments share the accelerate entry, paid oldest first", () => {
  const acc = { chargeEntryId: "acc", accelerated: true };
  const rows = installments({ 1: { chargeEntryId: "e1" }, 2: { chargeEntryId: "e2" }, 3: acc, 4: acc, 5: acc });
  const s = planStanding({ ...PLAN, status: "Defaulted" }, rows, { openByEntry: new Map([["e1", 0], ["e2", 300], ["acc", 500]]), today: "2027-01-20" });
  assert.deepEqual(s.installments.map((i) => [i.status, i.open]), [["Paid", 0], ["Missed", 300], ["Paid", 0], ["Billed", 200], ["Billed", 300]]);
  assert.equal(s.open, 800);
});

test("open per installment from the lease's open items; default after the policy's missed count", () => {
  const rows = installments({ 1: { chargeEntryId: "e1" }, 2: { chargeEntryId: "e2" } });
  assert.deepEqual([...openByEntryOf([{ entryId: "e2", open: 120 }, { entryId: "rent", open: 900 }], rows)], [["e1", 0], ["e2", 120]]);
  const one = { missed: 1 };
  assert.equal(shouldDefault(one, {}), true);
  assert.equal(shouldDefault(one, { planDefaultAfterMissed: "2" }), false);
  assert.equal(shouldDefault({ missed: 2 }, { planDefaultAfterMissed: 2 }), true);
  assert.equal(shouldDefault({ missed: 5 }, { planDefaultAfterMissed: 0 }), false);
});

test("an installment entry classifies as its own kind in its due month", () => {
  assert.deepEqual(classifyEntry({ idempotencyKey: "plan:PL:inst:2", sourceType: "charge", date: "2027-01-01" }), { kind: "installment", period: "2027-01" });
  assert.equal(classifyEntry({ idempotencyKey: "plan:PL:accelerate", sourceType: "payment_plan", date: "2027-01-07" }).kind, "payment_plan");
});

// Late fees on a lease with an active plan (CORE-06 seam): rent months suspended in good standing; installments only with lateFeeOnInstallments.
const FLAT = { lateFeeType: "flat", lateFeeAmount: 75, graceDays: 5, rentDueDay: "1", lateFeeMinBalance: 0 };
const LEASE = { id: "L1", status: "Active", project_id: "P" };
const decRent = { entryId: "r-dec", kind: "rent", period: "2026-12", date: "2026-12-01", amount: 900, open: 900 };
const inst1 = { entryId: "e1", kind: "installment", period: "2026-12", date: "2026-12-01", amount: 300, open: 300 };
const run = (policies, plan, items = [decRent, inst1]) =>
  planLateFees({ leaseId: "L1", lease: LEASE, policies, plan, receivable: { items, credit: 0, lateFees: {} }, billed: new Map([["2026-12", 900]]), today: "2026-12-10" });

test("late fees: a plan in good standing suspends rent months; a lapsed plan doesn't", () => {
  const good = { status: "Active", inGoodStanding: true, suspendLateFees: true };
  assert.equal(run(FLAT, good).stop, "payment_plan");
  const lapsed = run(FLAT, { ...good, inGoodStanding: false });
  assert.equal(lapsed.stop, null);
  assert.deepEqual(lapsed.periods.map((p) => [p.period, p.base, p.delta]), [["2026-12", 900, 75]]);
  assert.equal(run(FLAT, { ...good, suspendLateFees: false }).periods[0].delta, 75);
});

test("late fees: lateFeeOnInstallments charges a late installment, on its amount, while rent stays suspended", () => {
  const policies = { ...FLAT, lateFeeType: "percent", lateFeeAmount: 10, lateFeeOnInstallments: true };
  const good = { status: "Active", inGoodStanding: true, suspendLateFees: true };
  const res = run(policies, good);
  assert.equal(res.stop, null);
  assert.deepEqual(res.periods.map((p) => [p.period, p.base, p.open, p.delta]), [["2026-12", 300, 300, 30]]);
  const paidInstallment = run(policies, good, [decRent, { ...inst1, open: 0 }].filter((i) => i.open > 0));
  assert.equal(paidInstallment.periods.length, 0);
  // Not in good standing: rent and the installment both count toward the month.
  const lapsed = run(policies, { ...good, inGoodStanding: false });
  assert.deepEqual(lapsed.periods.map((p) => [p.base, p.open, p.delta]), [[1200, 1200, 120]]);
});

test("agreement values: amounts, schedule, late-fee and default terms", () => {
  const v = buildPlanMergeValues({ plan: { ...PLAN, name: "Fall plan" }, installments: buildSchedule(PLAN), policies: { planDefaultAfterMissed: 1 }, lateFee: "$75" });
  assert.equal(v["plan.total"], "$1,800");
  assert.equal(v["plan.financed"], "$1,500");
  assert.equal(v["plan.installment_count"], "5");
  assert.equal(v["plan.first_due"], "December 1, 2026");
  assert.equal(v["plan.last_due"], "April 1, 2027");
  assert.match(v["plan.schedule"], /^1\. December 1, 2026 — \$300\n2\. January 1, 2027 — \$300/);
  assert.match(v["plan.late_fees"], /no late fees are charged on rent or on the installments/);
  assert.match(v["plan.default_terms"], /^If an installment is still unpaid 5 days after the due date/);
  const twice = buildPlanMergeValues({ plan: PLAN, installments: [], policies: { planDefaultAfterMissed: 2, lateFeeOnInstallments: true }, lateFee: "$75" });
  assert.match(twice["plan.default_terms"], /^If 2 installments are still unpaid/);
  assert.match(twice["plan.late_fees"], /a late installment is charged \$75/);
});
