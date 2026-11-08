import { test } from "node:test";
import assert from "node:assert/strict";

import { buildBill, buildCreditApplication, creditApplicationKey, indexAccounts, normalizeGlAccount } from "@/lib/ledger/postings";
import {
  accelPeriods,
  accelRows,
  chargesTotal,
  depositRuleFor,
  finalAccountPlan,
  finalAccountWarnings,
  mailRequiredFor,
  monthsLeftOnTerm,
  normalizeCharges,
  planCreditApplications,
  returnDeadline,
  revisePlan,
  ruleParams,
  sodaAccelKey,
  sodaOf,
} from "./move_out_math";
import { depositSectionHtml, finalAccountEmailData, letterHtml, resultText } from "./move_out_html";
import { statementMath } from "./statement_math";

const acct = indexAccounts(
  [
    { id: "ar", number: "1200", name: "Accounts Receivable", account_type: "Asset", subtype: "receivable", system_key: "accounts_receivable" },
    { id: "ap", number: "2000", name: "Accounts Payable", account_type: "Liability", subtype: "payable", system_key: "accounts_payable" },
    { id: "dep", number: "2100", name: "Security Deposits", account_type: "Liability", subtype: "deposits", system_key: "security_deposits" },
    { id: "rent", number: "4000", name: "Rental Income", account_type: "Income", subtype: "income", system_key: "rent_income" },
  ].map(normalizeGlAccount),
);

// The spec's case: rent 1,500, deposit 1,500, an unapplied 100 credit, December billed and unpaid, move-out Dec 10, 400 of deductions.
const decRent = { entryId: "dec", key: "rent:L:2026-12", kind: "rent", period: "2026-12", date: "2026-12-01", open: 1500, memo: "Rent · December 2026" };
const closeOut = { credit: 1016.13, charge: 0, lines: [{ kind: "rent", label: "Rent · December 2026", amount: -1016.13, period: "2026-12" }] };
const deductions = normalizeCharges([
  { id: "carpet", label: "Carpet cleaning", category: "Cleaning", amount: 300 },
  { id: "keys", label: "Key replacement", category: "Key / lock replacement", amount: 100 },
]);

test("credit application: Dr AR applied to the credit / Cr AR applied to the item, keyed apply:<credit>:<item>[:n]", () => {
  assert.equal(creditApplicationKey("c1", "i1"), "apply:c1:i1");
  assert.equal(creditApplicationKey("c1", "i1", 2), "apply:c1:i1:2");
  const built = buildCreditApplication({ creditEntryId: "c1", itemEntryId: "i1", amount: 100, date: "2026-12-12", leaseId: "L" }, acct);
  assert.equal(built.entry.sourceType, "adjustment");
  assert.equal(built.entry.idempotencyKey, "apply:c1:i1");
  assert.deepEqual(
    built.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.appliesToEntryId]),
    [
      ["ar", 100, 0, "c1"],
      ["ar", 0, 100, "i1"],
    ],
  );
  assert.ok(buildCreditApplication({ creditEntryId: "c1", itemEntryId: "c1", amount: 5 }, acct).error);
  assert.ok(buildCreditApplication({ creditEntryId: "c1", amount: 5 }, acct).error);
  assert.ok(buildCreditApplication({ creditEntryId: "c1", itemEntryId: "i1", amount: 0 }, acct).error);
});

test("credit application plan: oldest credit to oldest item, never more than either holds", () => {
  const items = [
    { entryId: "b", date: "2026-12-12", open: 400 },
    { entryId: "a", date: "2026-12-01", open: 483.87 },
  ];
  const credits = [
    { entryId: "c2", date: "2026-11-20", amount: 600 },
    { entryId: "c1", date: "2026-11-01", amount: 100 },
  ];
  assert.deepEqual(planCreditApplications(items, credits), [
    { creditEntryId: "c1", itemEntryId: "a", amount: 100 },
    { creditEntryId: "c2", itemEntryId: "a", amount: 383.87 },
    { creditEntryId: "c2", itemEntryId: "b", amount: 216.13 },
  ]);
  assert.deepEqual(planCreditApplications([], credits), []);
  assert.deepEqual(planCreditApplications(items, []), []);
});

test("final account plan: the acceptance case — 1,016.13 credit, 400 of charges, 100 credit, deposit applies 783.87, refund 716.13", () => {
  const plan = finalAccountPlan({ items: [decRent], credits: [{ entryId: "pay", amount: 100, date: "2026-11-01" }], closeOut, charges: deductions, deposits: [{ id: "D", held: 1500, interest: 0 }] });
  assert.equal(plan.openAfterCharges, 883.87);
  assert.equal(plan.creditsApplied, 100);
  assert.equal(plan.applied, 783.87);
  assert.equal(plan.refund, 716.13);
  assert.equal(plan.balanceOwed, 0);
  const revised = finalAccountPlan({ items: [decRent], credits: [{ entryId: "pay", amount: 100 }], closeOut, charges: normalizeCharges([...deductions, { id: "x", label: "Wall repair", category: "Damage repair", amount: 50 }]), deposits: [{ id: "D", held: 1500 }] });
  assert.equal(revised.applied, 833.87);
  assert.equal(revised.refund, 666.13);
});

test("final account plan: a leftover credit is refunded with the first deposit; charges above the deposit leave a balance", () => {
  const credit = finalAccountPlan({ items: [], credits: [{ entryId: "pay", amount: 100 }], deposits: [{ id: "D", held: 1500 }, { id: "P", held: 250 }] });
  assert.equal(credit.creditRefund, 100);
  assert.equal(credit.deposits[0].refund, 1600);
  assert.equal(credit.deposits[1].refund, 250);
  assert.equal(credit.refund, 1850);
  const owed = finalAccountPlan({ items: [decRent], closeOut, charges: normalizeCharges([{ id: "d", label: "Water damage", category: "Damage repair", amount: 2000 }]), accel: accelRows("2026-12-10", { months: 1, amount: 1500 }), deposits: [{ id: "D", held: 1500, interest: 1.25 }] });
  assert.equal(owed.accelTotal, 1500);
  assert.equal(owed.applied, 1501.25);
  assert.equal(owed.refund, 0);
  assert.equal(owed.balanceOwed, 2482.62);
  const noDeposit = finalAccountPlan({ credits: [{ entryId: "pay", amount: 40 }] });
  assert.equal(noDeposit.creditLeft, 40);
  assert.equal(noDeposit.creditRefund, 0);
});

test("move-out charges: unpaid rent and utilities post nothing; amounts above zero only; ids stable by position", () => {
  const rows = normalizeCharges([{ label: "Rent", category: "Unpaid rent", amount: 200 }, { label: "Blinds", category: "Damage repair", amount: "75.5" }, { label: "Zero", amount: 0 }]);
  assert.deepEqual(rows.map((r) => [r.id, r.posts, r.amount, r.glKey]), [
    ["c1", false, 200, "other_income"],
    ["c2", true, 75.5, "other_income"],
  ]);
});

test("accelerated rent: months after the move-out month, keyed soda:<deposit>:accel:<YYYY-MM>:v<n>", () => {
  assert.deepEqual(accelPeriods("2026-12-10", 2), ["2027-01", "2027-02"]);
  assert.deepEqual(accelPeriods("2026-12-10", 0), []);
  assert.equal(accelPeriods("2026-12-10", 99).length, 24);
  assert.equal(sodaAccelKey("D", "2027-01", 1), "soda:D:accel:2027-01:v1");
  assert.equal(sodaAccelKey("D", "2027-01", 2), "soda:D:accel:2027-01:v2");
  assert.equal(monthsLeftOnTerm("2026-12-10", "2027-03-31"), 3);
  assert.deepEqual(accelRows("2026-12-10", { months: 1, amount: 1500 }), [{ period: "2027-01", label: "Accelerated rent · January 2027", amount: 1500 }]);
});

test("SODA state: the deposit's soda, or a CORE-04 disposal read as committed v1", () => {
  assert.equal(sodaOf({ metadata: {} }), null);
  assert.deepEqual(sodaOf({ metadata: { soda: { status: "Draft", version: 2 } } }), { status: "Draft", version: 2 });
  const legacy = sodaOf({ metadata: { disposition: { committedAt: "2026-11-01T00:00:00Z", version: 1 } } });
  assert.equal(legacy.status, "Committed");
  assert.equal(legacy.legacy, true);
});

test("deposit rules: the most specific active rule for the state; params default; deadlines and mail", () => {
  const rules = [
    { id: "wa", kind: "deposit_disposition", status: "active", jurisdiction_code: "WA", params: { returnDays: 30, mailRequired: "first_class", acceleratedRent: "mitigation_only" } },
    { id: "sea", kind: "deposit_disposition", status: "active", jurisdiction_code: "WA", locality: "Seattle", params: { returnDays: 21 } },
    { id: "old", kind: "deposit_disposition", status: "retired", jurisdiction_code: "WA", params: { returnDays: 5 } },
    { id: "or", kind: "deposit_disposition", status: "active", jurisdiction_code: "OR", params: { returnDays: 31 } },
  ];
  assert.equal(depositRuleFor(rules, { stateCode: "wa", city: "Seattle" }).id, "sea");
  assert.equal(depositRuleFor(rules, { stateCode: "WA", city: "Spokane" }).id, "wa");
  assert.equal(depositRuleFor(rules, { stateCode: "CA" }), null);
  assert.equal(depositRuleFor([{ ...rules[0], effective_from: "2027-01-01" }], { stateCode: "WA", asOf: "2026-12-10" }), null);
  const p = ruleParams(rules[0]);
  assert.equal(p.mailRequired, true);
  assert.equal(p.mailClass, "first_class");
  assert.equal(ruleParams(null).acceleratedRent, "unknown");
  assert.equal(returnDeadline({ moveOut: "2026-12-10", rule: rules[1] }), "2026-12-31");
  assert.equal(returnDeadline({ moveOut: "2026-12-10", policyDays: 14 }), "2026-12-24");
  assert.equal(returnDeadline({ moveOut: "2026-12-10", depositReturnDue: "2027-01-02", rule: rules[1] }), "2027-01-02");
  assert.equal(mailRequiredFor({ email: "a@b.co", rule: rules[0] }), true);
  assert.equal(mailRequiredFor({ email: "a@b.co", rule: null }), false);
  assert.equal(mailRequiredFor({ email: "", rule: null }), true);
});

test("warnings: past the return deadline, restricted accelerated rent, receipts, no email or address (warn only)", () => {
  const rule = { kind: "deposit_disposition", status: "active", jurisdiction_code: "WA", params: { acceleratedRent: "prohibited", receiptsOver: 125 } };
  const out = finalAccountWarnings({ today: "2027-01-20", moveOut: "2026-12-10", returnDue: "2027-01-09", rule, stateName: "Washington", accelMonths: 4, termEnd: "2027-02-28", email: "", address: "", charges: normalizeCharges([{ label: "Paint", category: "Painting", amount: 300 }]), notOnLedger: ["The pet deposit (Pet)"] });
  const text = out.map((w) => w.text).join(" | ");
  assert.match(text, /passed 11 days ago/);
  assert.match(text, /Washington rule: accelerated rent isn't allowed/);
  assert.match(text, /runs past the term end/);
  assert.match(text, /receipts or invoices for charges above 125 \(Paint\)/);
  assert.match(text, /No forwarding email/);
  assert.match(text, /No forwarding address/);
  assert.match(text, /pet deposit/);
  assert.equal(finalAccountWarnings({ today: "2026-12-12", moveOut: "2026-12-10", returnDue: "2027-01-09", email: "x@y.co", address: "1 Main" }).length, 0);
});

test("letter and deposit section list the ledger's figures; email fields", () => {
  const m = {
    version: 1,
    issuedOn: "2026-12-12",
    moveOut: "2026-12-10",
    residents: ["Jordan Blake"],
    forwarding: { address: "1 Main St" },
    premises: "Maple Court · Unit 4B",
    deposits: [{ id: "D", kind: "Security deposit", held: 1500, interest: 0 }],
    available: 1500,
    charges: [{ id: "carpet", label: "Carpet cleaning", category: "Cleaning", amount: 300 }],
    creditsApplied: [{ id: "c", label: "Credit applied to Rent · December 2026", amount: 100 }],
    appliedTo: [{ id: "a", label: "Rent · December 2026", amount: 383.87 }],
    applied: 783.87,
    refund: 716.13,
    creditRefund: 0,
    balanceOwed: 0,
    refundMethod: "Check",
    payableTo: ["Jordan Blake"],
  };
  const html = letterHtml(m);
  for (const s of ["$1,500.00", "$783.87", "$716.13", "Carpet cleaning", "payable to Jordan Blake", "1 Main St"]) assert.ok(html.includes(s), s);
  assert.equal(resultText(m), "Refund due to you: $716.13");
  assert.ok(depositSectionHtml(m).includes("$716.13"));
  const data = finalAccountEmailData(m, { name: "Jordan Blake" });
  assert.equal(data.recipientName, "Jordan");
  assert.equal(data.refund, "$716.13");
  assert.equal(data.balanceOwed, "");
  assert.ok(letterHtml({ ...m, version: 2 }).includes("Revised (version 2)"));
});

test("statement: a credit applied to a charge moves no balance, so it isn't an activity row", () => {
  const e = (id, sourceType, idempotencyKey = "") => ({ id, sourceType, status: "posted", reversalOf: "", idempotencyKey, date: "2026-12-01", memo: id });
  const line = (entryId, date, debit, credit, appliesToEntryId = "", entry = e(entryId, "charge")) => ({ entryId, date, glAccountId: "ar", debit, credit, appliesToEntryId, entry, leaseId: "L" });
  const apply = e("app", "adjustment", "apply:pay:dec");
  const lines = [
    line("dec", "2026-12-01", 1500, 0, "", e("dec", "charge", "rent:L:2026-12")),
    line("pay", "2026-11-25", 0, 100, "", e("pay", "payment")),
    line("app", "2026-12-12", 100, 0, "pay", apply),
    line("app", "2026-12-12", 0, 100, "dec", apply),
  ];
  const st = statementMath({ lines, accounts: acct, leaseId: "L", from: "2026-12-01", to: "2026-12-31" });
  assert.equal(st.closing, 1400);
  assert.equal(st.charges, 1500);
  assert.equal(st.credits, 0);
  assert.equal(st.activity.length, 1);
});

test("refund bill lines keep the credit they pay out (applies_to on the AR line)", () => {
  const built = buildBill({ amount: 816.13, lines: [{ glAccountId: "dep", amount: 716.13 }, { glAccountId: "ar", amount: 100, appliesToEntryId: "pay" }], date: "2026-12-12" }, acct);
  assert.deepEqual(
    built.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.appliesToEntryId || ""]),
    [
      ["dep", 716.13, 0, ""],
      ["ar", 100, 0, "pay"],
      ["ap", 0, 816.13, ""],
    ],
  );
});

test("revise preview: charges change by their difference against the committed result", () => {
  const result = { available: 1500, applied: 783.87, refund: 716.13, balanceOwed: 0, creditRefund: 0 };
  const before = chargesTotal({ charges: deductions });
  const after = chargesTotal({ charges: [...deductions, { id: "w", label: "Wall repair", category: "Damage repair", amount: 50 }], accel: [], earlyTerm: { include: false, fee: 300 } });
  assert.deepEqual([before, after], [400, 450]);
  const next = revisePlan(result, before, after);
  assert.equal(next.applied, 833.87);
  assert.equal(next.refund, 666.13);
  const lower = revisePlan(result, 400, 0);
  assert.equal(lower.applied, 383.87);
  assert.equal(lower.refund, 1116.13);
  const owed = revisePlan({ available: 500, applied: 500, balanceOwed: 3000 }, 1700, 1500);
  assert.equal(owed.balanceOwed, 2800);
  assert.equal(chargesTotal({ charges: [], accel: [{ amount: 1500 }], earlyTerm: { include: true, fee: 300 } }), 1800);
});
