import { test } from "node:test";
import assert from "node:assert/strict";

import { indexAccounts, normalizeGlAccount } from "@/lib/ledger/postings";
import { createSandboxClient } from "@/lib/sandbox/sandbox_client";
import { runSchedule } from "@/lib/jobs/scheduled_reports";
import { workbookBytes } from "@/lib/export/xlsx";
import { ledgerTotalsLines, referenceTotals, totalsRow, totalsToLines } from "./aggregates";
import { cashBridge, splitCents } from "./cash_basis";
import { getReport, reportSources, runReport } from "./catalog";
import { sectionsCsv } from "./csv";
import { cellText, printLandscape } from "./format";
import { incomeStatement, scopeLines } from "./ledger_math";
import { loadLedgerColumns, loadLedgerTotals } from "./ledger_load";
import { pnlByProperty } from "./portfolio";
import { portfolioScope } from "./scope";
import { sourceParamsOf } from "./source_params";
import { loadServerSources } from "./sources_server";
import { accountRows, budgetColumn, budgetLinesFor, periodColumns, pnlMatrix, priorPeriod, rollupParents, samePeriodLastYear, selectBudgets, withVariance } from "./statements";
import { sectionsSheets } from "./xlsx";

// CORE-44: comparative, 12-month and budget statements over a small in-memory ledger that has every kind of settlement in it.

const PROJECT = "proj-statements";
const [P1, P2, P3] = ["prop-1", "prop-2", "prop-3"];
const PORTFOLIO = "pf-1";
const PROPERTIES = [
  { id: P1, name: "The Marlowe", portfolioId: PORTFOLIO },
  { id: P2, name: "Cascade Lofts", portfolioId: PORTFOLIO },
  { id: P3, name: "Pinecrest", portfolioId: null },
];

const ACCOUNTS = [
  ["trust", "1010", "Trust Cash", "Asset", "cash", "trust_cash", null],
  ["operating", "1000", "Operating Cash", "Asset", "cash", "operating_cash", null],
  ["ar", "1200", "Accounts Receivable", "Asset", "receivable", "accounts_receivable", null],
  ["defar", "1210", "Deferred Receivable", "Asset", "deferred_receivable", "deferred_receivable", null],
  ["hapar", "1220", "Housing Assistance Receivable", "Asset", "subsidy_receivable", "subsidy_receivable", null],
  ["ap", "2000", "Accounts Payable", "Liability", "payable", "accounts_payable", null],
  ["dep", "2100", "Security Deposits Held", "Liability", "deposits", "security_deposits", null],
  ["depint", "2110", "Deposit Interest Payable", "Liability", "deposits", "deposit_interest_payable", "dep"],
  ["equity", "3000", "Owner Equity", "Equity", "equity", "owner_equity", null],
  ["contrib", "3100", "Owner Contributions", "Equity", "contribution", "owner_contributions", "equity"],
  ["obe", "3950", "Opening Balance Equity", "Equity", "equity", "opening_balance_equity", null],
  ["rent", "4000", "Rental Income", "Income", "income", "rent_income", null],
  ["late", "4010", "Late Fee Income", "Income", "income", "late_fee_income", null],
  ["conc", "4050", "Concessions & Credits", "Income", "contra_income", "concessions", null],
  ["parking", "4060", "Parking & Storage Income", "Income", "income", null, "other"],
  ["pet", "4070", "Pet Rent & Fees", "Income", "income", null, "other"],
  ["other", "4100", "Other Income", "Income", "income", "other_income", null],
  ["feeinc", "4500", "Management Fee Income", "Income", "income", "management_fee_income", null],
  ["repairs", "5000", "Repairs & Maintenance", "Expense", "expense", "repairs_maintenance", null],
  ["fees", "5400", "Management Fees", "Expense", "expense", "management_fees", null],
  ["baddebt", "5800", "Bad Debt", "Expense", "expense", "bad_debt", null],
].map(([id, number, name, account_type, subtype, system_key, parent_id]) => ({ id, project_id: PROJECT, number, name, account_type, subtype, system_key, parent_id, is_trust: id === "trust", deleted_at: null, metadata: {} }));
const ACCTS = indexAccounts(ACCOUNTS.map(normalizeGlAccount));

const round = (n) => Math.round(n * 100) / 100;
const MONTHS = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(2025, 10 + i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});

// Fourteen months (Nov 2025 – Dec 2026) on three properties: rent + parking charges paid in part, late fees, a concession, a write-off,
// an NSF return, a void payment, deposits (held, billed through receivables, applied), an unapplied prepayment, a lease transfer paid
// later, a converted opening balance, HAP, cash inside a charge, bills (some paid, one credited), fees and a company expense.
function buildLedger() {
  const entries = [];
  const lines = [];
  let n = 0;
  const post = (date, type, prop, rows, meta = {}, extra = {}) => {
    const id = `e${String(n++).padStart(4, "0")}`;
    const created = `${date}T00:00:00Z`;
    entries.push({ id, project_id: PROJECT, entry_date: date, source_type: type, status: "posted", property_id: prop, metadata: meta, deleted_at: null, created_at: created, ...extra });
    rows.forEach(([acct, debit, credit, more = {}], i) => {
      lines.push({ id: `${id}-${i}`, project_id: PROJECT, entry_id: id, entry_date: date, line_no: i, gl_account_id: acct, debit: round(debit), credit: round(credit), property_id: prop, owner_id: null, bank_account_id: null, applies_to_entry_id: null, metadata: {}, deleted_at: null, created_at: created, ...more });
    });
    return id;
  };
  const charges = {};
  const bills = {};
  [P1, P2, P3].forEach((prop, i) => post("2025-10-31", "adjustment", prop, [["trust", 5000, 0], ["equity", 0, 5000]]));
  const conv = post("2025-10-31", "charge", P1, [["ar", 400, 0], ["obe", 0, 400]], { conversion: true, chargeGl: "rent" });
  post("2025-11-10", "payment", P1, [["trust", 400, 0], ["ar", 0, 400, { applies_to_entry_id: conv }]]);
  MONTHS.forEach((mk, mi) => {
    const m = mi + 1;
    const day = (d) => `${mk}-${String(d).padStart(2, "0")}`;
    [P1, P2, P3].forEach((prop, i) => {
      const rent = 1000 + 250 * i + 7.31 * m;
      const parking = i < 2 ? 33.33 : 0;
      const charge = post(day(1), "charge", prop, [["ar", rent + parking, 0], ["rent", 0, rent], ...(parking ? [["parking", 0, parking]] : [])]);
      charges[`${prop}:${m}`] = charge;
      const pay = round(rent + parking - 13.17 * i);
      if (!(prop === P3 && m === 11)) post(day(5), "payment", prop, [["trust", pay, 0], ["ar", 0, pay, { applies_to_entry_id: charge }]]);
      const bill = post(day(9), "bill", prop, [["repairs", 120.45 + i * m, 0], ["ap", 0, 120.45 + i * m]]);
      bills[`${prop}:${m}`] = bill;
      if (m % 2) post(day(20), "bill_payment", prop, [["ap", 120.45 + i * m, 0, { applies_to_entry_id: bill }], ["trust", 0, 120.45 + i * m]]);
      const fee = round(rent * 0.08);
      post(day(28), "management_fee", prop, [["fees", fee, 0], ["trust", 0, fee], ["operating", fee, 0, { metadata: { side: "manager" } }], ["feeinc", 0, fee, { metadata: { side: "manager" } }]]);
    });
  });
  const ch = (prop, m) => charges[`${prop}:${m}`];
  const lateFee = post("2026-01-12", "late_fee", P3, [["ar", 50, 0], ["late", 0, 50]]);
  post("2026-02-03", "payment", P3, [["trust", 50, 0], ["ar", 0, 50, { applies_to_entry_id: lateFee }]]);
  post("2025-12-15", "credit", P2, [["conc", 100, 0], ["ar", 0, 100, { applies_to_entry_id: ch(P2, 2) }]]);
  post("2026-03-31", "adjustment", P3, [["baddebt", 40, 0], ["ar", 0, 40, { applies_to_entry_id: ch(P3, 5) }]]);
  post("2026-04-18", "payment", P1, [["ar", 1043.86 + 33.33, 0, { applies_to_entry_id: ch(P1, 6) }], ["trust", 0, 1043.86 + 33.33]], { nsf: true });
  post("2025-11-02", "deposit_held", P1, [["trust", 1500, 0], ["dep", 0, 1500]]);
  const depCharge = post("2025-11-01", "adjustment", P2, [["ar", 1200, 0], ["dep", 0, 1200]], { depositId: "d2" });
  post("2025-11-03", "payment", P2, [["trust", 1200, 0], ["ar", 0, 1200, { applies_to_entry_id: depCharge }]]);
  post("2026-06-30", "adjustment", P3, [["dep", 20, 0], ["ar", 0, 20, { applies_to_entry_id: ch(P3, 7) }]]);
  post("2026-07-07", "payment", P1, [["trust", 300, 0], ["ar", 0, 300, { memo: "Unapplied credit" }]]);
  const transfer = post("2026-08-30", "adjustment", P2, [
    ["ar", 13.17, 0, { metadata: { transferredFrom: "lease-old", transferredEntryId: ch(P2, 10) } }],
    ["ar", 0, 13.17, { applies_to_entry_id: ch(P2, 10) }],
  ], { transfer: true });
  post("2026-09-04", "payment", P2, [["trust", 13.17, 0], ["ar", 0, 13.17, { applies_to_entry_id: transfer }]]);
  const voided = post("2026-09-05", "payment", P3, [["trust", 900, 0], ["ar", 0, 900, { applies_to_entry_id: ch(P3, 11) }]], {}, { status: "void" });
  post("2026-09-08", "payment", P3, [["ar", 900, 0, { applies_to_entry_id: ch(P3, 11) }], ["trust", 0, 900]], {}, { reversal_of: voided });
  const hap = post("2025-12-01", "charge", P3, [["hapar", 800, 0], ["rent", 0, 800]]);
  post("2026-01-06", "payment", P3, [["trust", 800, 0], ["hapar", 0, 800, { applies_to_entry_id: hap }]]);
  post("2026-11-01", "charge", P2, [["ar", 60, 0], ["trust", 40, 0], ["pet", 0, 100]]);
  post("2026-02-14", "bill", P1, [["ap", 20, 0, { applies_to_entry_id: bills[`${P1}:4`] }], ["repairs", 0, 20]]);
  post("2026-01-20", "adjustment", P1, [["trust", 25, 0], ["other", 0, 25]]);
  post("2025-12-10", "contribution", P1, [["trust", 1000, 0], ["contrib", 0, 1000]]);
  post("2026-03-15", "adjustment", null, [["repairs", 75, 0], ["operating", 0, 75]]);
  // A payment plan (CORE-14): a charge deferred to 1210, one installment billed back to AR and paid.
  const plan = { metadata: { paymentPlanId: "plan-1" } };
  const planned = post("2026-05-02", "charge", P1, [["ar", 220, 0], ["rent", 0, 200], ["parking", 0, 20]]);
  post("2026-05-03", "payment_plan", P1, [["defar", 220, 0, plan], ["ar", 0, 220, { ...plan, applies_to_entry_id: planned }]]);
  const installment = post("2026-06-02", "charge", P1, [["ar", 110, 0, plan], ["defar", 0, 110, plan]]);
  post("2026-06-04", "payment", P1, [["trust", 110, 0], ["ar", 0, 110, { applies_to_entry_id: installment }]]);
  return { entries, lines, charges };
}

const DB = buildLedger();

const BUDGETS = [
  { id: "b1", name: "Marlowe 2026", property_id: P1, year: 2026, status: "Approved", updated_at: "2026-01-02T00:00:00Z" },
  { id: "b2", name: "Marlowe 2026 draft", property_id: P1, year: 2026, status: "Draft", updated_at: "2026-02-02T00:00:00Z" },
  { id: "b3", name: "Cascade 2026", property_id: P2, year: 2026, status: "Draft", updated_at: "2026-01-05T00:00:00Z" },
  { id: "b4", name: "Company 2026", property_id: null, year: 2026, status: "Approved", updated_at: "2026-01-05T00:00:00Z" },
  { id: "b5", name: "Marlowe 2025", property_id: P1, year: 2025, status: "Archived", updated_at: "2025-12-31T00:00:00Z" },
];
const BUDGET_LINES = BUDGETS.flatMap((b, bi) =>
  ["rent", "repairs"].flatMap((acct, ai) =>
    Array.from({ length: 12 }, (_, i) => ({ id: `${b.id}-${acct}-${i + 1}`, budget_id: b.id, property_id: b.property_id, gl_account_id: acct, year: b.year, month: i + 1, amount: round((ai ? 150 : 1100) + bi * 10 + i * 1.11) })),
  ),
);

let seeded = null;
const sandbox = () => (seeded ||= seed());
async function seed() {
  const sb = createSandboxClient(() => null);
  const rows = {
    gl_accounts: ACCOUNTS,
    ledger_entries: DB.entries,
    ledger_lines: DB.lines,
    portfolios: [{ id: PORTFOLIO, project_id: PROJECT, name: "Downtown", status: "Active", metadata: {}, deleted_at: null, created_at: "2026-01-01T00:00:00Z" }],
    properties: PROPERTIES.map((p, i) => ({ id: p.id, project_id: PROJECT, name: p.name, portfolio_id: p.portfolioId, status: "Active", metadata: {}, deleted_at: null, created_at: `2026-01-0${i + 1}T00:00:00Z` })),
    budgets: BUDGETS.map((b) => ({ ...b, project_id: PROJECT, metadata: {}, deleted_at: null, created_at: b.updated_at })),
    budget_lines: BUDGET_LINES.map((l) => ({ ...l, project_id: PROJECT, account_label: "", metadata: {}, deleted_at: null, created_at: "2026-01-01T00:00:00Z" })),
  };
  for (const [table, list] of Object.entries(rows)) {
    const { error } = await sb.from(table).insert(list.map((r) => ({ ...r })));
    assert.equal(error, null, table);
  }
  return sb;
}

const cents = (n) => Math.round((Number(n) || 0) * 100);
const near = (a, b, msg) => assert.equal(cents(a), cents(b), `${msg}: ${a} vs ${b}`);
const YEAR = { preset: "custom", from: "2026-01-01", to: "2026-12-31" };

// The screen / scheduled-job path: the definition's sources with its params, then runReport.
async function run(key, filters) {
  const sb = await sandbox();
  const def = getReport(key);
  const f = { propertyId: "all", basis: "accrual", budgetId: "auto", ...filters };
  const data = await loadServerSources(sb, PROJECT, reportSources(def), new Map(), sourceParamsOf(def, f, PROPERTIES));
  return { result: runReport(def, data, f), data, f };
}
const section = (r, key) => r.sections.find((s) => s.key === key);
// Amount per account id of a statement section's account rows, under a column key.
const byAccount = (s, key) => Object.fromEntries(accountRows(s.rows).filter((r) => !r.muted).map((r) => [r.id, r[key]]));

test("statements: period columns for months, comparisons and as-of dates", () => {
  const months = periodColumns({ from: "2026-03-17", to: "2026-08-09", mode: "months" });
  assert.deepEqual(months.map((c) => [c.from, c.to]), [["2026-03-17", "2026-03-31"], ["2026-04-01", "2026-04-30"], ["2026-05-01", "2026-05-31"], ["2026-06-01", "2026-06-30"], ["2026-07-01", "2026-07-31"], ["2026-08-01", "2026-08-09"]]);
  assert.equal(periodColumns({ from: "2024-01-01", to: "2026-12-31", mode: "months" }).length, 24, "at most 24 month columns");
  assert.deepEqual(priorPeriod("2026-10-01", "2026-12-31"), { from: "2026-07-01", to: "2026-09-30" });
  assert.deepEqual(priorPeriod("2026-03-17", "2026-03-26"), { from: "2026-03-07", to: "2026-03-16" });
  assert.deepEqual(samePeriodLastYear("2024-02-01", "2024-02-29"), { from: "2023-02-01", to: "2023-02-28" });
  assert.deepEqual(samePeriodLastYear("2024-02-29", "2024-03-10"), { from: "2023-02-28", to: "2023-03-10" });
  const cmp = periodColumns({ from: "2026-11-01", to: "2026-11-30", mode: "compare" });
  assert.deepEqual(cmp.map((c) => [c.key, c.label, c.from, c.to]), [["current", "Nov 2026", "2026-11-01", "2026-11-30"], ["prior", "Oct 2026", "2026-10-01", "2026-10-31"], ["last_year", "Nov 2025", "2025-11-01", "2025-11-30"]]);
  const asOf = periodColumns({ to: "2026-11-08", mode: "asOf" });
  assert.deepEqual(asOf.map((c) => [c.from, c.to]), [[null, "2026-11-08"], [null, "2026-10-31"], [null, "2025-12-31"]]);
  assert.equal(periodColumns({ to: "2026-08-15", mode: "asOf", fiscalStartMonth: 7 })[2].to, "2026-06-30", "the fiscal year-end follows the start month");
});

test("statements: the 12-month P&L's month columns add up to the range P&L for every account (accrual and cash)", async () => {
  const sb = await sandbox();
  for (const basis of ["accrual", "cash"]) {
    for (const propertyId of ["all", P2, portfolioScope(PORTFOLIO)]) {
      const { result } = await run("financial_statements", { ...YEAR, view: "pnl_months", basis, propertyId });
      const ids = propertyId === "all" ? null : propertyId === P2 ? [P2] : [P1, P2];
      const range = await loadLedgerTotals(sb, PROJECT, { ...YEAR, grain: "range", propertyIds: ids, basis });
      const pl = incomeStatement(scopeLines(totalsToLines(range.period), { propertyIds: ids }), range.accounts, YEAR);
      for (const key of ["income", "expenses"]) {
        const s = section(result, key);
        assert.equal(s.columns.length, 14, "account + 12 months + total");
        const want = Object.fromEntries((key === "income" ? pl.income : pl.expenses).map((r) => [r.id, r.amount]));
        for (const r of accountRows(s.rows)) {
          const months = s.columns.slice(1, 13).reduce((t, c) => t + cents(r[c.key]), 0);
          assert.equal(months, cents(r.total), `${basis} ${propertyId} ${r.label}: months add up to the total`);
          assert.equal(cents(r.total), cents(want[r.id] || 0), `${basis} ${propertyId} ${r.label}: total = range P&L`);
        }
      }
      near(section(result, "net").totals.total, pl.net, `${basis} ${propertyId} net`);
    }
  }
});

test("statements: a period compared with itself shows zero variance, and each comparison column is that period's P&L", async () => {
  const rows = [{ id: "a", label: "A", accountType: "Income", x: 10.5 }, { id: "b", label: "B", accountType: "Expense", x: -3 }, { id: "h", label: "H", heading: true }];
  for (const r of withVariance(rows, "x", "x", { key: "v" }).filter((x) => !x.heading)) assert.deepEqual([r.v, r.vPct], [0, 0]);
  const { result, f } = await run("financial_statements", { preset: "custom", from: "2026-11-01", to: "2026-11-30", view: "pnl_compare" });
  const income = section(result, "income");
  assert.deepEqual(income.columns.map((c) => c.header), ["Account", "Nov 2026", "Oct 2026", "vs prior $", "vs prior %", "Nov 2025", "vs last year $", "vs last year %"]);
  for (const r of [...accountRows(income.rows), income.totals]) near(r.vs_prior, r.current - r.prior, `${r.label} change`);
  for (const [key, from, to] of [["current", "2026-11-01", "2026-11-30"], ["prior", "2026-10-01", "2026-10-31"], ["last_year", "2025-11-01", "2025-11-30"]]) {
    const { result: single } = await run("financial_statements", { preset: "custom", from, to, view: "pnl" });
    const want = byAccount(section(single, "income"), "amount");
    for (const [id, amount] of Object.entries(byAccount(income, key))) near(amount, want[id] || 0, `${key} ${id}`);
    near(section(result, "net").totals[key], section(single, "net").totals.amount, `${key} net`);
  }
  assert.equal(f.view, "pnl_compare");
  // The same columns compared with themselves through the loader: zero everywhere.
  const sb = await sandbox();
  const cols = await loadLedgerColumns(sb, PROJECT, { columns: [{ key: "a", from: "2026-01-01", to: "2026-06-30" }, { key: "b", from: "2026-01-01", to: "2026-06-30" }] });
  const m = pnlMatrix(new Map(cols.columns.map((c) => [c.key, totalsToLines(c.period)])), cols.accounts, cols.columns);
  for (const r of withVariance([...m.income, ...m.expenses], "a", "b", { key: "v" })) assert.equal(r.v, 0, r.label);
});

test("statements: every balance-sheet comparison column balances and equals that day's balance sheet", async () => {
  for (const to of ["2026-11-08", "2026-06-30", "2026-01-15"]) {
    const { result } = await run("financial_statements", { preset: "custom", from: to, to, view: "balance_compare" });
    const check = section(result, "check");
    for (const key of ["asof", "month_end", "year_end"]) near(check.totals[key], 0, `${to} ${key} balanced`);
    assert.equal(result.stats.find((s) => s.label === "Check").value, "Balanced");
    const monthEnd = section(result, "assets").columns[2];
    const { result: single } = await run("financial_statements", { preset: "custom", from: to, to, view: "balance" });
    near(section(result, "assets").totals.asof, section(single, "assets").totals.amount, `${to} assets`);
    near(section(result, "equity").totals.asof, section(single, "equity").totals.amount, `${to} equity`);
    assert.ok(monthEnd.header.includes(", 20"), "the prior month-end is a dated column");
  }
});

test("statements: the budget column is Σ budget_lines.amount for the months in range; Approved wins over Draft", async () => {
  const sb = await sandbox();
  const { result } = await run("financial_statements", { preset: "custom", from: "2026-03-17", to: "2026-05-31", view: "pnl_budget" });
  const months = new Set(["2026-03", "2026-04", "2026-05"]);
  const chosen = ["b1", "b3", "b4"];
  const want = BUDGET_LINES.filter((l) => chosen.includes(l.budget_id) && months.has(`${l.year}-${String(l.month).padStart(2, "0")}`)).reduce((s, l) => s + cents(l.amount), 0);
  const got = cents(section(result, "income").totals.budget) + cents(section(result, "expenses").totals.budget);
  assert.equal(got, want, "income + expense budget = Σ amount of the chosen budgets' lines in Mar–May");
  assert.deepEqual(selectBudgets(BUDGETS.map((b) => ({ ...b, propertyId: b.property_id || "", updatedAt: b.updated_at })), {}).map((b) => b.id).sort(), ["b1", "b3", "b4", "b5"]);
  const src = (await loadServerSources(sb, PROJECT, ["budgets"], new Map(), { budgets: { from: "2026-01-01", to: "2026-12-31" } })).budgets;
  assert.deepEqual(budgetLinesFor(src, { propertyIds: [P1] }).every((l) => l.budgetId === "b1"), true, "one budget per property and year");
  assert.equal(budgetLinesFor(src, { budgetId: "b2" }).length, 24, "a picked budget is used as is");
  const col = budgetColumn(budgetLinesFor(src, { propertyIds: [P2] }), ACCTS, { from: "2026-01-01", to: "2026-01-31" });
  assert.equal(col.total, round(1100 + 20 + 150 + 20), "January of Cascade's budget");
  for (const r of accountRows(section(result, "income").rows)) near(r.variance, r.actual - r.budget, `${r.label} income variance is favourable when above budget`);
  for (const r of accountRows(section(result, "expenses").rows)) near(r.variance, r.budget - r.actual, `${r.label} expense variance is favourable when below budget`);
  const bva = await run("budget_vs_actual", { preset: "custom", from: "2026-01-01", to: "2026-06-30", propertyId: P1 });
  near(section(bva.result, "expenses").totals.annual, BUDGET_LINES.filter((l) => l.budget_id === "b1" && l.gl_account_id === "repairs").reduce((s, l) => s + l.amount, 0), "full-year budget");
  const byMonth = section(bva.result, "by_month");
  assert.equal(byMonth.rows.length, 6);
  near(byMonth.totals.budgetNet, section(bva.result, "net").totals.budget, "by-month budget adds up");
  near(byMonth.totals.actualNet, section(bva.result, "net").totals.actual, "by-month actual adds up");
  const none = await run("budget_vs_actual", { preset: "custom", from: "2027-01-01", to: "2027-03-31" });
  assert.equal(none.result.empty.title, "No budget for this range");
});

test("statements: parent subtotals equal the sum of their children, headings carry no amounts", async () => {
  const rows = [
    { id: "parking", account: ACCTS.byId.get("parking"), label: "", accountType: "Income", a: 10, b: 1 },
    { id: "pet", account: ACCTS.byId.get("pet"), label: "", accountType: "Income", a: 5, b: 2 },
    { id: "other", account: ACCTS.byId.get("other"), label: "", accountType: "Income", a: 1.5, b: 0 },
    { id: "rent", account: ACCTS.byId.get("rent"), label: "", accountType: "Income", a: 100, b: 90 },
  ];
  const out = rollupParents(rows, ACCTS, ["a", "b"]);
  assert.deepEqual(out.map((r) => [r.label, r.depth]), [
    ["4000 · Rental Income", 0],
    ["4100 · Other Income", 0],
    ["4100 · Other Income (direct)", 1],
    ["4060 · Parking & Storage Income", 1],
    ["4070 · Pet Rent & Fees", 1],
    ["Total 4100 · Other Income", 0],
  ]);
  const sub = out.find((r) => r.subtotal);
  assert.deepEqual([sub.a, sub.b], [16.5, 3]);
  const heading = out.find((r) => r.heading);
  assert.equal(cellText({ key: "a", format: "money" }, heading), "", "a heading prints blank");
  // On the report: every subtotal equals the account rows under it, and the section total counts each account once.
  const { result } = await run("financial_statements", { ...YEAR, view: "pnl_months" });
  const income = section(result, "income");
  const total = income.rows.find((r) => r.subtotal);
  const kids = income.rows.filter((r) => ["parking", "pet", "other"].includes(r.id));
  assert.ok(kids.length >= 2 && total);
  for (const c of income.columns.slice(1)) near(total[c.key], kids.reduce((s, r) => s + (r[c.key] || 0), 0), `subtotal ${c.header}`);
  for (const c of income.columns.slice(1)) near(income.totals[c.key], accountRows(income.rows).reduce((s, r) => s + (r[c.key] || 0), 0), `total ${c.header}`);
  const { result: bs } = await run("financial_statements", { preset: "custom", from: "2026-11-08", to: "2026-11-08", view: "balance" });
  const eq = section(bs, "equity");
  const eqSub = eq.rows.find((r) => r.subtotal);
  near(eqSub.amount, eq.rows.filter((r) => ["equity", "contrib"].includes(r.id)).reduce((s, r) => s + r.amount, 0), "equity subtotal");
});

test("statements: property comparison columns sum to the portfolio total (CORE-43)", async () => {
  const sb = await sandbox();
  const { result } = await run("financial_statements", { ...YEAR, view: "property_compare", propertyId: portfolioScope(PORTFOLIO) });
  const income = section(result, "income");
  assert.deepEqual(income.columns.map((c) => c.header), ["Account", "Cascade Lofts", "The Marlowe", "Total"]);
  for (const r of [...accountRows(income.rows), income.totals]) near(r.p0 + r.p1, r.total, `${r.label} columns sum to the total`);
  const totals = await loadLedgerTotals(sb, PROJECT, { ...YEAR, grain: "range", propertyIds: [P1, P2] });
  const portfolio = pnlByProperty(scopeLines(ledgerTotalsLines(totals), { propertyIds: [P1, P2] }), totals.accounts, YEAR, [P1, P2]).total;
  near(section(result, "net").totals.total, portfolio.net, "total = CORE-43 portfolio P&L");
  const { result: all } = await run("financial_statements", { ...YEAR, view: "property_compare" });
  const net = section(all, "net");
  assert.equal(net.columns[net.columns.length - 2].header, "No property", "lines without a property get their own column");
  const { result: plain } = await run("financial_statements", { ...YEAR, view: "pnl" });
  near(net.totals.total, section(plain, "net").totals.amount, "all-properties total = the P&L");
});

test("cash basis: whole-cent settlement splits, and what counts as income", () => {
  const split = splitCents(1000, [{ lineId: "a", acct: "rent", aC: 2000 }, { lineId: "b", acct: "parking", aC: 1000 }]);
  assert.deepEqual(split.map((p) => p.rC), [667, 333]);
  assert.equal(splitCents(-101, [{ lineId: "a", aC: -50 }, { lineId: "b", aC: -50 }]).reduce((s, p) => s + p.rC, 0), -101);
  assert.equal(splitCents(5, [{ lineId: "a", aC: 10 }, { lineId: "b", aC: -10 }]), null, "a target netting to zero can't take a settlement");
  const rows = (from, to, props = null) => referenceTotals({ ...DB, accounts: ACCOUNTS }, "ledger_cash_basis_totals", { p_project_id: PROJECT, p_from: from, p_to: to, p_grain: "range", p_property_ids: props }).data.map(totalsRow);
  const sumOn = (rs, acct) => round(rs.filter((r) => r.glAccountId === acct).reduce((s, r) => s + r.credit - r.debit, 0));
  const all = rows(null, null);
  assert.equal(sumOn(all, "conc"), 0, "a concession is never cash");
  assert.equal(sumOn(all, "baddebt"), 0, "a write-off is never cash");
  assert.equal(sumOn(rows("2026-01-12", "2026-01-31", [P3]), "late"), 0, "a late fee counts when paid…");
  assert.equal(sumOn(rows("2026-02-01", "2026-02-28", [P3]), "late"), 50, "…in the month it's paid");
  const conv = rows("2025-11-10", "2025-11-10", [P1]);
  assert.equal(sumOn(conv, "rent"), 400, "a converted opening balance is collected into its charge account");
  const transfer = rows("2026-09-04", "2026-09-04", [P2]);
  assert.equal(round(sumOn(transfer, "rent") + sumOn(transfer, "parking")), 13.17, "a payment on a transferred balance reaches the original charge");
  assert.ok(sumOn(transfer, "parking") > 0, "…split over its rent and parking");
  assert.equal(sumOn(rows("2026-11-01", "2026-11-01", [P2]), "pet"), 40, "cash inside a charge counts on the charge date");
  assert.equal(sumOn(rows("2026-01-06", "2026-01-06", [P3]), "rent"), 800, "HAP counts when the housing authority pays");
  assert.equal(sumOn(rows("2026-09-01", "2026-09-30", [P3]), "rent"), 0, "a void payment and its reversal net out");
  const nsf = rows("2026-04-18", "2026-04-18", [P1]);
  assert.equal(round(sumOn(nsf, "rent") + sumOn(nsf, "parking")), round(-(1043.86 + 33.33)), "an NSF return takes the income back");
  const outside = (rs) => round(rs.filter((r) => ["ar", "ap", "hapar", "defar"].includes(r.glAccountId)).reduce((s, r) => s + r.debit - r.credit, 0));
  assert.equal(outside(rows("2026-07-07", "2026-07-07", [P1])), -300, "an unapplied prepayment stays outside income");
  assert.equal(outside(rows("2025-11-01", "2025-11-03", [P2])), 0, "a deposit billed through receivables and paid nets outside income");
  assert.equal(sumOn(rows("2026-06-30", "2026-06-30", [P3]), "rent"), 20, "a deposit applied to rent is income");
  const deferral = rows("2026-05-02", "2026-05-03", [P1]);
  assert.deepEqual([sumOn(deferral, "rent"), outside(deferral)], [0, 0], "deferring a charge to a payment plan is neither income nor outside");
  const paid = rows("2026-06-04", "2026-06-04", [P1]);
  assert.deepEqual([sumOn(paid, "rent"), sumOn(paid, "parking")], [100, 10], "a paid installment counts against the charges its plan deferred");
});

test("cash basis: net income reconciles to accrual through the receivable and payable movement", async () => {
  const sb = await sandbox();
  for (const [from, to] of [["2025-11-01", "2026-12-31"], ["2026-01-01", "2026-06-30"], ["2026-03-17", "2026-08-09"], ["2025-10-01", "2025-11-30"]]) {
    for (const props of [null, [P1], [P2, P3]]) {
      const t = await loadLedgerTotals(sb, PROJECT, { from, to, grain: "range", propertyIds: props, basis: "cash" });
      const cashNet = incomeStatement(totalsToLines(t.period), t.accounts, { from, to }).net;
      const accrualNet = incomeStatement(totalsToLines(t.accrual), t.accounts, { from, to }).net;
      const bridge = cashBridge({ accrualNet, accrualRows: t.accrual, cashRows: t.period, accounts: t.accounts });
      near(bridge.cashNet, cashNet, `${from}..${to} ${props}: accrual − Δ receivables + Δ payables + outside = cash`);
    }
  }
  const { result } = await run("financial_statements", { ...YEAR, view: "pnl", basis: "cash" });
  const bridge = section(result, "bridge");
  near(bridge.totals.amount, section(result, "net").totals.amount, "the bridge ends at the cash-basis net income");
  assert.equal(result.subtitle, "Cash basis");
  const months = await run("financial_statements", { ...YEAR, view: "pnl_months", basis: "cash" });
  const mb = section(months.result, "bridge");
  for (const c of mb.columns.slice(1)) near(mb.totals[c.key], section(months.result, "net").totals[c.key], `bridge ${c.header}`);
});

test("statements: 12-month cash flow runs month to month and totals to the range cash flow", async () => {
  const { result } = await run("financial_statements", { ...YEAR, view: "cash_months" });
  const s = section(result, "cash_months");
  const rows = Object.fromEntries(s.rows.map((r) => [r.id, r]));
  const keys = s.columns.slice(1, 13).map((c) => c.key);
  keys.forEach((k, i) => {
    near(rows.opening[k] + rows.net[k], s.totals[k], `${k} opening + net = closing`);
    if (i) near(rows.opening[k], s.totals[keys[i - 1]], `${k} opens at the prior close`);
  });
  const { result: single } = await run("financial_statements", { ...YEAR, view: "cash" });
  near(s.totals.total, Number(single.stats.find((x) => x.label === "Closing cash").value.replace(/[$,]/g, "")), "closing cash = the range cash flow");
});

test("statements: 14-column output exports to CSV and Excel, prints landscape, and schedules", async () => {
  const { result } = await run("financial_statements", { ...YEAR, view: "pnl_months" });
  const income = section(result, "income");
  const csv = sectionsCsv([income]).split("\r\n");
  assert.equal(csv[0].split(",").length, 14);
  assert.match(csv[0], /^Account,Jan 2026,Feb 2026,.*,Dec 2026,Total$/);
  const rent = csv.find((l) => l.startsWith("4000 · Rental Income"));
  assert.equal(rent.split(",").length, 14);
  assert.equal(rent.split(",")[13], income.rows.find((r) => r.id === "rent").total.toFixed(2));
  const heading = csv.find((l) => l.startsWith("4100 · Other Income,"));
  assert.equal(heading, `4100 · Other Income${",".repeat(13)}`, "a heading row exports blank amounts");
  const [sheet] = sectionsSheets([income]);
  assert.equal(sheet.columns.length, 14);
  const bytes = workbookBytes([sheet]);
  assert.ok(bytes.length > 0);
  assert.equal(printLandscape(result.sections), true, "more than six columns print landscape");
  const { result: plain } = await run("financial_statements", { ...YEAR, view: "pnl" });
  assert.equal(printLandscape(plain.sections), false);
  const sb = await sandbox();
  const sent = [];
  const schedule = { id: "s44", project_id: PROJECT, name: "12-month P&L", report_key: "financial_statements", filters: { preset: "last_year", view: "pnl_months" }, recipients: ["owner@example.com"] };
  const out = await runSchedule(sb, schedule, { now: new Date("2027-02-01T12:00:00Z"), cache: new Map(), send: async (msg) => (sent.push(msg), { ok: true }) });
  assert.equal(out.status, "sent");
  assert.equal(sent[0].data.reportTitle, "Financial Statements · 12-Month P&L");
});
