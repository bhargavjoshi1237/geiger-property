import { test } from "node:test";
import assert from "node:assert/strict";
import { indexAccounts } from "@/lib/ledger/postings";
import { balanceSheet, trialBalance } from "./ledger_math";

// CORE-40 virtual close: the balance sheet splits retained earnings (3900 + income − expense before the fiscal year) from current year earnings,
// and the trial balance opens income and expense at the fiscal-year start with earlier years on retained earnings.

const A = (id, number, accountType, extra = {}) => ({ id, number, name: id, accountType, systemKey: id, ...extra });
const CHART = [
  A("operating_cash", "1000", "Asset", { subtype: "cash" }),
  A("accounts_receivable", "1200", "Asset", { subtype: "receivable" }),
  A("accounts_payable", "2000", "Liability", { subtype: "payable" }),
  A("rent_income", "4000", "Income"),
  A("repairs_maintenance", "5000", "Expense"),
];
const RETAINED = A("retained_earnings", "3900", "Equity", { subtype: "equity" });

let n = 0;
const entry = (date, debitId, creditId, amount) => {
  n += 1;
  return [
    { id: `l${n}a`, entryId: `e${n}`, date, glAccountId: debitId, debit: amount, credit: 0 },
    { id: `l${n}b`, entryId: `e${n}`, date, glAccountId: creditId, debit: 0, credit: amount },
  ];
};

const LINES = [
  ...entry("2026-03-01", "operating_cash", "retained_earnings", 10000),
  ...entry("2026-04-01", "operating_cash", "rent_income", 5000),
  ...entry("2026-09-01", "repairs_maintenance", "operating_cash", 2000),
  ...entry("2027-02-01", "accounts_receivable", "rent_income", 3000),
  ...entry("2027-05-01", "repairs_maintenance", "accounts_payable", 500),
  ...entry("2027-07-01", "accounts_receivable", "rent_income", 999),
];
const WITHOUT_RE = LINES.filter((l) => l.entryId !== "e1" || l.glAccountId === "operating_cash").map((l) => (l.entryId === "e1" ? { ...l, glAccountId: "operating_cash", debit: 0, credit: 0 } : l));
const row = (bs, id) => bs.equity.find((r) => r.id === id)?.amount ?? 0;

test("AC5 FY January at 2027-06-30: retained = 3900 + Σ(I−E) before 2027-01-01, current year = Σ(I−E) Jan–Jun, and it balances", () => {
  const bs = balanceSheet(LINES, indexAccounts([...CHART, RETAINED]), "2027-06-30", { fyStart: 1 });
  assert.equal(row(bs, "retained_earnings"), 13000);
  assert.equal(row(bs, "earnings"), 2500);
  assert.equal(bs.equity.find((r) => r.id === "retained_earnings").label, "Retained earnings (prior years)");
  assert.equal(bs.equity.find((r) => r.id === "earnings").label, "Current year earnings");
  assert.equal(bs.equity.some((r) => r.account?.systemKey === "retained_earnings"), false, "3900 folds into the retained row");
  assert.equal(bs.totalAssets, 16000);
  assert.equal(bs.totalLiabilities, 500);
  assert.equal(bs.totalEquity, 15500);
  assert.equal(bs.balanced, true);
  assert.equal(bs.retainedEarnings, 13000);
  assert.equal(bs.currentYearEarnings, 2500);
});

test("a July fiscal year moves the split; no retained-earnings account still balances", () => {
  const bs = balanceSheet(LINES, indexAccounts([...CHART, RETAINED]), "2027-06-30", { fyStart: 7 });
  assert.equal(bs.fiscalYearStart, "2026-07-01");
  assert.equal(row(bs, "retained_earnings"), 15000, "3900 + April 2026 rent");
  assert.equal(row(bs, "earnings"), 500, "Sept repairs, Feb rent, May repairs");
  assert.equal(bs.balanced, true);
  const bare = balanceSheet(WITHOUT_RE, indexAccounts(CHART), "2027-06-30", { fyStart: 1 });
  assert.equal(row(bare, "retained_earnings"), 3000);
  assert.equal(bare.balanced, true);
});

test("without fyStart the balance sheet keeps all-time current earnings", () => {
  const bs = balanceSheet(LINES, indexAccounts([...CHART, RETAINED]), "2027-06-30");
  assert.equal(row(bs, "earnings"), 5500);
  assert.equal(bs.equity.some((r) => r.id === "retained_earnings"), true, "the 3900 account shows as its own row");
  assert.equal(bs.balanced, true);
});

test("trial balance with fyStart: income and expense open at the fiscal-year start; prior years sit on retained earnings; balanced", () => {
  const acct = indexAccounts([...CHART, RETAINED]);
  const tb = trialBalance(LINES, acct, { from: "2027-04-01", to: "2027-06-30", fyStart: 1 });
  const by = Object.fromEntries(tb.rows.map((r) => [r.number, r]));
  assert.equal(by["3900"].opening, 13000);
  assert.equal(by["4000"].opening, 3000, "only 2027's rent opens on income");
  assert.equal(by["5000"].debit, 500);
  assert.equal(by["5000"].opening, 0);
  assert.equal(tb.balanced, true);
  const plain = trialBalance(LINES, acct, { from: "2027-04-01", to: "2027-06-30" });
  assert.equal(Object.fromEntries(plain.rows.map((r) => [r.number, r]))["4000"].opening, 8000);
  assert.equal(plain.balanced, true);
  assert.equal(tb.totals.closingDr, plain.totals.closingDr - 2000, "prior-year repairs net into retained earnings");
  const virtual = trialBalance(WITHOUT_RE, indexAccounts(CHART), { from: "2027-01-01", to: "2027-06-30", fyStart: 1 });
  assert.equal(virtual.rows.find((r) => r.number === "3900")?.opening, 3000, "a virtual 3900 row carries prior years");
  assert.equal(virtual.balanced, true);
});
