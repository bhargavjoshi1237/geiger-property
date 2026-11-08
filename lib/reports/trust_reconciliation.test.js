import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIMENSIONS,
  buildBill,
  buildBillPayment,
  buildCashTransaction,
  buildCharge,
  buildDepositHeld,
  buildDepositInterest,
  buildDistribution,
  buildPayment,
  indexAccounts,
  normalizeEntry,
  normalizeLine,
  toRpcArgs,
} from "@/lib/ledger/postings";
import { ownershipIndex } from "@/lib/ledger/ownership";
import {
  bankLinesOf,
  bankReconciliationView,
  depositLeaseRows,
  reconciliationSnapshot,
  threeWayTrust,
  trustPositions,
  trustRole,
} from "./ledger_math";
import { bankReconciliationReport, depositDetailReport, trustReconciliationReport } from "./defs_financial";
import { runReport } from "./catalog";

// INTL-05: three-way trust reconciliation (adjusted bank ↔ book ↔ beneficiary ledgers) and the finalize snapshot.

const acct = indexAccounts(
  [
    ["operating_cash", "1000", "Operating Cash", "Asset", "cash", false],
    ["trust_cash", "1010", "Trust Cash", "Asset", "cash", true],
    ["deposit_cash", "1020", "Deposit Trust", "Asset", "cash", true],
    ["undeposited_funds", "1050", "Undeposited Funds", "Asset", "cash", true],
    ["accounts_receivable", "1200", "Accounts Receivable", "Asset", "receivable", false],
    ["accounts_payable", "2000", "Accounts Payable", "Liability", "payable", false],
    ["security_deposits", "2100", "Security Deposits Held", "Liability", "deposits", true],
    ["deposit_interest_payable", "2110", "Deposit Interest Payable", "Liability", "deposits", true],
    ["prepaid_rent", "2200", "Prepaid Rent", "Liability", "prepaid", false],
    ["owner_distributions", "3200", "Owner Distributions", "Equity", "distribution", false],
    ["rent_income", "4000", "Rental Income", "Income", "income", false],
    ["other_income", "4100", "Other Income", "Income", "income", false],
    ["repairs_maintenance", "5000", "Repairs & Maintenance", "Expense", "expense", false],
    ["deposit_interest", "5600", "Deposit Interest Expense", "Expense", "expense", false],
  ].map(([systemKey, number, name, accountType, subtype, isTrust]) => ({ id: systemKey, systemKey, number, name, accountType, subtype, isTrust })),
);

const TRUST = { id: "bank-t", name: "Rent trust", accountType: "Trust", glAccountId: "trust_cash", status: "Active", last4: "4839" };
const DEP = { id: "bank-d", name: "Deposit trust", accountType: "Security deposit", glAccountId: "deposit_cash", status: "Active" };
const BANKS = [TRUST, DEP];
const P1 = "prop-1";
const P2 = "prop-2";
const [A, B, C] = ["owner-a", "owner-b", "owner-c"];
const ownership = ownershipIndex([
  { owner_id: A, property_id: P1, ownership_pct: 60, is_primary: true },
  { owner_id: B, property_id: P1, ownership_pct: 40 },
  { owner_id: C, property_id: P2, ownership_pct: 100, is_primary: true },
]);
const L1 = { leaseId: "lease-1", tenantId: "t1", unitId: "u1", propertyId: P1 };
const L2 = { leaseId: "lease-2", tenantId: "t2", unitId: "u2", propertyId: P2 };
const S = "2026-09-30";

// Built posting → stored lines (entry dimensions inherited, as property.ledger_post stores them).
let seq = 0;
function post(built) {
  assert.ok(!built.error, built.error);
  const id = `e${++seq}`;
  const { p_entry: e, p_lines: pl } = toRpcArgs({ ...built, entry: { ...built.entry, id } });
  const entry = normalizeEntry({ ...e, id, status: "posted" });
  return pl.map((l, i) => {
    const row = { ...l, id: `${id}-${i + 1}`, entry_id: id, entry_date: e.entry_date, line_no: i + 1 };
    for (const col of Object.values(DIMENSIONS)) if (!(col in l) && col in e) row[col] = e[col];
    return { ...normalizeLine(row), entry };
  });
}

// Finalize a statement for a bank: stamp its lines through the date (minus `skip`) and return the reconciliation row.
function finalize(lines, bank, statementDate, { id = `rec-${bank.id}`, skip = [] } = {}) {
  const mine = new Set(bankLinesOf(lines, bank, acct).lines.filter((l) => l.date <= statementDate && !l.reconciliationId && !skip.includes(l.id)).map((l) => l.id));
  const stamped = lines.map((l) => (mine.has(l.id) ? { ...l, cleared: true, clearedOn: statementDate, reconciliationId: id } : l));
  const balance = stamped.filter((l) => l.reconciliationId && bankLinesOf([l], bank, acct).lines.length).reduce((s, l) => s + l.debit - l.credit, 0);
  return { lines: stamped, rec: { id, bankAccountId: bank.id, status: "Finalized", statementDate, statementBalance: Math.round(balance * 100) / 100, finalizedAt: `${statementDate}T18:00:00Z`, metadata: { clearedLineIds: [...mine] } } };
}

// Rent collected on both properties, a repairs bill paid, an owner draw, a tenant overpayment and a security deposit.
function book() {
  seq = 0;
  const lines = [
    ...post(buildCharge({ date: "2026-09-01", amount: 1000, ...L1 }, acct)),
    ...post(buildPayment({ date: "2026-09-03", amount: 1000, bankAccountId: TRUST.id, ...L1, allocations: [{ entryId: "e1", amount: 1000 }] }, acct)),
    ...post(buildCharge({ date: "2026-09-01", amount: 1000, ...L2 }, acct)),
    ...post(buildPayment({ date: "2026-09-05", amount: 1200, bankAccountId: TRUST.id, ...L2, allocations: [{ entryId: "e3", amount: 1000 }] }, acct)),
    ...post(buildBill({ date: "2026-09-08", amount: 300, propertyId: P1, vendorId: "v1" }, acct)),
    ...post(buildBillPayment({ date: "2026-09-10", amount: 300, propertyId: P1, vendorId: "v1", bankAccountId: TRUST.id, billEntryId: "e5" }, acct)),
    ...post(buildDistribution({ date: "2026-09-20", amount: 200, propertyId: P1, ownerId: A, bankAccountId: TRUST.id }, acct)),
    ...post(buildDepositHeld({ date: "2026-09-02", amount: 1500, depositId: "dep-1", bankAccountId: DEP.id, ...L1 }, acct)),
  ];
  const deposits = [{ id: "dep-1", leaseId: L1.leaseId, tenantId: L1.tenantId, status: "Held", amount: 1500, chargeEntryId: "e8" }];
  return { lines, deposits };
}

function reconciled(extra = (l) => l) {
  const base = book();
  const lines = extra(base.lines);
  const t = finalize(lines, TRUST, S);
  const d = finalize(t.lines, DEP, S);
  return { lines: d.lines, recs: [t.rec, d.rec], deposits: base.deposits };
}

const run = ({ lines, recs, deposits }, bank, asOf = S) =>
  threeWayTrust({ lines, accounts: acct, reconciliations: recs, bankAccounts: BANKS, asOf, bankAccountId: bank.id, ownership, deposits });

test("roles: the Trust bank receives resident money, the Security deposit bank holds deposits", () => {
  assert.equal(trustRole(TRUST, BANKS, acct), "rent");
  assert.equal(trustRole(DEP, BANKS, acct), "deposit");
  assert.equal(trustRole({ id: "r", accountType: "Reserve", glAccountId: "deposit_cash" }, BANKS, acct), "deposit");
});

test("balanced: adjusted bank = book = beneficiaries, tenant credits broken out of the owner they sit with", () => {
  const data = reconciled();
  const tw = run(data, TRUST);
  assert.equal(tw.status.key, "balanced");
  assert.equal(tw.status.label, "Balanced");
  assert.equal(tw.book.cash, 1700); // 1000 + 1200 − 300 − 200
  assert.equal(tw.bank.adjusted, 1700);
  assert.equal(tw.beneficiaries.total, 1700);
  assert.equal(tw.beneficiaries.tenantCredits, 200);
  assert.deepEqual(tw.beneficiaries.creditRows.map((r) => [r.leaseId, r.unapplied, r.credit]), [["lease-2", 200, 200]]);
  const funds = Object.fromEntries(tw.beneficiaries.ownerRows.map((r) => [r.ownerId, [r.position, r.held, r.funds]]));
  assert.deepEqual(funds[A], [220, 0, 220]); // 60% of (1000 − 300) − 200 draw
  assert.deepEqual(funds[B], [280, 0, 280]);
  assert.deepEqual(funds[C], [1200, 200, 1000]);
  // The owner listing total equals the trust positions report for the account.
  const positions = trustPositions(data.lines, acct, S, ownership).filter((p) => p.systemKey === "trust_cash" && p.ownerId);
  assert.equal(tw.beneficiaries.positions, Math.round(positions.reduce((s, p) => s + p.balance, 0) * 100) / 100);
  assert.deepEqual(tw.differences, { bank: 0, untagged: 0, deposits: 0, unposted: 0 });
  assert.equal(tw.exceptions.length, 0);

  const dep = run(data, DEP);
  assert.equal(dep.status.key, "balanced");
  assert.equal(dep.book.cash, 1500);
  assert.equal(dep.beneficiaries.deposits, 1500);
  assert.deepEqual(dep.beneficiaries.depositRows.map((r) => [r.key, r.ledger, r.match]), [["lease-1", 1500, "match"]]);
});

test("untagged: a trust receipt with no owner or property is listed and puts the account out of balance", () => {
  const data = reconciled((lines) => [
    ...lines,
    ...post(buildCashTransaction({ date: "2026-09-25", direction: "in", amount: 125, cashGlAccountId: "trust_cash", bankAccountId: TRUST.id, glAccountId: "other_income", memo: "Unknown wire" }, acct)),
  ]);
  const tw = run(data, TRUST);
  assert.equal(tw.differences.untagged, 125);
  assert.equal(tw.status.key, "out_of_balance");
  assert.equal(tw.status.label, "Out of balance (untagged $125.00)");
  assert.deepEqual(tw.untagged.lines.map((l) => [l.memo, l.amount, l.reason]), [["Unknown wire", 125, "No owner or property"]]);
  assert.equal(tw.differences.bank, 0, "it cleared with the statement, so the bank still ties");
  assert.ok(tw.exceptions.some((x) => x.id === "untagged" && x.amount === 125));
});

test("untagged: property money on a property with no owner on its date is untagged too", () => {
  const data = reconciled((lines) => [...lines, ...post(buildPayment({ date: "2026-09-12", amount: 50, bankAccountId: TRUST.id, propertyId: "prop-x", leaseId: "lease-x" }, acct))]);
  const tw = run(data, TRUST);
  // The 50 is both an unowned receipt and a credit held for lease-x on the same unowned property, so they net out.
  assert.equal(tw.differences.untagged, 0);
  assert.deepEqual(
    tw.untagged.lines.map((l) => [l.amount, l.reason]).sort((x, y) => x[0] - y[0]),
    [
      [-50, "Held for a tenant; no owner on Sep 30, 2026"],
      [50, "No owner on Sep 12, 2026"],
    ],
  );
  // Without the credit it would be untagged: an unowned property's rent with nothing held for the tenant.
  const charged = reconciled((lines) => [
    ...lines,
    ...post(buildCharge({ date: "2026-09-01", amount: 50, propertyId: "prop-x", leaseId: "lease-x" }, acct)),
    ...post(buildPayment({ date: "2026-09-12", amount: 50, bankAccountId: TRUST.id, propertyId: "prop-x", leaseId: "lease-x", allocations: [{ entryId: `e${seq}`, amount: 50 }] }, acct)),
  ]);
  assert.equal(run(charged, TRUST).status.label, "Out of balance (untagged $50.00)");
});

test("unposted deposit: a record on a lease with no ledger posting shows as unposted, as Deposit Detail shows it", () => {
  const data = reconciled();
  data.deposits.push({ id: "dep-2", leaseId: L2.leaseId, tenantId: L2.tenantId, status: "Held", amount: 900, chargeEntryId: "" });
  const tw = run(data, DEP);
  assert.equal(tw.differences.unposted, 900);
  assert.equal(tw.status.label, "Out of balance (unposted deposits $900.00)");
  const row = tw.beneficiaries.depositRows.find((r) => r.key === L2.leaseId);
  assert.equal(row.match, "unposted");
  const detail = runReport(depositDetailReport, { ledger: { lines: data.lines, accounts: acct }, deposits: data.deposits, leases: [], units: [], tenants: [], properties: [], owners: [], propertyOwners: [] }, { from: "2026-01-01", to: S, propertyId: "all" });
  assert.equal(detail.sections.find((s) => s.key === "leases").rows.find((r) => r.id === L2.leaseId).match, "unposted");
  assert.ok(tw.exceptions.some((x) => x.id === `unposted:${L2.leaseId}` && x.amount === 900));
});

test("deposit records dated after the as-of date don't count yet", () => {
  const data = reconciled((lines) => [...lines, ...post(buildDepositHeld({ date: "2026-10-17", amount: 700, depositId: "dep-3", bankAccountId: DEP.id, ...L2 }, acct))]);
  data.deposits.push({ id: "dep-3", leaseId: L2.leaseId, status: "Held", amount: 700, chargeEntryId: `e${seq}` });
  assert.equal(depositLeaseRows(data.lines, acct, S, data.deposits).find((r) => r.key === L2.leaseId), undefined);
  assert.equal(run(data, DEP).status.key, "balanced");
  assert.equal(depositLeaseRows(data.lines, acct, "2026-10-31", data.deposits).find((r) => r.key === L2.leaseId).match, "match");
});

test("outstanding check: a payment before the statement that didn't clear adjusts the bank side", () => {
  const extra = (lines) => [...lines, ...post(buildBillPayment({ date: "2026-09-28", amount: 250, propertyId: P1, vendorId: "v1", bankAccountId: TRUST.id, metadata: { checkNumber: "1042" } }, acct))];
  const base = book();
  const lines = extra(base.lines);
  const checkId = lines[lines.length - 1].glAccountId === "trust_cash" ? lines[lines.length - 1].id : lines[lines.length - 2].id;
  const t = finalize(lines, TRUST, S, { skip: [checkId] });
  const tw = threeWayTrust({ lines: t.lines, accounts: acct, reconciliations: [t.rec], bankAccounts: BANKS, asOf: S, bankAccountId: TRUST.id, ownership, deposits: base.deposits });
  assert.equal(tw.bank.statementBalance, 1700);
  assert.deepEqual(tw.bank.outstandingChecks.map((r) => [r.id, r.amount, r.reference]), [[checkId, 250, "1042"]]);
  assert.equal(tw.bank.adjusted, 1450);
  assert.equal(tw.book.cash, 1450);
  assert.equal(tw.status.key, "balanced");
});

test("snapshot: the printed reconciliation keeps what was finalized after a back-dated posting", () => {
  const base = book();
  const bankLines = bankLinesOf(base.lines, TRUST, acct).lines;
  const clearedIds = bankLines.map((l) => l.id);
  const snapshot = reconciliationSnapshot({ lines: bankLines, bank: TRUST, glAccountId: "trust_cash", statementDate: S, statementBalance: 1700, clearedIds, finalizedAt: "2026-10-04T18:00:00Z", finalizedBy: { id: "u1", name: "Dana" } });
  assert.equal(snapshot.bookBalance, 1700);
  assert.equal(snapshot.adjustedBank, 1700);
  assert.deepEqual([snapshot.outstandingDepositIds, snapshot.outstandingCheckIds], [[], []]);
  assert.equal(snapshot.finalizedBy.name, "Dana");
  const stamped = base.lines.map((l) => (clearedIds.includes(l.id) ? { ...l, cleared: true, reconciliationId: "rec-1" } : l));
  const rec = { id: "rec-1", bankAccountId: TRUST.id, status: "Finalized", statementDate: S, statementBalance: 1700, finalizedAt: "2026-10-04T18:00:00Z", metadata: { clearedLineIds: clearedIds, snapshot } };
  // A back-dated receipt into the reconciled month, posted after sign-off.
  const later = [...stamped, ...post(buildPayment({ date: "2026-09-15", amount: 75, bankAccountId: TRUST.id, ...L1 }, acct))];
  const view = bankReconciliationView(rec, { lines: later, accounts: acct, bankAccounts: BANKS, reconciliations: [rec] });
  assert.equal(view.reconstructed, false);
  assert.equal(view.snapshot.bookBalance, 1700);
  assert.equal(view.snapshot.outstanding.deposits.length, 0);
  const printed = runReport(bankReconciliationReport, { ledger: { lines: later, accounts: acct }, bankAccounts: BANKS, bankReconciliations: [rec] }, { reconciliationId: rec.id });
  assert.equal(printed.stats.find((s) => s.label === "Book balance").value, "$1,700.00");
  assert.equal(printed.stats.find((s) => s.label === "Book balance").footer, "At sign-off");
  assert.equal(printed.periodLabel, "Statement Sep 30, 2026");
  assert.match(printed.subtitle, /Finalized Oct 4, 2026 by Dana/);
  assert.equal(printed.sections.find((s) => s.key === "cleared_deposits").rows.length, 2);
  // Live, the three-way still ties (the back-dated line is outstanding) but flags the change since sign-off.
  const tw = threeWayTrust({ lines: later, accounts: acct, reconciliations: [rec], bankAccounts: BANKS, asOf: S, bankAccountId: TRUST.id, ownership, deposits: base.deposits });
  assert.equal(tw.bank.adjusted, tw.book.cash);
  assert.equal(tw.bank.outstandingIn, 75);
  assert.ok(tw.exceptions.some((x) => x.id === "backdated" && x.amount === 75));
  // Without a snapshot the view is rebuilt from today's ledger.
  const legacy = bankReconciliationView({ ...rec, metadata: { clearedLineIds: clearedIds } }, { lines: later, accounts: acct, bankAccounts: BANKS, reconciliations: [rec] });
  assert.equal(legacy.reconstructed, true);
  assert.equal(legacy.snapshot.bookBalance, 1775);
  assert.equal(legacy.snapshot.difference, 0);
});

test("not reconciled: no statement, or a statement from an earlier month", () => {
  const base = book();
  const none = threeWayTrust({ lines: base.lines, accounts: acct, reconciliations: [], bankAccounts: BANKS, asOf: S, bankAccountId: TRUST.id, ownership, deposits: base.deposits });
  assert.equal(none.status.key, "not_reconciled");
  assert.equal(none.bank, null);
  assert.equal(none.differences.bank, null);
  const data = reconciled();
  const stale = run(data, TRUST, "2026-10-31");
  assert.equal(stale.status.key, "not_reconciled");
  assert.ok(stale.exceptions.some((x) => x.id === "stale"));
});

test("deposit interest: accrued interest the account doesn't hold is a note, held interest counts", () => {
  const accrued = reconciled((lines) => [...lines, ...post(buildDepositInterest({ date: "2026-09-30", amount: 5.25, depositId: "dep-1", ...L1 }, acct))]);
  const a = run(accrued, DEP);
  assert.equal(a.status.key, "balanced");
  assert.equal(a.beneficiaries.interestFunded, 0);
  assert.ok(a.exceptions.some((x) => x.id === "interest" && x.severity === "info" && x.amount === 5.25));
  const held = reconciled((lines) => [
    ...lines,
    ...post(buildDepositInterest({ date: "2026-09-29", amount: 5.25, depositId: "dep-1", ...L1 }, acct)),
    ...post(buildCashTransaction({ date: "2026-09-29", direction: "transfer", amount: 5.25, cashGlAccountId: "trust_cash", bankAccountId: TRUST.id, toCashGlAccountId: "deposit_cash", toBankAccountId: DEP.id, ...L1 }, acct)),
  ]);
  const h = run(held, DEP);
  assert.equal(h.beneficiaries.interestFunded, 5.25);
  assert.equal(h.beneficiaries.deposits, 1505.25);
  assert.equal(h.status.key, "balanced");
});

test("a bank on a shared system GL reads only its own and untagged lines", () => {
  const shared = { id: "bank-2", name: "Second trust", accountType: "Trust", glAccountId: "", status: "Active" };
  const lines = [
    { id: "a", glAccountId: "trust_cash", bankAccountId: "bank-2", debit: 10, credit: 0, date: S },
    { id: "b", glAccountId: "trust_cash", bankAccountId: "bank-t", debit: 20, credit: 0, date: S },
    { id: "c", glAccountId: "trust_cash", bankAccountId: "", debit: 30, credit: 0, date: S },
  ];
  assert.deepEqual(bankLinesOf(lines, shared, acct).lines.map((l) => l.id), ["a", "c"]);
  assert.deepEqual(bankLinesOf(lines, TRUST, acct).lines.map((l) => l.id), ["a", "b", "c"]);
});

test("report: trust_reconciliation renders the summary, listings and exceptions with the status", () => {
  const data = reconciled((lines) => [
    ...lines,
    ...post(buildCashTransaction({ date: "2026-09-25", direction: "in", amount: 125, cashGlAccountId: "trust_cash", bankAccountId: TRUST.id, glAccountId: "other_income", memo: "Unknown wire" }, acct)),
  ]);
  const sources = { ledger: { lines: data.lines, accounts: acct }, bankAccounts: BANKS, bankReconciliations: data.recs, propertyOwners: ownership.rows.map((r) => ({ ownerId: r.ownerId, propertyId: r.propertyId, ownershipPct: r.pct, isPrimary: r.isPrimary })), owners: [], leases: [], tenants: [], units: [], deposits: data.deposits, properties: [] };
  const r = runReport(trustReconciliationReport, sources, { from: S, to: S, bankAccountId: TRUST.id });
  assert.equal(r.stats.find((s) => s.label === "Status").value, "Out of balance");
  assert.equal(r.sections.find((s) => s.key === "check").description, "Out of balance (untagged $125.00)");
  assert.deepEqual(
    r.sections.map((s) => s.key),
    ["bank", "book", "beneficiaries", "check", "outstanding_deposits", "outstanding_checks", "owners", "credits", "untagged", "exceptions"],
  );
  assert.equal(r.sections.find((s) => s.key === "untagged").totals.amount, 125);
  const dep = runReport(trustReconciliationReport, sources, { from: S, to: S, bankAccountId: DEP.id });
  assert.deepEqual(dep.sections.map((s) => s.key), ["bank", "book", "beneficiaries", "check", "outstanding_deposits", "outstanding_checks", "deposits", "exceptions"]);
});
