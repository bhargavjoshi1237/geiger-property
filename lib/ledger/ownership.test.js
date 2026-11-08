import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIMENSIONS,
  buildBill,
  buildBillPayment,
  buildCharge,
  buildDistribution,
  buildJournal,
  buildManagementFee,
  buildPayment,
  indexAccounts,
  normalizeEntry,
  normalizeLine,
  runningLedger,
  toRpcArgs,
} from "@/lib/ledger/postings";
import { ownerPropertyRows, ownerStatement, ownerStatementMonths, trustPositions } from "@/lib/reports/ledger_math";
import {
  lineAllocation,
  lineShares,
  ownerLinesFilter,
  ownerScopedLines,
  ownerShare,
  ownerTagOf,
  ownershipGaps,
  ownershipIndex,
  pctHistory,
  pctOn,
  shareLabel,
  statementOwnershipRows,
} from "./ownership";

// CORE-08: owner shares applied at report time from effective-dated property_owners.

const acct = indexAccounts(
  [
    ["operating_cash", "1000", "Operating Cash", "Asset", "cash", false],
    ["trust_cash", "1010", "Trust Cash", "Asset", "cash", true],
    ["deposit_cash", "1020", "Deposit Trust", "Asset", "cash", true],
    ["accounts_receivable", "1200", "Accounts Receivable", "Asset", "receivable", false],
    ["accounts_payable", "2000", "Accounts Payable", "Liability", "payable", false],
    ["owner_distributions", "3200", "Owner Distributions", "Equity", "distribution", false],
    ["owner_contributions", "3100", "Owner Contributions", "Equity", "contribution", false],
    ["rent_income", "4000", "Rental Income", "Income", "income", false],
    ["management_fee_income", "4500", "Management Fee Income", "Income", "income", false],
    ["repairs_maintenance", "6100", "Repairs & Maintenance", "Expense", "expense", false],
    ["management_fees", "6200", "Management Fees", "Expense", "expense", false],
  ].map(([systemKey, number, name, accountType, subtype, isTrust]) => ({ id: systemKey, systemKey, number, name, accountType, subtype, isTrust })),
);

const P = "prop-1";
const A = "owner-a";
const B = "owner-b";

// Built posting → lines as toRpcArgs + property.ledger_post would store them (entry dimensions inherited).
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

// The acceptance scenario: rent 1,000 collected, a 200 repairs bill paid, an 80 management fee.
function scenario(date = "2026-10") {
  return [
    ...post(buildCharge({ date: `${date}-01`, amount: 1000, propertyId: P, leaseId: "l1", tenantId: "t1", ownerId: A }, acct)),
    ...post(buildPayment({ date: `${date}-03`, amount: 1000, propertyId: P, leaseId: "l1", tenantId: "t1", ownerId: A }, acct)),
    ...post(buildBill({ date: `${date}-10`, amount: 200, propertyId: P, vendorId: "v1", ownerId: A }, acct)),
    ...post(buildBillPayment({ date: `${date}-12`, amount: 200, propertyId: P, vendorId: "v1" }, acct)),
    ...post(buildManagementFee({ date: `${date}-28`, amount: 80, propertyId: P, ownerId: A }, acct)),
  ];
}

const sixtyForty = ownershipIndex([
  { owner_id: A, property_id: P, ownership_pct: 60, is_primary: true },
  { owner_id: B, property_id: P, ownership_pct: 40 },
]);
const range = { from: "2026-10-01", to: "2026-10-31" };
const statementOf = (lines, owner, idx = sixtyForty) => ownerStatement(ownerScopedLines(lines, owner, idx), acct, range).totals;

test("property postings carry no owner; only owner-specific entries keep it", () => {
  const lines = scenario();
  assert.ok(lines.every((l) => l.ownerId === ""), "charge, payment, bill and fee lines are property-level");
  const dist = post(buildDistribution({ date: "2026-10-30", amount: 300, propertyId: P, ownerId: A }, acct));
  assert.ok(dist.every((l) => l.ownerId === A));
  const plain = post(buildJournal({ date: "2026-10-30", ownerId: A, lines: [{ glAccountId: "repairs_maintenance", debit: 5, ownerId: A }, { glAccountId: "trust_cash", credit: 5 }] }));
  assert.ok(plain.every((l) => l.ownerId === "" && l.entry.ownerId === ""), "a journal without ownerExplicit is property-level");
  const explicit = post(buildJournal({ date: "2026-10-30", ownerId: A, metadata: { ownerExplicit: true }, lines: [{ glAccountId: "repairs_maintenance", debit: 5 }, { glAccountId: "trust_cash", credit: 5 }] }));
  assert.ok(explicit.every((l) => l.ownerId === A));
});

test("management fee marks the manager's lines, which no owner shares", () => {
  const fee = post(buildManagementFee({ date: "2026-10-28", amount: 80, propertyId: P }, acct));
  const manager = fee.filter((l) => ["operating_cash", "management_fee_income"].includes(l.glAccountId));
  assert.equal(manager.length, 2);
  for (const l of manager) {
    assert.equal(l.metadata.side, "manager");
    assert.deepEqual(lineShares(l, sixtyForty), []);
  }
  const expense = fee.find((l) => l.glAccountId === "management_fees");
  assert.equal(ownerShare(expense, A, sixtyForty), 0.6);
  assert.equal(ownerShare(expense, B, sixtyForty), 0.4);
});

test("60/40 co-owners: income, expenses, fees and net split by share; 4500 in neither", () => {
  const lines = scenario();
  const a = statementOf(lines, A);
  const b = statementOf(lines, B);
  assert.deepEqual([a.income, a.expenses, a.fees, a.noi], [600, 120, 48, 432]);
  assert.deepEqual([b.income, b.expenses, b.fees, b.noi], [400, 80, 32, 288]);
  // A + B equals the property totals (owner income excludes the manager's 4500).
  const property = ownerStatement(lines.filter((l) => l.metadata.side !== "manager"), acct, range).totals;
  for (const k of ["income", "expenses", "fees", "noi", "closing"]) assert.equal(a[k] + b[k], property[k], k);
  for (const owner of [A, B]) {
    assert.ok(!ownerScopedLines(lines, owner, sixtyForty).some((l) => l.glAccountId === "management_fee_income"));
  }
});

test("a distribution tagged to A reduces only A's funds in trust", () => {
  const lines = scenario();
  const before = [statementOf(lines, A).closing, statementOf(lines, B).closing];
  assert.deepEqual(before, [432, 288]);
  const after = [...lines, ...post(buildDistribution({ date: "2026-10-30", amount: 300, propertyId: P, ownerId: A }, acct))];
  const a = statementOf(after, A);
  const b = statementOf(after, B);
  assert.equal(a.closing, 132);
  assert.equal(a.distributions, 300);
  assert.equal(b.closing, 288);
  assert.equal(b.distributions, 0);
});

test("an ownership change on the 15th splits lines by their dates", () => {
  const idx = ownershipIndex([
    { ownerId: A, propertyId: P, ownershipPct: 60, endsOn: "2026-10-14" },
    { ownerId: B, propertyId: P, ownershipPct: 40, endsOn: "2026-10-14" },
    { ownerId: A, propertyId: P, ownershipPct: 40, startsOn: "2026-10-15" },
    { ownerId: B, propertyId: P, ownershipPct: 60, startsOn: "2026-10-15" },
  ]);
  const lines = [
    ...post(buildCharge({ date: "2026-10-10", amount: 1000, propertyId: P, leaseId: "l1" }, acct)),
    ...post(buildCharge({ date: "2026-10-20", amount: 500, propertyId: P, leaseId: "l1" }, acct)),
  ];
  assert.equal(pctOn(idx, P, A, "2026-10-14"), 60);
  assert.equal(pctOn(idx, P, A, "2026-10-15"), 40);
  assert.equal(statementOf(lines, A, idx).income, 600 + 200);
  assert.equal(statementOf(lines, B, idx).income, 400 + 300);
  assert.equal(shareLabel(pctHistory(idx, P, A, range)), "60% → 40%");
  assert.equal(shareLabel(pctHistory(idx, P, A, { from: "2026-10-15", to: "2026-10-31" })), "40%");
  assert.deepEqual(ownershipGaps(idx, P), []);
});

test("stray owner tags on property entries are ignored; tags count on owner-specific entries", () => {
  const charge = { id: "x", ownerId: A, propertyId: P, date: "2026-10-01", debit: 0, credit: 100, metadata: {}, entry: { sourceType: "charge", metadata: {} } };
  assert.equal(ownerTagOf(charge), "");
  assert.equal(ownerShare(charge, A, sixtyForty), 0.6);
  assert.equal(ownerShare(charge, B, sixtyForty), 0.4);
  const dist = { ...charge, entry: { sourceType: "distribution", metadata: {} } };
  assert.equal(ownerShare(dist, A, sixtyForty), 1);
  assert.equal(ownerShare(dist, B, sixtyForty), 0);
  const reversal = { ...charge, entry: { sourceType: "adjustment", reversalOf: "e0", metadata: { voidOf: "e0", ownerExplicit: true } } };
  assert.equal(ownerShare(reversal, A, sixtyForty), 1);
});

test("ownership gaps: any dated stretch that doesn't total 100%", () => {
  const idx = ownershipIndex([
    { ownerId: A, propertyId: P, ownershipPct: 60, startsOn: "2026-01-01" },
    { ownerId: B, propertyId: P, ownershipPct: 30, startsOn: "2026-03-01", endsOn: "2026-05-31" },
    { ownerId: B, propertyId: P, ownershipPct: 40, startsOn: "2026-06-01" },
    { ownerId: "c", propertyId: "prop-2", ownershipPct: 100, endsOn: "2026-02-28" },
    { ownerId: "d", propertyId: "prop-2", ownershipPct: 100, startsOn: "2026-04-01" },
  ]);
  assert.deepEqual(ownershipGaps(idx, P), [
    { from: "2026-01-01", to: "2026-02-28", total: 60 },
    { from: "2026-03-01", to: "2026-05-31", total: 90 },
  ]);
  // Before the first owner and after the last aren't gaps; an empty stretch between owners is.
  assert.deepEqual(ownershipGaps(idx, "prop-2"), [{ from: "2026-03-01", to: "2026-03-31", total: 0 }]);
  assert.deepEqual(ownershipGaps(idx, "prop-3"), []);
});

test("trust positions split per owner by share; over-distribution shows as that owner's shortfall", () => {
  const lines = [...scenario(), ...post(buildDistribution({ date: "2026-10-30", amount: 500, propertyId: P, ownerId: A }, acct))];
  const byProperty = trustPositions(lines, acct, "2026-10-31");
  assert.deepEqual(byProperty.map((t) => [t.ownerId, t.balance]), [["", 220]]);
  const byOwner = trustPositions(lines, acct, "2026-10-31", sixtyForty);
  const bal = (o) => byOwner.find((t) => t.ownerId === o)?.balance;
  assert.equal(bal(A), -68);
  assert.equal(bal(B), 288);
  assert.equal(byOwner.reduce((s, t) => s + t.balance, 0), 220);
  // A property only 90% owned keeps the rest as an unassigned position.
  const ninety = ownershipIndex([{ ownerId: A, propertyId: P, ownershipPct: 60 }, { ownerId: B, propertyId: P, ownershipPct: 30 }]);
  const split = trustPositions(scenario(), acct, "2026-10-31", ninety);
  assert.equal(split.find((t) => t.ownerId === "")?.balance, 72);
});

test("monthly totals match the statement for each month", () => {
  const lines = [...scenario("2026-09"), ...scenario("2026-10")];
  const scoped = ownerScopedLines(lines, B, sixtyForty);
  const months = ownerStatementMonths(scoped, acct);
  assert.deepEqual(months.map((m) => m.month), ["2026-10", "2026-09"]);
  const oct = ownerStatement(scoped, acct, range).totals;
  assert.deepEqual([months[0].income, months[0].expenses, months[0].fees, months[0].net], [oct.income, oct.expenses, oct.fees, oct.noi]);
});

// Rent of 1,000.01 charged and collected on property P.
const oddCent = () => [
  ...post(buildCharge({ date: "2026-10-01", amount: 1000.01, propertyId: P, leaseId: "l1" }, acct)),
  ...post(buildPayment({ date: "2026-10-02", amount: 1000.01, propertyId: P, leaseId: "l1" }, acct)),
];
const cents = (n) => Math.round(n * 100);

test("50/50 on an odd cent: whole cents that add back to the line, the extra cent to the primary", () => {
  const idx = ownershipIndex([
    { ownerId: A, propertyId: P, ownershipPct: 50 },
    { ownerId: B, propertyId: P, ownershipPct: 50, isPrimary: true },
  ]);
  const lines = oddCent();
  const [a, b] = [A, B].map((o) => ownerStatement(ownerScopedLines(lines, o, idx), acct, range).totals);
  assert.deepEqual([a.income, b.income], [500, 500.01]);
  assert.equal(cents(a.income) + cents(b.income), 100001);
  assert.equal(cents(a.closing) + cents(b.closing), 100001);
  const positions = trustPositions(lines, acct, "2026-10-31", idx);
  assert.equal(positions.reduce((s, t) => s + cents(t.balance), 0), 100001);
  // Without a primary the tie goes to the lower ownerId.
  const noPrimary = ownershipIndex([{ ownerId: "x", propertyId: P, ownershipPct: 50 }, { ownerId: "y", propertyId: P, ownershipPct: 50 }]);
  const split = lineAllocation(lines.find((l) => l.glAccountId === "rent_income"), noPrimary);
  assert.deepEqual(split.owners.map((o) => [o.ownerId, o.credit]), [["x", 500.01], ["y", 500]]);
});

test("three-way 33.33 / 33.33 / 33.34 split sums to the cent", () => {
  const idx = ownershipIndex([
    { ownerId: A, propertyId: P, ownershipPct: 33.33 },
    { ownerId: B, propertyId: P, ownershipPct: 33.33 },
    { ownerId: "c", propertyId: P, ownershipPct: 33.34 },
  ]);
  const lines = oddCent();
  const incomes = [A, B, "c"].map((o) => ownerStatement(ownerScopedLines(lines, o, idx), acct, range).totals.income);
  assert.equal(incomes.reduce((s, v) => s + cents(v), 0), 100001);
  assert.deepEqual(incomes, [333.3, 333.3, 333.41]);
  for (const l of lines) {
    const s = lineAllocation(l, idx);
    assert.equal(s.owners.reduce((t, o) => t + cents(o.debit) + cents(o.credit), 0), cents(l.debit) + cents(l.credit));
    assert.deepEqual(s.unassigned, { debit: 0, credit: 0 });
  }
});

test("under 100% the leftover cents stay unassigned", () => {
  const idx = ownershipIndex([{ ownerId: A, propertyId: P, ownershipPct: 60 }, { ownerId: B, propertyId: P, ownershipPct: 30 }]);
  const rent = oddCent().find((l) => l.glAccountId === "rent_income");
  const s = lineAllocation(rent, idx);
  // Owners get whole cents of their 90% (900.00 of 900.009); the rest, 100.01, stays unassigned.
  assert.deepEqual(s.owners.map((o) => o.credit), [600, 300]);
  assert.equal(s.unassigned.credit, 100.01);
});

test("owner ledger section balance equals the statement closing over a year of odd cents", () => {
  const idx = ownershipIndex([{ ownerId: A, propertyId: P, ownershipPct: 60 }, { ownerId: B, propertyId: P, ownershipPct: 40 }]);
  const lines = [];
  for (let m = 1; m <= 12; m += 1) {
    const date = `2026-${String(m).padStart(2, "0")}-03`;
    lines.push(...post(buildCharge({ date, amount: 1000.01, propertyId: P, leaseId: "l1" }, acct)));
    lines.push(...post(buildPayment({ date, amount: 1000.01, propertyId: P, leaseId: "l1" }, acct)));
  }
  const closings = [A, B].map((o) => {
    const scoped = ownerScopedLines(lines, o, idx);
    const closing = ownerStatement(scoped, acct, { from: "2026-01-01", to: "2026-12-31" }).totals.closing;
    assert.equal(runningLedger("owner", scoped, acct).at(-1).balance, closing);
    return closing;
  });
  assert.equal(cents(closings[0]) + cents(closings[1]), 12 * 100001);
});

test("gaps before the first owner count only where the ledger has activity", () => {
  const idx = ownershipIndex([{ ownerId: A, propertyId: P, ownershipPct: 100, startsOn: "2026-03-01", endsOn: "2026-09-30" }]);
  assert.deepEqual(ownershipGaps(idx, P), []);
  assert.deepEqual(ownershipGaps(idx, P, { firstActivity: "2026-01-15", lastActivity: "2026-11-02" }), [
    { from: "2026-01-15", to: "2026-02-28", total: 0 },
    { from: "2026-10-01", to: "2026-11-02", total: 0 },
  ]);
  assert.deepEqual(ownershipGaps(idx, P, { firstActivity: "2026-03-10", lastActivity: "2026-09-01" }), []);
});

test("shared helpers: legacy splits fallback, owner-lines filter, statement property rows", () => {
  const owner = { id: A, metadata: { properties: [{ propertyName: "Harbor", percent: 60 }] } };
  const rows = statementOwnershipRows(owner, [{ ownerId: B, propertyId: "p9", ownershipPct: 100 }], [{ id: P, name: "Harbor" }]);
  assert.deepEqual(rows.at(-1), { ownerId: A, propertyId: P, ownershipPct: 60 });
  assert.equal(statementOwnershipRows({ id: B }, rows, []), rows);
  assert.equal(ownerLinesFilter(A, [P, P, ""]), `owner_id.eq.${A},property_id.in.(${P})`);
  assert.equal(ownerLinesFilter(A, []), `owner_id.eq.${A}`);
  const st = ownerStatement(ownerScopedLines(scenario(), A, sixtyForty), acct, range);
  const props = ownerPropertyRows(st, sixtyForty, A, range, () => "Harbor");
  assert.deepEqual(props.map((r) => [r.propertyId, r.name, r.share, r.net]), [[P, "Harbor", "60%", 432]]);
});
