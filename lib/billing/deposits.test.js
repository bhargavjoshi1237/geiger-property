import { test } from "node:test";
import assert from "node:assert/strict";

import {
  depintKey,
  depintPayKey,
  depositApplyKey,
  depositChargeKey,
  depositDeductionKey,
  depositReleaseKey,
  depositSweepKey,
  disposedStatus,
  fundedPrincipal,
  interestPeriodFor,
  interestRateFor,
  leaseDepositsDue,
  legacyDepintKey,
  monthlyInterest,
  planDisposition,
  summarizeDepositLines,
  sweepRows,
} from "./deposits_math";
import {
  buildBill,
  buildDepositApply,
  buildDepositCharge,
  buildDepositInterest,
  buildDepositInterestCredit,
  buildDepositReturn,
  buildDepositTransfer,
  indexAccounts,
} from "@/lib/ledger/postings";
import { payeeLabel, payeeTypeOf, prepareBill } from "@/lib/accounting/bills";

const ACCT = indexAccounts(
  [
    ["trust", "trust_cash", "1010", "Asset", "cash"],
    ["dcash", "deposit_cash", "1020", "Asset", "cash"],
    ["ar", "accounts_receivable", "1200", "Asset", "receivable"],
    ["ap", "accounts_payable", "2000", "Liability", "payable"],
    ["sd", "security_deposits", "2100", "Liability", "deposits"],
    ["dip", "deposit_interest_payable", "2110", "Liability", "deposits"],
    ["oi", "other_income", "4100", "Income", "income"],
    ["die", "deposit_interest", "5600", "Expense", "expense"],
  ].map(([id, systemKey, number, accountType, subtype]) => ({ id, systemKey, number, accountType, subtype, name: systemKey })),
);
const sides = (built) => built.lines.map((l) => `${l.debit ? "Dr" : "Cr"} ${ACCT.byId.get(l.glAccountId).number} ${l.debit || l.credit}`);

test("deposit keys follow the file 1 registry, with :v<n> from the second SODA version", () => {
  assert.equal(depositChargeKey("D"), "deposit:D:charge");
  assert.equal(depositSweepKey("D", "P"), "deposit:D:sweep:P");
  assert.equal(depositDeductionKey("D", "x1"), "deposit:D:ded:x1");
  assert.equal(depositDeductionKey("D", "x1", 2), "deposit:D:ded:x1:v2");
  assert.equal(depositApplyKey("D", 1), "deposit:D:apply");
  assert.equal(depositReleaseKey("D", 3), "deposit:D:release:v3");
  assert.equal(depintKey("D", "2026-10"), "depint:D:2026-10");
  assert.equal(legacyDepintKey("L", "2026-10"), "depint:L:2026-10");
  assert.equal(depintPayKey("D", "2026"), "depint-pay:D:2026");
});

test("interest: 1% on 1,500 is 1.25 a month; the record's override wins; nothing at 0%", () => {
  assert.equal(monthlyInterest(1500, 1), 1.25);
  assert.equal(monthlyInterest(4200, 1.5), 5.25);
  assert.equal(monthlyInterest(1500, 0), 0);
  assert.equal(monthlyInterest(0, 5), 0);
  assert.equal(interestRateFor({ metadata: {} }, { depositInterestRate: 1 }), 1);
  assert.equal(interestRateFor({ metadata: { interestRateOverride: 1.5 } }, { depositInterestRate: 1 }), 1.5);
  assert.equal(interestRateFor({ metadata: { interestRateOverride: "" } }, { depositInterestRate: 2 }), 2);
  assert.equal(interestRateFor({ metadata: { interestRateOverride: 0 } }, { depositInterestRate: 2 }), 0);
  assert.equal(fundedPrincipal(1500, 1500), 0);
  assert.equal(fundedPrincipal(1500, 400), 1100);
  assert.equal(interestPeriodFor("2026-11-08"), "2026-10");
  assert.equal(interestPeriodFor("2027-01-02"), "2026-12");
});

test("a lease's due deposits: security, plus the pet deposit as its own record", () => {
  assert.deepEqual(leaseDepositsDue({ deposit: 1500, metadata: { petDeposit: 300 } }), [
    { kind: "Security deposit", amount: 1500 },
    { kind: "Pet deposit", amount: 300 },
  ]);
  assert.deepEqual(leaseDepositsDue({ deposit: 0, metadata: {} }), []);
});

test("per-record balances read tagged 2100 / 2110 / deposit-bank lines, as of a date", () => {
  const lines = [
    { gl_account_id: "ar", debit: 1500, credit: 0, entry_date: "2026-11-01", metadata: { depositId: "D" } },
    { gl_account_id: "sd", debit: 0, credit: 1500, entry_date: "2026-11-01", metadata: { depositId: "D" } },
    { gl_account_id: "dcash", debit: 1500, credit: 0, entry_date: "2026-11-05", metadata: { depositId: "D" } },
    { gl_account_id: "trust", debit: 0, credit: 1500, entry_date: "2026-11-05", metadata: { depositId: "D" } },
    { gl_account_id: "dip", debit: 0, credit: 1.25, entry_date: "2026-11-30", metadata: { depositId: "D" } },
    { gl_account_id: "sd", debit: 0, credit: 999, entry_date: "2026-11-01", metadata: {} },
  ];
  assert.deepEqual(summarizeDepositLines(lines, ACCT).get("D"), { held: 1500, interest: 1.25, cash: 1500 });
  assert.deepEqual(summarizeDepositLines(lines, ACCT, { asOf: "2026-11-02" }).get("D"), { held: 1500, interest: 0, cash: 0 });
});

test("dispose: 300 deductions + 200 unpaid rent on 1,500 → 7a 300, apply 500, refund 1,000, release 500", () => {
  const plan = planDisposition({
    held: 1500,
    interest: 0,
    cash: 1500,
    items: [{ entryId: "rent", date: "2026-12-01", open: 200 }],
    deductions: [
      { id: "c1", label: "Cleaning", category: "Cleaning", amount: 300 },
      { id: "r1", label: "December rent", category: "Unpaid rent", amount: 200 },
    ],
    date: "2026-12-15",
    payFromDepositBank: true,
  });
  assert.deepEqual(plan.deductions.map((d) => [d.id, d.amount, d.glKey]), [["c1", 300, "other_income"]]);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.applied, 500);
  assert.deepEqual(plan.allocations, [{ entryId: "rent", amount: 200 }, { entryId: "ded:c1", amount: 300 }]);
  assert.equal(plan.refund, 1000);
  assert.equal(plan.release, 500);
  assert.equal(plan.balanceOwed, 0);
  assert.equal(disposedStatus(plan), "Partially returned");
});

test("dispose: interest is refunded after the principal, and the release leaves cash for the whole refund", () => {
  const plan = planDisposition({ held: 1500, interest: 10, cash: 1500, items: [{ entryId: "rent", date: "2026-12-01", open: 200 }], payFromDepositBank: true });
  assert.deepEqual([plan.appliedHeld, plan.appliedInterest, plan.refundHeld, plan.refundInterest, plan.refund, plan.release], [200, 0, 1300, 10, 1310, 190]);
  const noBank = planDisposition({ held: 1500, interest: 0, cash: 0, items: [], payFromDepositBank: false });
  assert.deepEqual([noBank.refund, noBank.release], [1500, 0]);
  assert.equal(disposedStatus(noBank), "Returned");
});

test("dispose: deductions above the deposit leave AR open and no refund", () => {
  const plan = planDisposition({ held: 1500, cash: 1500, deductions: [{ id: "d", category: "Damage repair", amount: 2000 }], date: "2026-12-15", payFromDepositBank: true });
  assert.deepEqual([plan.applied, plan.refund, plan.balanceOwed, plan.release], [1500, 0, 500, 1500]);
  assert.equal(disposedStatus(plan), "Forfeited");
});

test("sweep queue: deposit payments that landed outside the deposit bank, once", () => {
  const deposits = [{ id: "D", charge_entry_id: "C" }];
  const arLines = [
    { entry_id: "P1", applies_to_entry_id: "C", debit: 0, credit: 1000 },
    { entry_id: "P2", applies_to_entry_id: "C", debit: 0, credit: 500 },
    { entry_id: "P3", applies_to_entry_id: "C", debit: 0, credit: 100 },
    { entry_id: "CR", applies_to_entry_id: "C", debit: 0, credit: 50 },
  ];
  const entries = new Map([
    ["P1", { source_type: "payment", status: "posted", entry_date: "2026-11-05" }],
    ["P2", { source_type: "payment", status: "posted", entry_date: "2026-11-06" }],
    ["P3", { source_type: "payment", status: "void", entry_date: "2026-11-07" }],
    ["CR", { source_type: "credit", status: "posted", entry_date: "2026-11-07" }],
  ]);
  const cashLines = [
    { entry_id: "P1", gl_account_id: "trust", bank_account_id: "B-trust", debit: 1000 },
    { entry_id: "P2", gl_account_id: "dcash", bank_account_id: "B-dep", debit: 500 },
    { entry_id: "P3", gl_account_id: "trust", bank_account_id: "B-trust", debit: 100 },
  ];
  const rows = sweepRows({ deposits, arLines, entries, cashLines, depositCashIds: new Set(["dcash"]), posted: new Set() });
  assert.deepEqual(rows.map((r) => [r.paymentEntryId, r.amount, r.fromGlAccountId, r.fromBankAccountId, r.key]), [["P1", 1000, "trust", "B-trust", "deposit:D:sweep:P1"]]);
  assert.equal(sweepRows({ deposits, arLines, entries, cashLines, depositCashIds: new Set(["dcash"]), posted: new Set(["deposit:D:sweep:P1"]) }).length, 0);
});

test("deposit builders: charge, apply, interest, credit and transfer lines carry the deposit id", () => {
  const charge = buildDepositCharge({ depositId: "D", amount: 1500, date: "2026-11-01", leaseId: "L" }, ACCT);
  assert.deepEqual(sides(charge), ["Dr 1200 1500", "Cr 2100 1500"]);
  assert.equal(charge.entry.sourceType, "deposit_held");
  assert.ok(charge.lines.every((l) => l.metadata.depositId === "D"));
  const apply = buildDepositApply({ depositId: "D", heldAmount: 400, interestAmount: 100, allocations: [{ entryId: "rent", amount: 200 }, { entryId: "ded", amount: 300 }] }, ACCT);
  assert.deepEqual(sides(apply), ["Dr 2100 400", "Dr 2110 100", "Cr 1200 200", "Cr 1200 300"]);
  assert.equal(apply.lines[2].appliesToEntryId, "rent");
  assert.ok(buildDepositApply({ heldAmount: 500, allocations: [{ entryId: "rent", amount: 200 }] }, ACCT).error);
  assert.deepEqual(sides(buildDepositInterest({ depositId: "D", amount: 1.25 }, ACCT)), ["Dr 5600 1.25", "Cr 2110 1.25"]);
  assert.deepEqual(sides(buildDepositInterestCredit({ depositId: "D", amount: 15, allocations: [{ entryId: "rent", amount: 10 }] }, ACCT)), ["Dr 2110 15", "Cr 1200 10", "Cr 1200 5"]);
  const sweep = buildDepositTransfer({ depositId: "D", amount: 1500, toGlAccountId: "dcash", toBankAccountId: "B-dep", fromGlAccountId: "trust", fromBankAccountId: "B-trust" }, ACCT);
  assert.deepEqual(sides(sweep), ["Dr 1020 1500", "Cr 1010 1500"]);
  assert.equal(sweep.lines[0].bankAccountId, "B-dep");
});

test("a cash refund through buildDepositReturn is retired; refunds are AP bills with 2100 / 2110 lines", () => {
  assert.match(buildDepositReturn({ refundAmount: 100 }, ACCT).error, /Accounts Payable/);
  assert.deepEqual(sides(buildDepositReturn({ appliedToCharges: 100, allocations: [{ entryId: "x", amount: 100 }] }, ACCT)), ["Dr 2100 100", "Cr 1200 100"]);
  const bill = buildBill({ tenantId: "T", lines: [{ glAccountId: "sd", amount: 1000, metadata: { depositId: "D" } }, { glAccountId: "dip", amount: 5 }] }, ACCT);
  assert.deepEqual(sides(bill), ["Dr 2100 1000", "Dr 2110 5", "Cr 2000 1005"]);
  assert.equal(bill.lines[0].metadata.depositId, "D");
  assert.equal(bill.entry.tenantId, "T");
});

test("bill payees: a tenant refund carries tenant_id and its payee name, never a vendor", () => {
  const { row } = prepareBill({ amount: 1000, payeeType: "tenant", tenantId: "T", payeeName: "Ann & Bo", vendorId: "V" });
  assert.deepEqual([row.payee_type, row.tenant_id, row.vendor_id, row.vendor_name, row.metadata.payeeName], ["tenant", "T", null, "", "Ann & Bo"]);
  assert.equal(payeeLabel({ vendorName: "", metadata: { payeeName: "Ann & Bo" } }), "Ann & Bo");
  assert.equal(payeeTypeOf({ payee_type: "owner" }), "owner");
  assert.equal(payeeTypeOf({}), "vendor");
  assert.equal(prepareBill({ amount: 5, vendorId: "V" }).row.payee_type, "vendor");
});
