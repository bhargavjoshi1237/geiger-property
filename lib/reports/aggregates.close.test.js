import { test } from "node:test";
import assert from "node:assert/strict";
import { indexAccounts } from "@/lib/ledger/postings";
import { fiscalTotalsLines, ledgerTotalsLines, totalsParams } from "./aggregates";
import { balanceSheet, trialBalance } from "./ledger_math";

// CORE-40 on the server totals (CORE-41): fiscalTotalsLines splits income and expense at the fiscal-year start, so the trial balance and
// balance sheet from totals match the same reports run on every ledger line.

const A = (id, number, accountType) => ({ id, number, name: id, accountType, systemKey: id });
const ACCTS = indexAccounts([
  A("operating_cash", "1000", "Asset"),
  A("accounts_payable", "2000", "Liability"),
  A("retained_earnings", "3900", "Equity"),
  A("rent_income", "4000", "Income"),
  A("repairs_maintenance", "5000", "Expense"),
]);
let n = 0;
const entry = (date, dr, cr, amount) => {
  n += 1;
  return [
    { id: `a${n}`, entryId: `e${n}`, date, glAccountId: dr, debit: amount, credit: 0, propertyId: "p1" },
    { id: `b${n}`, entryId: `e${n}`, date, glAccountId: cr, debit: 0, credit: amount, propertyId: "p1" },
  ];
};
const LINES = [
  ...entry("2025-06-01", "operating_cash", "retained_earnings", 1000),
  ...entry("2025-08-01", "operating_cash", "rent_income", 700),
  ...entry("2025-11-01", "repairs_maintenance", "accounts_payable", 200),
  ...entry("2026-02-01", "operating_cash", "rent_income", 900),
  ...entry("2026-05-10", "repairs_maintenance", "operating_cash", 150),
  ...entry("2026-06-15", "operating_cash", "rent_income", 400),
];

// Lines summed per account × property within [from, to] (either open) → totals rows, as the SQL aggregates return them.
function rows(from, to, period = "") {
  const per = new Map();
  for (const l of LINES) {
    if ((from && l.date < from) || (to && l.date > to)) continue;
    const r = per.get(l.glAccountId) || { period, glAccountId: l.glAccountId, propertyId: "p1", ownerId: "", bankAccountId: "", debit: 0, credit: 0 };
    r.debit += l.debit;
    r.credit += l.credit;
    per.set(l.glAccountId, r);
  }
  return [...per.values()];
}
const dayBefore = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
function totals(from, to, yearStart) {
  return {
    params: totalsParams({ from, to, grain: "range" }),
    accounts: ACCTS,
    opening: rows(null, dayBefore(from)),
    period: rows(from, to, from),
    ...(yearStart ? { fyStartMonth: Number(yearStart.slice(5, 7)), yearStart, yearOpening: rows(null, dayBefore(yearStart)) } : {}),
  };
}
const tbView = (tb) => tb.rows.map((r) => [r.number, r.opening, r.debit, r.credit, r.closing]);

test("trial balance from totals with a fiscal split equals the line-level trial balance", () => {
  const f = { from: "2026-06-01", to: "2026-06-30" };
  const t = totals(f.from, f.to, "2026-01-01");
  const fromTotals = trialBalance(fiscalTotalsLines(t), ACCTS, { ...f, fyStart: 1 });
  const fromLines = trialBalance(LINES, ACCTS, { ...f, fyStart: 1 });
  assert.deepEqual(tbView(fromTotals), tbView(fromLines));
  assert.equal(fromTotals.rows.find((r) => r.number === "3900").opening, 1500);
  assert.equal(fromTotals.rows.find((r) => r.number === "4000").opening, 900);
  assert.equal(fromTotals.balanced, true);
});

test("balance sheet from totals: same split as the lines, also when the range spans the fiscal-year start", () => {
  for (const [from, to, fyStart, yearStart] of [
    ["2026-06-01", "2026-06-30", 1, "2026-01-01"],
    ["2025-12-01", "2026-06-30", 1, "2026-01-01"],
    ["2026-06-01", "2026-06-30", 7, "2025-07-01"],
  ]) {
    const bs = balanceSheet(fiscalTotalsLines(totals(from, to, yearStart)), ACCTS, to, { fyStart });
    const ref = balanceSheet(LINES, ACCTS, to, { fyStart });
    assert.equal(bs.retainedEarnings, ref.retainedEarnings, `${from}..${to} FY${fyStart}`);
    assert.equal(bs.currentYearEarnings, ref.currentYearEarnings, `${from}..${to} FY${fyStart}`);
    assert.equal(bs.totalEquity, ref.totalEquity);
    assert.equal(bs.balanced, true);
  }
  const jan = balanceSheet(fiscalTotalsLines(totals("2026-06-01", "2026-06-30", "2026-01-01")), ACCTS, "2026-06-30", { fyStart: 1 });
  assert.equal(jan.retainedEarnings, 1500, "3900 1,000 + 2025 rent 700 − repairs 200");
  assert.equal(jan.currentYearEarnings, 1150, "2026 rent 1,300 − repairs 150");
});

test("without a fiscal split the totals lines are unchanged", () => {
  const t = totals("2026-06-01", "2026-06-30");
  assert.deepEqual(fiscalTotalsLines(t), ledgerTotalsLines(t));
});
