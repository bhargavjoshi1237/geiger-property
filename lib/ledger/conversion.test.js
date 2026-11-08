import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLEARING_ACCOUNT,
  billingCutover,
  defaultBankFor,
  isMonthStart,
  linesFromPaste,
  nextMonthStart,
  openingBalancesStatus,
  openingDate,
  parseDate,
  parseMoney,
  parseTable,
  planContext,
  planLine,
  planTrialBalance,
  postGate,
  templateCsv,
  validateBatch,
  voidGate,
} from "./conversion";
import { CONVERSION_BUILDERS, conversionKey, indexAccounts, round2, toRpcArgs } from "./postings";

const A = (systemKey, number, name, accountType, subtype, isTrust = false) => ({ id: systemKey, systemKey, number, name, accountType, subtype, isTrust });
const CHART = [
  A("operating_cash", "1000", "Operating Cash", "Asset", "cash"),
  A("trust_cash", "1010", "Trust Cash", "Asset", "cash", true),
  A("deposit_cash", "1020", "Security Deposit Trust Cash", "Asset", "cash", true),
  A("accounts_receivable", "1200", "Accounts Receivable", "Asset", "receivable"),
  A("capital_improvements", "1500", "Capital Improvements", "Asset", "fixed_asset"),
  A("accounts_payable", "2000", "Accounts Payable", "Liability", "payable"),
  A("security_deposits", "2100", "Security Deposits Held", "Liability", "deposits", true),
  A("deposit_interest_payable", "2110", "Deposit Interest Payable", "Liability", "deposits", true),
  A("prepaid_rent", "2200", "Prepaid Rent & Tenant Credits", "Liability", "prepaid"),
  A("owner_equity", "3000", "Owner Equity", "Equity", "equity"),
  A("company_equity", "3050", "Company Equity", "Equity", "equity"),
  A("rent_income", "4000", "Rental Income", "Income", "income"),
  A("late_fee_income", "4010", "Late Fee Income", "Income", "income"),
  A("repairs_maintenance", "5000", "Repairs & Maintenance", "Expense", "expense"),
];
const ACCT = indexAccounts(CHART);
const WITH_CLEARING = indexAccounts([...CHART, A("opening_balance_equity", "3950", "Opening Balance Equity", "Equity", "equity")]);
const BANKS = [
  { id: "bank-trust", name: "Trust account", accountType: "Trust", status: "Active" },
  { id: "bank-dep", name: "Deposit account", accountType: "Security deposit", status: "Active" },
  { id: "bank-op", name: "Operating account", accountType: "Operating", status: "Active" },
];
const lease = (n) => ({ leaseId: `lease-${n}`, tenantId: `tenant-${n}`, unitId: `unit-${n}`, propertyId: "prop-1" });
let seq = 0;
const L = (kind, fields) => ({ id: `line-${(seq += 1)}`, kind, amount: 0, metadata: {}, ...fields });
const sumBy = (lines, side) => round2(lines.reduce((s, l) => s + (Number(l[side]) || 0), 0));

// The acceptance sample: AR 4,200, deposits 9,000, owner balances 31,500, prepaid 600, AP 1,150, plus GL balances.
function sample() {
  return [
    L("tenant_balance", { ...lease(1), amount: 2500, itemDate: "2026-09-01", glAccountId: "rent_income" }),
    L("tenant_balance", { ...lease(1), amount: 1200, itemDate: "2026-10-01" }),
    L("tenant_balance", { ...lease(2), amount: 500, itemDate: "2026-10-05", glAccountId: "late_fee_income" }),
    L("tenant_credit", { ...lease(3), amount: 600 }),
    L("deposit", { ...lease(1), amount: 3000, metadata: { kind: "Security deposit" } }),
    L("deposit", { ...lease(2), amount: 3000 }),
    L("deposit", { ...lease(3), amount: 3000 }),
    L("owner_balance", { ownerId: "owner-a", propertyId: "prop-1", amount: 20000 }),
    L("owner_balance", { ownerId: "owner-b", propertyId: "prop-1", amount: 11500 }),
    L("bill", { vendorId: "vendor-1", propertyId: "prop-1", amount: 1150, itemDate: "2026-10-20", ref: "INV-9", metadata: { dueDate: "2026-11-19" } }),
    L("gl_balance", { glAccountId: "owner_equity", amount: -34550 }),
    L("gl_balance", { glAccountId: "operating_cash", amount: 25000, bankAccountId: "bank-op" }),
    L("gl_balance", { glAccountId: "company_equity", amount: -25000 }),
  ];
}
const BATCH = { id: "batch-1", cutoverDate: "2026-11-01", metadata: {} };

test("dates: the cutover is a month start and balances are as of the day before", () => {
  assert.equal(openingDate("2026-11-01"), "2026-10-31");
  assert.equal(openingDate("2027-01-01"), "2026-12-31");
  assert.equal(openingDate("2028-03-01"), "2028-02-29");
  assert.ok(isMonthStart("2026-11-01"));
  assert.ok(!isMonthStart("2026-11-15"));
  assert.equal(nextMonthStart("2026-12-15"), "2027-01-01");
});

test("every builder balances, flags metadata.conversion and keys conv:<batch>:<line>", () => {
  const inputs = {
    tenant_balance: { ...lease(1), amount: 100, originalDate: "2026-09-01" },
    tenant_credit: { ...lease(1), amount: 100, cashGlAccountId: "trust_cash", bankAccountId: "bank-trust" },
    deposit: { ...lease(1), amount: 100, interest: 2.5, depositId: "dep-1" },
    owner_balance: { ownerId: "owner-a", propertyId: "prop-1", amount: -75 },
    bill: { vendorId: "vendor-1", amount: 100, originalDate: "2026-10-01", dueDate: "2026-11-01" },
    gl_balance: { glAccountId: "capital_improvements", amount: 5000 },
    bank_outstanding: { amount: 100, itemType: "check", bankAccountId: "bank-trust", reference: "1042" },
  };
  for (const [kind, input] of Object.entries(inputs)) {
    const built = CONVERSION_BUILDERS[kind]({ ...input, batchId: "b1", lineId: `l-${kind}`, date: "2026-10-31" }, WITH_CLEARING);
    assert.ok(!built.error, `${kind}: ${built.error}`);
    assert.equal(sumBy(built.lines, "debit"), sumBy(built.lines, "credit"), `${kind} balances`);
    assert.ok(built.lines.length >= 2);
    assert.equal(built.entry.metadata.conversion, true);
    assert.equal(built.entry.idempotencyKey, conversionKey("b1", `l-${kind}`));
    assert.equal(built.entry.idempotencyKey, `conv:b1:l-${kind}`);
  }
});

test("builders refuse without Opening Balance Equity (3950) in the chart", () => {
  assert.match(CONVERSION_BUILDERS.tenant_balance({ ...lease(1), amount: 10, batchId: "b", lineId: "l" }, ACCT).error, /Opening Balance Equity/);
});

test("tenant balance: Dr AR on the lease (originalDate, chargeGl) / Cr clearing, property-level", () => {
  const b = CONVERSION_BUILDERS.tenant_balance({ ...lease(1), amount: 1200, originalDate: "2026-09-01", chargeGlAccountId: "late_fee_income", batchId: "b", lineId: "l", date: "2026-10-31" }, WITH_CLEARING);
  assert.equal(b.entry.sourceType, "charge");
  assert.equal(b.entry.metadata.chargeGl, "late_fee_income");
  assert.deepEqual([b.lines[0].glAccountId, b.lines[0].debit, b.lines[0].metadata.originalDate], ["accounts_receivable", 1200, "2026-09-01"]);
  assert.deepEqual([b.lines[1].glAccountId, b.lines[1].credit, b.lines[1].leaseId, b.lines[1].propertyId], ["opening_balance_equity", 1200, null, "prop-1"]);
  const rpc = toRpcArgs(b, { projectId: "p" });
  assert.equal(rpc.p_entry.lease_id, "lease-1");
  assert.equal(rpc.p_lines[1].lease_id, null);
});

test("deposit: Dr cash principal + interest / Cr 2100 / Cr 2110, every line tagged with the record", () => {
  const b = CONVERSION_BUILDERS.deposit({ ...lease(1), amount: 1500, interest: 12.4, depositId: "dep-1", cashGlAccountId: "deposit_cash", bankAccountId: "bank-dep", batchId: "b", lineId: "l" }, WITH_CLEARING);
  assert.equal(b.entry.sourceType, "deposit_held");
  assert.deepEqual(b.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0, l.metadata.depositId]), [
    ["deposit_cash", 1512.4, 0, "dep-1"],
    ["security_deposits", 0, 1500, "dep-1"],
    ["deposit_interest_payable", 0, 12.4, "dep-1"],
  ]);
});

test("owner balance: owner-specific (CORE-08 keeps owner_id); a negative balance credits trust", () => {
  const b = CONVERSION_BUILDERS.owner_balance({ ownerId: "owner-a", propertyId: "prop-1", amount: -75, batchId: "b", lineId: "l", cashGlAccountId: "trust_cash" }, WITH_CLEARING);
  assert.equal(b.entry.metadata.ownerExplicit, true);
  assert.deepEqual(b.lines.map((l) => [l.glAccountId, l.debit || 0, l.credit || 0]), [["opening_balance_equity", 75, 0], ["trust_cash", 0, 75]]);
  assert.equal(toRpcArgs(b).p_entry.owner_id, "owner-a");
  const shared = CONVERSION_BUILDERS.owner_balance({ propertyId: "prop-1", amount: 50, batchId: "b", lineId: "l2" }, WITH_CLEARING);
  assert.equal(shared.entry.metadata.ownerExplicit, undefined);
});

test("tenant credit is resident money: no owner on any line", () => {
  const b = CONVERSION_BUILDERS.tenant_credit({ ...lease(1), ownerId: "owner-a", amount: 600, batchId: "b", lineId: "l" }, WITH_CLEARING);
  const rpc = toRpcArgs(b, { projectId: "p" });
  assert.equal(rpc.p_entry.owner_id, null);
  assert.ok(rpc.p_lines.every((l) => !l.owner_id));
  assert.deepEqual(b.lines.map((l) => l.glAccountId), ["trust_cash", "prepaid_rent"]);
});

test("outstanding items: a check and a deposit in transit each net to zero on their owner", () => {
  for (const itemType of ["check", "deposit"]) {
    const b = CONVERSION_BUILDERS.bank_outstanding({ ownerId: "owner-a", amount: 450, itemType, cashGlAccountId: "trust_cash", bankAccountId: "bank-trust", batchId: "b", lineId: itemType }, WITH_CLEARING);
    const net = b.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0);
    assert.equal(net, 0);
    assert.equal(b.entry.metadata.ownerExplicit, true);
    const cleared = b.lines.find((l) => l.metadata.conversionCleared);
    const open = b.lines.find((l) => l.metadata.outstanding);
    assert.equal(itemType === "check" ? cleared.debit : cleared.credit, 450);
    assert.equal(itemType === "check" ? open.credit : open.debit, 450);
  }
});

test("the acceptance sample: clearing nets to $0.00 and the batch is ready", () => {
  const v = validateBatch(sample(), ACCT, { batch: BATCH, banks: BANKS });
  assert.deepEqual(v.errors, []);
  assert.equal(v.ready, true);
  assert.equal(v.clearingNet, 0);
  assert.equal(v.totals.tenantBalances, 4200);
  assert.equal(v.totals.deposits, 9000);
  assert.equal(v.totals.ownerBalances, 31500);
  assert.equal(v.totals.tenantCredits, 600);
  assert.equal(v.totals.bills, 1150);
  assert.equal(v.openingDate, "2026-10-31");
  for (const e of v.entries) assert.equal(sumBy(e.built.lines, "debit"), sumBy(e.built.lines, "credit"));
  // Defaults: deposits land in the deposit bank, resident and owner money in trust.
  assert.equal(v.perBank["bank-dep"].book, 9000);
  assert.equal(v.perBank["bank-trust"].book, 32100);
  assert.equal(v.perBank["bank-op"].book, 25000);
});

test("the plan's trial balance is the old system's: assets equal liabilities plus equity", () => {
  const v = validateBatch(sample(), ACCT, { batch: BATCH, banks: BANKS });
  const tb = Object.fromEntries(planTrialBalance(v.entries, ACCT).map((r) => [r.number, r.balance]));
  assert.deepEqual(tb, { 1000: 25000, 1010: 32100, 1020: 9000, 1200: 4200, 2000: 1150, 2100: 9000, 2200: 600, 3000: 34550, 3050: 25000, 3950: 0 });
});

test("clearing out of balance: not ready, and the error shows the difference", () => {
  const lines = sample().filter((l) => !(l.kind === "gl_balance" && l.glAccountId === "owner_equity"));
  const v = validateBatch(lines, ACCT, { batch: BATCH, banks: BANKS });
  assert.equal(v.ready, false);
  assert.equal(v.clearingNet, -34550);
  assert.ok(v.errors.some((e) => /off by -\$34,550\.00/.test(e.message)));
});

test("bank starting points: statement = book + outstanding checks − deposits in transit", () => {
  const lines = [
    ...sample(),
    L("bank_outstanding", { bankAccountId: "bank-trust", ownerId: "owner-a", amount: 450, itemDate: "2026-10-28", ref: "1042", metadata: { itemType: "check" } }),
    L("bank_outstanding", { bankAccountId: "bank-trust", ownerId: "owner-b", amount: 200, itemDate: "2026-10-30", metadata: { itemType: "deposit" } }),
  ];
  const batch = { ...BATCH, metadata: { banks: [{ bankAccountId: "bank-trust", statementDate: "2026-10-31", statementBalance: 32350 }, { bankAccountId: "bank-dep", statementDate: "2026-10-31", statementBalance: 9000 }] } };
  const v = validateBatch(lines, ACCT, { batch, banks: BANKS });
  assert.deepEqual(v.errors, []);
  const trust = v.perBank["bank-trust"];
  assert.deepEqual([trust.book, trust.outstandingOut, trust.outstandingIn, trust.cleared, trust.diff], [32100, 450, 200, 32350, 0]);
  assert.equal(v.perBank["bank-dep"].diff, 0);
  assert.equal(v.totals.banksWithoutStart, 1);
  assert.ok(v.warnings.some((w) => /Operating account has no starting point/.test(w.message)));
  const off = validateBatch(lines, ACCT, { batch: { ...batch, metadata: { banks: [{ bankAccountId: "bank-trust", statementDate: "2026-10-31", statementBalance: 32000 }] } }, banks: BANKS });
  assert.ok(off.errors.some((e) => /differ by -\$350\.00/.test(e.message)));
});

test("line checks: subledger accounts, month-start cutover, dates after the opening day, missing parties", () => {
  const v = validateBatch(
    [
      L("gl_balance", { glAccountId: "accounts_receivable", amount: 10 }),
      L("tenant_balance", { amount: 10 }),
      L("bill", { amount: 10 }),
      L("tenant_balance", { ...lease(1), amount: 10, itemDate: "2026-11-15" }),
      L("tenant_balance", { ...lease(1), amount: -10 }),
      L("gl_balance", { glAccountId: "repairs_maintenance", amount: 10.005 }),
      L("bank_outstanding", { bankAccountId: "bank-trust", amount: 10, metadata: {} }),
    ],
    ACCT,
    { batch: { ...BATCH, cutoverDate: "2026-11-15" }, banks: BANKS },
  );
  const msgs = v.errors.map((e) => e.message).join(" | ");
  assert.match(msgs, /Cut over on the first day of a month/);
  assert.match(msgs, /filled from Tenant balances/);
  assert.match(msgs, /Pick the lease/);
  assert.match(msgs, /Pick the vendor/);
  assert.match(msgs, /on or before 2026-11-14/);
  assert.match(msgs, /greater than zero/);
  assert.match(msgs, /whole cents/);
  assert.match(msgs, /Check or Deposit/);
});

test("defaults: deposits follow the deposit bank or the operating policy; a picked closed bank is refused", () => {
  assert.equal(defaultBankFor("deposit", BANKS).id, "bank-dep");
  assert.equal(defaultBankFor("deposit", BANKS, { depositHeldIn: "operating" }).id, "bank-op");
  assert.equal(defaultBankFor("deposit", BANKS.filter((b) => b.id !== "bank-dep")).id, "bank-trust");
  assert.equal(defaultBankFor("owner_balance", BANKS).id, "bank-trust");
  const ctx = planContext(BATCH, ACCT, { banks: [...BANKS, { id: "bank-x", name: "Old", accountType: "Trust", status: "Closed" }] });
  assert.match(planLine(L("owner_balance", { ownerId: "o", amount: 5, bankAccountId: "bank-x" }), ctx).error, /isn't open/);
});

test("a cash GL balance must match its bank's account", () => {
  const ctx = planContext(BATCH, ACCT, { banks: BANKS });
  assert.match(planLine(L("gl_balance", { glAccountId: "operating_cash", amount: 5, bankAccountId: "bank-trust" }), ctx).error, /different cash account/);
  assert.equal(planLine(L("gl_balance", { glAccountId: "operating_cash", amount: 5 }), ctx).bankAccountId, "bank-op");
});

test("year-to-date lines post on their own date; balance-sheet lines on the opening day", () => {
  const ctx = planContext(BATCH, ACCT, { banks: BANKS });
  assert.equal(planLine(L("gl_balance", { glAccountId: "rent_income", amount: -900, itemDate: "2026-03-31" }), ctx).date, "2026-03-31");
  assert.equal(planLine(L("tenant_balance", { ...lease(1), amount: 9, itemDate: "2026-03-31" }), ctx).date, "2026-10-31");
});

test("gates: admins only after go-live; voids only before", () => {
  assert.equal(postGate({ live: false }), null);
  assert.equal(postGate({ live: true, isAdmin: false }).status, 403);
  assert.equal(postGate({ live: true, isAdmin: true }), null);
  assert.equal(postGate({ status: "Voided" }).status, 409);
  assert.equal(voidGate({ live: false, status: "Posted" }), null);
  assert.equal(voidGate({ live: true, status: "Posted" }).status, 409);
  assert.equal(voidGate({ live: false, status: "Draft", posted: 0 }).status, 409);
  assert.equal(voidGate({ live: false, status: "Draft", posted: 2 }), null);
});

test("billing cutover: never back-bills, never moves the start down, leases always carry theirs", () => {
  assert.deepEqual(billingCutover({ current: "", start: "2026-11-01" }), { project: "2026-11-01", lease: "2026-11-01", warning: "" });
  assert.equal(billingCutover({ current: "2026-09-01", start: "2026-11-01" }).project, "2026-11-01");
  const later = billingCutover({ current: "2026-11-08", start: "2026-11-01" });
  assert.equal(later.project, "");
  assert.match(later.warning, /won't bill on its own/);
  assert.equal(billingCutover({ current: "", start: "2026-11-01", live: true }).project, "");
});

test("checklist status: done once a batch is posted", () => {
  assert.equal(openingBalancesStatus([]).done, false);
  assert.match(openingBalancesStatus([{ status: "Draft" }]).detail, /draft/);
  const s = openingBalancesStatus([{ status: "Voided", cutoverDate: "2026-10-01" }, { status: "Posted", cutoverDate: "2026-11-01", totals: { banksWithoutStart: 1 } }]);
  assert.equal(s.done, true);
  assert.match(s.detail, /2026-11-01 cutover · Opening Balance Equity \$0\.00 · 1 bank without a starting reconciliation/);
});

test("paste: headers by alias, money and dates in common formats, leases by unit + tenant", () => {
  assert.deepEqual(parseTable('a\tb\n"x, y"\t2\n'), [["a", "b"], ["x, y", "2"]]);
  assert.deepEqual(parseTable('Name,Amount\n"Doe, Jane","$1,200.50"'), [["Name", "Amount"], ["Doe, Jane", "$1,200.50"]]);
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(99.10)"), -99.1);
  assert.ok(Number.isNaN(parseMoney("abc")));
  assert.equal(parseDate("10/31/2026"), "2026-10-31");
  assert.equal(parseDate("2026-10-31"), "2026-10-31");
  assert.equal(parseDate("31/31/2026"), "");
  const lookups = {
    leases: [
      { id: "lease-1", unit: "2B", tenantName: "Jane Doe", propertyId: "prop-1", tenantId: "t1", unitId: "u1", active: true },
      { id: "lease-2", unit: "3A", tenantName: "Sam Lee", propertyId: "prop-1", tenantId: "t2", unitId: "u2", active: true },
    ],
    properties: [{ id: "prop-1", name: "Maple Court" }],
    accounts: CHART,
  };
  const text = "Resident\tUnit #\tBalance Due\tDate\tGL Account\nJane Doe\t2B\t$1,200.00\t10/01/2026\t4000\nNobody\t9Z\t5\t\t\n";
  const { lines, issues } = linesFromPaste(text, "tenant_balance", lookups, { newId: () => "n" });
  assert.equal(lines.length, 2);
  assert.deepEqual([lines[0].leaseId, lines[0].tenantId, lines[0].amount, lines[0].itemDate, lines[0].glAccountId], ["lease-1", "t1", 1200, "2026-10-01", "rent_income"]);
  assert.equal(lines[1].leaseId, "");
  assert.equal(lines[1].metadata.unmatched.lease, "9Z · Nobody");
  assert.ok(issues.some((i) => /Row 2: couldn't match the lease/.test(i)));
});

test("paste: a trial balance's debit and credit columns become one signed balance", () => {
  const { lines } = linesFromPaste("Account\tDebit\tCredit\n3000\t\t34,550.00\n1500\t5000\t\n", "gl_balance", { accounts: CHART }, { newId: () => "n" });
  assert.deepEqual(lines.map((l) => [l.glAccountId, l.amount]), [["owner_equity", -34550], ["capital_improvements", 5000]]);
});

test("paste: rows without a header follow the template order", () => {
  const { lines } = linesFromPaste("Trust account\tChk\t2026-10-28\t1042\tAcme\t\t450", "bank_outstanding", { banks: BANKS }, { newId: () => "n" });
  assert.deepEqual([lines[0].bankAccountId, lines[0].metadata.itemType, lines[0].ref, lines[0].amount], ["bank-trust", "check", "1042", 450]);
});

test("templates: one header row and one example per balance type", () => {
  const csv = templateCsv("bill").trim().split("\n");
  assert.equal(csv[0], "Vendor,Property,Invoice #,Bill date,Due date,Amount due,Memo");
  assert.equal(csv.length, 2);
});

test("1099: a year-to-date expense brought over with its vendor counts as paid; voided or vendor-less ones don't", async () => {
  const { vendorPayments } = await import("@/lib/reports/ledger_math");
  const conv = (status = "posted") => ({ metadata: { conversion: true }, status });
  const lines = [
    { entryId: "e1", glAccountId: "repairs_maintenance", debit: 6000, credit: 0, vendorId: "v1", date: "2026-09-30", entry: conv() },
    { entryId: "e1", glAccountId: "opening_balance_equity", debit: 0, credit: 6000, vendorId: "", date: "2026-09-30", entry: conv() },
    { entryId: "e2", glAccountId: "repairs_maintenance", debit: 900, credit: 0, vendorId: "v2", date: "2026-09-30", entry: conv("void") },
    { entryId: "e3", glAccountId: "repairs_maintenance", debit: 50, credit: 0, vendorId: "v3", date: "2026-09-30", entry: { metadata: {}, status: "posted" } },
    { entryId: "e4", glAccountId: "trust_cash", debit: 0, credit: 120, vendorId: "v1", date: "2026-11-05", entry: { metadata: {}, status: "posted" } },
  ];
  const paid = Object.fromEntries(vendorPayments(lines, WITH_CLEARING, { from: "2026-01-01", to: "2026-12-31" }).map((r) => [r.vendorId, r.total]));
  assert.deepEqual(paid, { v1: 6120 });
});

test("the conversion clears through 3950 Opening Balance Equity (CORE-46 reuses it; 3900 is CORE-40's Retained Earnings)", () => {
  assert.deepEqual(CLEARING_ACCOUNT, { systemKey: "opening_balance_equity", number: "3950", name: "Opening Balance Equity", accountType: "Equity", subtype: "equity" });
  const v = validateBatch([L("gl_balance", { glAccountId: "opening_balance_equity", amount: 10 })], WITH_CLEARING, { batch: BATCH, banks: BANKS });
  assert.ok(v.errors.some((e) => /Opening Balance Equity \(3950\) clears the conversion/.test(e.message)));
  assert.equal(validateBatch(sample(), ACCT, { batch: BATCH, banks: BANKS }).entries[0].built.lines.some((l) => l.glAccountId === "opening-balance-equity"), true);
});
