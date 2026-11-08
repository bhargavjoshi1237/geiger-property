import { accountLabel } from "@/lib/ledger/postings";
import { ownershipIndex } from "@/lib/ledger/ownership";
import { money, pctLabel, round2 } from "./format";
import {
  AP_BUCKETS,
  balanceSheet,
  bankReconciliationView,
  cashRegister,
  depositLeaseRows,
  glDetail,
  incomeByProperty,
  incomeStatement,
  isTrustBank,
  managementFeePostings,
  payableAging,
  scopeLines,
  sourceLabel,
  threeWayTrust,
  trialBalance,
  trustPositions,
  vendorPayments,
} from "./ledger_math";
import { DEPOSIT_MATCH_MAP, FILING_STATUS_MAP, LEDGER_STATUS_MAP, TRUST_EXCEPTION_MAP, TRUST_STATUS_MAP } from "./maps";
import { dayOf, formatIso, monthName, parseIso } from "./periods";
import { byId, list, nameMaps, optionsFrom, partyName, stat, sum } from "./lookups";
import { cashFlowFromTotals, emptyTotals, fiscalTotalsLines, ledgerTotalsLines } from "./aggregates";
import { inPropertyScope, resolvePropertyScope } from "./scope";
import { SKIP } from "./source_params";
import {
  BASIS_OPTIONS,
  C,
  CASH_BASIS_NOTE,
  balanceCompareView,
  basisSubtitle,
  budgetOptions,
  budgetView,
  cashMonthsView,
  compareColumns,
  isCashBasis,
  pnlCompareView,
  pnlMonthsView,
  propertyCompareView,
  singleBridge,
  stmtDisplay,
} from "./statement_views";

// Ledger-driven report definitions: trial balance, GL detail, financial
// statements (and their comparative views, CORE-44), budget vs actual, check register, management fees, A/P aging, deposits, 1099s.
// Trial balance and statements read server totals (ledgerTotals); the line reports read a bounded ledger window (CORE-41).

const L = (data) => data.ledger || { lines: [], accounts: { byId: new Map(), byKey: new Map(), list: [] } };
const T = (data) => data.ledgerTotals || emptyTotals();
// The company fiscal-year start month the totals were split by (CORE-40, accounting_settings.fiscalYearStartMonth); null without a split.
const fyStartOf = (data) => T(data).fyStartMonth || null;
const NO_LEDGER = {
  title: "No ledger activity yet",
  description: "Post charges, payments and bills in Accounting — this report reads the general ledger.",
};

// Empty state for a ledger source: a failed load, else no ledger at all (`any` from a bounded load, else its lines); null with data.
function ledgerEmpty(src) {
  if (src?.error) return { title: "Couldn't load the ledger", description: src.error };
  return (src?.any ?? src?.lines?.length > 0) ? null : NO_LEDGER;
}

// The bounded ledger window a line report needs: its range and property scope, with opening balances when it shows them.
const windowFor = (f, properties, { opening = false } = {}) => ({ ledger: { from: f.from, to: f.to, propertyIds: resolvePropertyScope(f, properties), opening } });

const stmtCols = [
  { key: "label", header: "Line" },
  { key: "amount", header: "Amount", format: "money" },
];

export const trialBalanceReport = {
  key: "trial_balance",
  title: "Trial Balance",
  description: "Opening balance, period debits and credits, and closing balance for every GL account.",
  category: "Financial",
  keywords: ["tb", "debits", "credits", "gl", "general ledger", "accounts", "balances", "opening", "closing", "month end", "close"],
  sources: ["ledgerTotals", "properties"],
  // yearOf: income and expense open at the fiscal-year start of `from`; earlier years sit on retained earnings (CORE-40).
  sourceParams: (f, properties) => ({ ledgerTotals: { from: f.from, to: f.to, grain: "range", propertyIds: resolvePropertyScope(f, properties), yearOf: f.from } }),
  filters: [{ type: "range", defaultPreset: "this_month" }, { type: "property" }],
  compute(data, f) {
    const empty = ledgerEmpty(T(data));
    if (empty) return { empty };
    const lines = scopeLines(fiscalTotalsLines(T(data)), { propertyIds: resolvePropertyScope(f, data.properties) });
    const tb = trialBalance(lines, T(data).accounts, { ...f, fyStart: fyStartOf(data) });
    return {
      stats: [
        stat("Debits", money(tb.totals.debit), "Posted in period"),
        stat("Credits", money(tb.totals.credit), "Posted in period"),
        stat("Accounts", tb.rows.length, "With activity or a balance"),
        stat("Status", tb.balanced ? "Balanced" : "Out of balance", tb.balanced ? "Debits equal credits" : `Off by ${money(Math.abs(tb.totals.closingDr - tb.totals.closingCr))}`),
      ],
      sections: [
        {
          key: "tb",
          title: "Trial balance",
          description: `Closing balances through ${formatIso(f.to)}; opening is everything before ${formatIso(f.from)}, with income and expense from the fiscal year's start (earlier years sit in retained earnings).`,
          columns: [
            { key: "label", header: "Account" },
            { key: "accountType", header: "Type" },
            { key: "opening", header: "Opening", format: "money" },
            { key: "debit", header: "Debits", format: "money" },
            { key: "credit", header: "Credits", format: "money" },
            { key: "closingDr", header: "Closing Dr", format: "money" },
            { key: "closingCr", header: "Closing Cr", format: "money" },
          ],
          rows: tb.rows,
          totals: tb.totals,
          emptyTitle: "No balances in this range",
        },
      ],
    };
  },
};

export const generalLedgerDetailReport = {
  key: "general_ledger_detail",
  title: "General Ledger Detail",
  description: "Every posted line by account, with opening balances and a running balance.",
  category: "Financial",
  keywords: ["gl", "general ledger", "journal", "lines", "postings", "running balance", "account activity", "audit"],
  sources: ["ledger", "properties"],
  sourceParams: (f, properties) => windowFor(f, properties, { opening: true }),
  filters: [
    { type: "range", defaultPreset: "this_month" },
    { type: "property" },
    {
      key: "glAccountId",
      label: "Account",
      type: "select",
      options: (data) => optionsFrom(
        [...L(data).accounts.list].sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true })),
        "All accounts",
        accountLabel,
      ),
    },
  ],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const lines = scopeLines(L(data).lines, { propertyIds: resolvePropertyScope(f, data.properties) });
    const gl = glDetail(lines, L(data).accounts, f);
    const posted = gl.rows.filter((r) => r.kind === "line");
    return {
      stats: [
        stat("Accounts", gl.summary.length, "In this view"),
        stat("Lines", posted.length, "Posted in period"),
        stat("Debits", money(sum(posted, "debit"))),
        stat("Credits", money(sum(posted, "credit"))),
      ],
      sections: [
        {
          key: "summary",
          title: "By account",
          columns: [
            { key: "account", header: "Account" },
            { key: "opening", header: "Opening", format: "money" },
            { key: "debit", header: "Debits", format: "money" },
            { key: "credit", header: "Credits", format: "money" },
            { key: "closing", header: "Closing", format: "money" },
            { key: "count", header: "Lines", format: "number" },
          ],
          rows: gl.summary,
          emptyTitle: "No activity in this range",
        },
        {
          key: "detail",
          title: "Detail",
          searchable: true,
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "account", header: "Account" },
            { key: "source", header: "Type" },
            { key: "memo", header: "Memo" },
            { key: "status", header: "Status", format: "status", statusMap: LEDGER_STATUS_MAP },
            { key: "debit", header: "Debit", format: "money" },
            { key: "credit", header: "Credit", format: "money" },
            { key: "balance", header: "Balance", format: "money" },
          ],
          rows: gl.rows,
          emptyTitle: "No lines in this range",
        },
      ],
    };
  },
};

// Views of Financial Statements; `preset` is the range a view switches to from a shorter one (CORE-44).
export const FS_VIEWS = [
  { value: "pnl", label: "Profit & Loss" },
  { value: "pnl_months", label: "12-Month P&L", preset: "last_12" },
  { value: "pnl_compare", label: "P&L Comparison" },
  { value: "pnl_budget", label: "P&L vs Budget" },
  { value: "property_compare", label: "Property Comparison" },
  { value: "balance", label: "Balance Sheet" },
  { value: "balance_compare", label: "Balance Sheet Comparison" },
  { value: "cash", label: "Cash Flow" },
  { value: "cash_months", label: "12-Month Cash Flow", preset: "last_12" },
];

// Income-statement views read a cash or accrual basis; balance sheets and cash flows don't.
const BASIS_VIEWS = new Set(["pnl", "pnl_months", "pnl_compare", "pnl_budget", "property_compare"]);
const viewOf = (f) => f.view || "pnl";
const basisOf = (f) => (BASIS_VIEWS.has(viewOf(f)) && isCashBasis(f) ? { basis: "cash" } : {});

// The basis select, shown on income-statement views only.
const basisFilter = (when) => ({ key: "basis", label: "Basis", type: "select", options: () => BASIS_OPTIONS, default: "accrual", when });
// The budget select ("auto" = each property's Approved budget for the year), shown with the budget comparison.
const budgetFilter = (when) => ({ key: "budgetId", label: "Budget", type: "select", options: budgetOptions, default: "auto", when });

// Per view: one ledgerTotals load (a range, months, or with cash flow), ledgerColumns for comparisons, budgets for the budget view.
function statementParams(f, properties) {
  const propertyIds = resolvePropertyScope(f, properties);
  const range = { from: f.from, to: f.to, propertyIds };
  const off = { ledgerColumns: SKIP, budgets: SKIP };
  const columns = (cols) => cols.map(({ key, from, to }) => ({ key, from, to }));
  switch (viewOf(f)) {
    case "pnl_months":
      return { ...off, ledgerTotals: { ...range, grain: "month", ...basisOf(f) } };
    case "cash_months":
      return { ...off, ledgerTotals: { ...range, grain: "month", cash: true } };
    case "property_compare":
      return { ...off, ledgerTotals: { ...range, grain: "range", ...basisOf(f) } };
    case "pnl_budget":
      return { ledgerColumns: SKIP, ledgerTotals: { ...range, grain: "range", ...basisOf(f) }, budgets: { from: f.from, to: f.to } };
    case "pnl_compare":
      return { ledgerTotals: SKIP, budgets: SKIP, ledgerColumns: { columns: columns(compareColumns(f)), propertyIds, ...basisOf(f) } };
    case "balance_compare":
      return { ledgerTotals: SKIP, budgets: SKIP, ledgerColumns: { asOf: f.to, propertyIds } };
    default:
      // yearOf: the balance sheet splits retained and current-year earnings at the company fiscal year of `to` (CORE-40).
      return { ...off, ledgerTotals: { ...range, grain: "range", cash: true, yearOf: f.to, ...basisOf(f) } };
  }
}

export const financialStatementsReport = {
  key: "financial_statements",
  title: "Financial Statements",
  description: "Profit & loss, balance sheet and cash flow from the general ledger, by month, against prior periods, budgets or properties.",
  category: "Financial",
  keywords: [
    "p&l",
    "pnl",
    "profit and loss",
    "income statement",
    "balance sheet",
    "cash flow",
    "noi",
    "net income",
    "assets",
    "liabilities",
    "equity",
    "12 month",
    "t12",
    "trailing twelve",
    "comparative",
    "prior year",
    "property comparison",
    "cash basis",
    "accrual",
  ],
  sources: ["ledgerTotals", "ledgerColumns", "budgets", "properties"],
  sourceParams: statementParams,
  views: FS_VIEWS,
  filters: [
    { type: "range", defaultPreset: "this_month" },
    { type: "property" },
    basisFilter((f) => BASIS_VIEWS.has(viewOf(f))),
    budgetFilter((f) => viewOf(f) === "pnl_budget"),
  ],
  compute(data, f) {
    const view = viewOf(f);
    const empty = ledgerEmpty(["pnl_compare", "balance_compare"].includes(view) ? C(data) : T(data));
    if (empty) return { empty };
    if (view === "pnl_months") return pnlMonthsView(data, f);
    if (view === "pnl_compare") return pnlCompareView(data, f);
    if (view === "pnl_budget") return budgetView(data, f);
    if (view === "property_compare") return propertyCompareView(data, f);
    if (view === "balance_compare") return balanceCompareView(data, f);
    if (view === "cash_months") return cashMonthsView(data, f);
    const accounts = T(data).accounts;
    const lines = scopeLines(ledgerTotalsLines(T(data)), { propertyIds: resolvePropertyScope(f, data.properties) });
    if (view === "balance") {
      // Retained earnings (prior fiscal years) and current year earnings as of `to` (CORE-40).
      const bs = balanceSheet(scopeLines(fiscalTotalsLines(T(data)), { propertyIds: resolvePropertyScope(f, data.properties) }), accounts, f.to, { fyStart: fyStartOf(data) });
      const diff = round2(bs.totalAssets - bs.totalLiabilities - bs.totalEquity);
      return {
        stats: [
          stat("Total assets", money(bs.totalAssets), `As of ${formatIso(f.to)}`),
          stat("Total liabilities", money(bs.totalLiabilities)),
          stat("Total equity", money(bs.totalEquity), "Incl. retained and current year earnings"),
          stat("Check", bs.balanced ? "Balanced" : money(diff), bs.balanced ? "Assets = liabilities + equity" : "Assets − (liabilities + equity)"),
        ],
        sections: [
          { key: "assets", title: "Assets", kind: "statement", span: "half", columns: stmtCols, rows: stmtDisplay(bs.assets, accounts, "No assets"), totals: { label: "Total assets", amount: bs.totalAssets } },
          { key: "liabilities", title: "Liabilities", kind: "statement", span: "half", columns: stmtCols, rows: stmtDisplay(bs.liabilities, accounts, "No liabilities"), totals: { label: "Total liabilities", amount: bs.totalLiabilities } },
          { key: "equity", title: "Equity", kind: "statement", span: "half", columns: stmtCols, rows: stmtDisplay(bs.equity, accounts, "No equity"), totals: { label: "Total equity", amount: bs.totalEquity } },
          {
            key: "check",
            title: "Liabilities + equity",
            kind: "statement",
            span: "half",
            columns: stmtCols,
            rows: [
              { id: "l", label: "Total liabilities", amount: bs.totalLiabilities },
              { id: "e", label: "Total equity", amount: bs.totalEquity },
            ],
            totals: { label: "Liabilities + equity", amount: round2(bs.totalLiabilities + bs.totalEquity) },
          },
        ],
      };
    }
    if (view === "cash") {
      const cf = cashFlowFromTotals(T(data));
      return {
        stats: [
          stat("Opening cash", money(cf.opening), formatIso(f.from)),
          stat("Cash in", money(cf.inflow)),
          stat("Cash out", money(cf.outflow)),
          stat("Closing cash", money(cf.closing), formatIso(f.to)),
        ],
        sections: [
          {
            key: "chart",
            title: "Monthly cash flow",
            kind: "chart",
            chart: { x: "label", series: [{ key: "inflow", label: "Cash in" }, { key: "outflow", label: "Cash out" }] },
            columns: [
              { key: "label", header: "Month" },
              { key: "inflow", header: "Cash in", format: "money" },
              { key: "outflow", header: "Cash out", format: "money" },
              { key: "net", header: "Net", format: "money" },
            ],
            rows: cf.byMonth.map((m) => ({ ...m, label: monthName(m.key) })),
          },
          {
            key: "activity",
            title: "By activity",
            description: "Operating = rent, bills and other cash; financing = owner contributions and distributions.",
            columns: [
              { key: "label", header: "Activity" },
              { key: "inflow", header: "Cash in", format: "money" },
              { key: "outflow", header: "Cash out", format: "money" },
              { key: "net", header: "Net", format: "money" },
            ],
            rows: cf.byCategory,
            totals: { label: "Net change in cash", inflow: cf.inflow, outflow: cf.outflow, net: cf.net },
          },
        ],
      };
    }
    const pl = incomeStatement(lines, accounts, f);
    const cash = isCashBasis(f);
    return {
      subtitle: basisSubtitle(f),
      stats: [
        stat("Income", money(pl.totalIncome), cash ? "Cash basis" : undefined),
        stat("Expenses", money(pl.totalExpense)),
        stat("Net income", money(pl.net), "Income − expenses"),
        stat("Margin", pl.totalIncome ? pctLabel(pl.net / pl.totalIncome) : "0%", "Net of income"),
      ],
      sections: [
        { key: "income", title: "Income", description: cash ? CASH_BASIS_NOTE : undefined, kind: "statement", span: "half", columns: stmtCols, rows: stmtDisplay(pl.income, accounts, "No income in this period"), totals: { label: "Total income", amount: pl.totalIncome } },
        { key: "expenses", title: "Expenses", kind: "statement", span: "half", columns: stmtCols, rows: stmtDisplay(pl.expenses, accounts, "No expenses in this period"), totals: { label: "Total expenses", amount: pl.totalExpense } },
        {
          key: "net",
          title: "Net income",
          kind: "statement",
          columns: stmtCols,
          rows: [
            { id: "i", label: "Total income", amount: pl.totalIncome },
            { id: "e", label: "Less total expenses", amount: -pl.totalExpense },
          ],
          totals: { label: "Net income", amount: pl.net },
        },
        ...(cash ? [singleBridge(data, f, pl.net)] : []),
      ],
    };
  },
};

// Budget vs Actual (CORE-44): the budget comparison as its own Library report, with the full-year budget and a month-by-month view.
export const budgetVsActualReport = {
  key: "budget_vs_actual",
  title: "Budget vs Actual",
  description: "Income and expenses against property budgets, by account and month, with dollar and percent variance.",
  category: "Financial",
  keywords: ["budget", "budget vs actual", "bva", "variance", "actual", "plan", "forecast", "over budget", "under budget", "operating budget"],
  sources: ["ledgerTotals", "budgets", "properties"],
  sourceParams: (f, properties) => ({
    ledgerTotals: { from: f.from, to: f.to, grain: "month", propertyIds: resolvePropertyScope(f, properties), ...(isCashBasis(f) ? { basis: "cash" } : {}) },
    budgets: { from: f.from, to: f.to },
  }),
  filters: [{ type: "range", defaultPreset: "ytd" }, { type: "property" }, budgetFilter(), basisFilter()],
  compute(data, f) {
    const empty = ledgerEmpty(T(data));
    if (empty) return { empty };
    return budgetView(data, f, { monthly: true, fullYear: true });
  },
};

export const checkRegisterReport = {
  key: "check_register",
  title: "Check & Payment Register",
  description: "Every deposit and payment through your cash accounts, with a running balance; a bank deposit is one line.",
  category: "Banking",
  keywords: ["checks", "check register", "payments", "deposits", "bank deposits", "cash", "bank", "running balance", "disbursements", "receipts"],
  sources: ["ledger", "properties", "bankAccounts", "vendors", "tenants", "owners", "leases"],
  sourceParams: (f, properties) => windowFor(f, properties, { opening: true }),
  filters: [
    { type: "range", defaultPreset: "this_month" },
    { type: "property" },
    { key: "bankAccountId", label: "Bank account", type: "select", options: (data) => optionsFrom(data.bankAccounts, "All bank accounts", (b) => [b.name, b.last4 ? `••${b.last4}` : ""].filter(Boolean).join(" ")) },
  ],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const names = nameMaps(data);
    const lines = scopeLines(L(data).lines, { propertyIds: resolvePropertyScope(f, data.properties) });
    const reg = cashRegister(lines, L(data).accounts, f);
    const rows = reg.rows.map((r) => ({
      ...r,
      party: partyName(r, names),
      bank: names.bank.get(r.bankAccountId) || r.account,
      property: names.property.get(r.propertyId) || "",
    }));
    const deposits = round2(sum(rows, "deposit"));
    const payments = round2(sum(rows, "payment"));
    return {
      stats: [
        stat("Opening balance", money(reg.opening), formatIso(f.from)),
        stat("Deposits", money(deposits), `${rows.filter((r) => r.deposit).length} items`),
        stat("Payments", money(payments), `${rows.filter((r) => r.payment).length} items`),
        stat("Closing balance", money(reg.closing), formatIso(f.to)),
      ],
      sections: [
        {
          key: "register",
          title: "Register",
          searchable: true,
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "type", header: "Type" },
            { key: "reference", header: "Ref / method" },
            { key: "party", header: "Payee / payer" },
            { key: "memo", header: "Memo" },
            { key: "bank", header: "Account" },
            { key: "status", header: "Status", format: "status", statusMap: LEDGER_STATUS_MAP },
            { key: "deposit", header: "Deposit", format: "money" },
            { key: "payment", header: "Payment", format: "money" },
            { key: "balance", header: "Balance", format: "money" },
          ],
          rows,
          totals: { date: "", type: "Totals", deposit: deposits, payment: payments, balance: reg.closing },
          emptyTitle: "No cash movement in this range",
        },
      ],
    };
  },
};

export const managementFeesReport = {
  key: "management_fees",
  title: "Management Fees",
  description: "Fees booked per property and owner against the income they were earned on.",
  category: "Owners & trust",
  keywords: ["management fee", "fees", "fee income", "owners", "effective rate", "commission"],
  sources: ["ledger", "properties", "owners", "propertyOwners"],
  sourceParams: (f, properties) => windowFor(f, properties),
  filters: [{ type: "range", defaultPreset: "this_month" }, { type: "property" }],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const accounts = L(data).accounts;
    const names = nameMaps(data);
    const lines = scopeLines(L(data).lines, { propertyIds: resolvePropertyScope(f, data.properties) });
    const postings = managementFeePostings(lines, accounts, f);
    const income = incomeByProperty(lines, accounts, f);
    const owners = byId(data.owners);
    const links = list(data.propertyOwners);
    const props = new Set([...income.keys(), ...postings.map((p) => p.propertyId).filter(Boolean)]);
    const rows = [...props].map((pid) => {
      const mine = postings.filter((p) => p.propertyId === pid);
      const link = links.find((r) => r.propertyId === pid && r.isPrimary) || links.find((r) => r.propertyId === pid);
      const owner = owners.get(link?.ownerId) || owners.get(mine[0]?.ownerId);
      const base = income.get(pid) || 0;
      const fee = round2(sum(mine, "amount"));
      const pct = Number(owner?.managementFeePct) || 0;
      const expected = round2((base * pct) / 100);
      return { id: pid, property: names.property.get(pid) || "Unassigned", owner: owner?.name || "", base, fee, rate: base > 0 ? fee / base : 0, pct, expected, variance: round2(fee - expected) };
    }).sort((a, b) => b.fee - a.fee);
    const fees = round2(sum(rows, "fee"));
    const base = round2(sum(rows, "base"));
    const months = new Map();
    for (const p of postings) {
      const k = p.date.slice(0, 7);
      months.set(k, round2((months.get(k) || 0) + p.amount));
    }
    return {
      stats: [
        stat("Fees booked", money(fees), `${postings.length} postings`),
        stat("Income base", money(base), "Property income in period"),
        stat("Effective rate", base ? pctLabel(fees / base, 1) : "0%", "Fees ÷ income"),
        stat("Variance", money(round2(sum(rows, "variance"))), "Booked − expected at owner %"),
      ],
      sections: [
        {
          key: "by_property",
          title: "By property",
          columns: [
            { key: "property", header: "Property" },
            { key: "owner", header: "Owner" },
            { key: "base", header: "Income", format: "money" },
            { key: "pct", header: "Agreed %", value: (r) => (r.pct ? `${r.pct}%` : "—") },
            { key: "expected", header: "Expected", format: "money" },
            { key: "fee", header: "Booked", format: "money" },
            { key: "rate", header: "Effective", format: "percent", digits: 1 },
            { key: "variance", header: "Variance", format: "money" },
          ],
          rows,
          totals: { property: "Totals", base, expected: round2(sum(rows, "expected")), fee: fees, variance: round2(sum(rows, "variance")) },
          emptyTitle: "No fees or income in this range",
        },
        {
          key: "by_month",
          title: "By month",
          span: "half",
          columns: [
            { key: "label", header: "Month" },
            { key: "amount", header: "Fees", format: "money" },
          ],
          rows: [...months.entries()].sort().map(([k, amount]) => ({ id: k, label: monthName(k), amount })),
          emptyTitle: "No fees booked",
        },
        {
          key: "postings",
          title: "Postings",
          span: "half",
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "property", header: "Property", value: (r) => names.property.get(r.propertyId) || "—" },
            { key: "memo", header: "Memo" },
            { key: "amount", header: "Amount", format: "money" },
          ],
          rows: postings,
          emptyTitle: "No fees booked",
        },
      ],
    };
  },
};

export const apAgingReport = {
  key: "ap_aging",
  title: "A/P Aging",
  description: "Unpaid bills by days past due, from the ledger's accounts payable, grouped by payee (vendors, tenant refunds, owners).",
  category: "Payables",
  keywords: ["ap", "a/p", "accounts payable", "bills", "unpaid", "past due", "aging", "vendors", "payables"],
  sources: ["ledger", "properties", "vendors", "tenants", "owners"],
  // Every payable line through the as-of day: open items match payments to bills across the whole history.
  sourceParams: (f) => ({ ledger: { to: f.to, subtypes: ["payable"] } }),
  filters: [{ type: "range", mode: "asOf", defaultPreset: "today" }, { type: "property" }],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const names = nameMaps(data);
    const payeeName = (b) =>
      (b.payeeType === "vendor" && names.vendor.get(b.payeeId)) ||
      (b.payeeType === "tenant" && `${names.tenant.get(b.payeeId) || "Tenant"} (tenant)`) ||
      (b.payeeType === "owner" && `${names.owner.get(b.payeeId) || "Owner"} (owner)`) ||
      "No payee";
    const ids = resolvePropertyScope(f, data.properties);
    const bills = payableAging(L(data).lines, L(data).accounts, f.to)
      .filter((b) => inPropertyScope(ids, b.propertyId))
      .map((b) => ({ ...b, vendor: payeeName(b), property: names.property.get(b.propertyId) || "" }));
    const byVendor = new Map();
    for (const b of bills) {
      const v = byVendor.get(b.vendor) || { id: b.vendor, vendor: b.vendor, bills: 0, open: 0, current: 0, b1: 0, b31: 0, b61: 0, b91: 0 };
      v.bills += 1;
      for (const k of ["open", "current", "b1", "b31", "b61", "b91"]) v[k] = round2(v[k] + b[k]);
      byVendor.set(b.vendor, v);
    }
    const vendors = [...byVendor.values()].sort((a, b) => b.open - a.open);
    const bucketCols = AP_BUCKETS.map((b) => ({ key: b.key, header: b.label, format: "money" }));
    const total = round2(sum(bills, "open"));
    const pastDue = round2(total - sum(bills, "current"));
    const totals = { vendor: "Totals", bills: bills.length, open: total };
    for (const b of AP_BUCKETS) totals[b.key] = round2(sum(bills, b.key));
    return {
      stats: [
        stat("Total payable", money(total), `${bills.length} open bills`),
        stat("Past due", money(pastDue), `As of ${formatIso(f.to)}`),
        stat("Over 60 days", money(round2(sum(bills, "b61") + sum(bills, "b91")))),
        stat("Payees owed", vendors.length),
      ],
      sections: [
        {
          key: "vendors",
          title: "By payee",
          columns: [{ key: "vendor", header: "Payee" }, { key: "bills", header: "Bills", format: "number" }, ...bucketCols, { key: "open", header: "Total", format: "money" }],
          rows: vendors,
          totals,
          emptyTitle: "No unpaid bills",
          emptyDescription: "Every posted bill is paid as of this date.",
        },
        {
          key: "bills",
          title: "Open bills",
          searchable: true,
          columns: [
            { key: "vendor", header: "Payee" },
            { key: "memo", header: "Bill" },
            { key: "property", header: "Property" },
            { key: "billDate", header: "Billed", format: "date" },
            { key: "dueDate", header: "Due", format: "date" },
            { key: "daysPastDue", header: "Days past due", format: "number" },
            { key: "amount", header: "Amount", format: "money" },
            { key: "paid", header: "Paid", format: "money" },
            { key: "open", header: "Open", format: "money" },
          ],
          rows: bills,
          emptyTitle: "No unpaid bills",
        },
      ],
    };
  },
};

// A deposit-by-lease row (depositLeaseRows) with its lease, tenant, unit and property names.
function depositRowView(r, names, leases, units) {
  const lease = leases.get(r.key);
  const dep = r.deposit || {};
  const propertyId = lease?.propertyId || dep.propertyId || units.get(lease?.unitId || dep.unitId)?.propertyId || r.propertyId || "";
  return {
    id: r.key,
    lease: lease?.name || dep.leaseName || dep.name || "Deposit",
    tenant: lease?.tenantName || dep.tenantName || names.tenant.get(dep.tenantId) || names.tenant.get(r.tenantId) || "",
    unit: names.unit.get(lease?.unitId || dep.unitId || r.unitId) || lease?.unit || dep.unit || "",
    property: names.property.get(propertyId) || "",
    propertyId,
    location: r.location,
    status: r.status,
    recorded: r.recorded,
    ledger: r.ledger,
    interest: r.interest,
    diff: r.diff,
    match: r.match,
  };
}

const byPropertyUnit = (a, b) => a.property.localeCompare(b.property) || a.unit.localeCompare(b.unit, undefined, { numeric: true });

export const depositDetailReport = {
  key: "deposit_detail",
  title: "Deposit Detail",
  description: "Security deposits held per lease against the ledger, trust cash positions, and deposit activity.",
  category: "Owners & trust",
  keywords: ["security deposits", "deposits held", "trust", "trust cash", "deposit interest", "reconciliation", "shortfall"],
  sources: ["ledger", "deposits", "leases", "tenants", "units", "properties", "owners", "propertyOwners"],
  filters: [{ type: "range", defaultPreset: "ytd" }, { type: "property" }],
  compute(data, f) {
    const names = nameMaps(data);
    const accounts = L(data).accounts;
    const ids = resolvePropertyScope(f, data.properties);
    const lines = scopeLines(L(data).lines, { propertyIds: ids });
    // Held = 2100 per lease; deposit interest (2110) shows beside it; other deposits (2120, CORE-18) aren't security deposits.
    const leases = byId(data.leases);
    const units = byId(data.units);
    const rows = depositLeaseRows(lines, accounts, f.to, list(data.deposits))
      .map((r) => depositRowView(r, names, leases, units))
      .filter((r) => inPropertyScope(ids, r.propertyId) && (r.recorded || r.ledger || r.interest || r.match === "unposted"))
      .sort(byPropertyUnit);
    // Owner positions split each property's trust by the ownership in force on each line's date.
    const trust = trustPositions(lines, accounts, f.to, ownershipIndex(list(data.propertyOwners))).map((t) => ({
      ...t,
      owner: names.owner.get(t.ownerId) || (t.ownerId ? "Owner" : "Unassigned"),
      property: names.property.get(t.propertyId) || "",
      state: t.balance < 0 ? "short" : "ok",
    }));
    const activity = [];
    const seen = new Set();
    for (const l of scopeLines(lines, { from: f.from, to: f.to })) {
      const t = l.entry?.sourceType;
      // Deposit source types, plus sweeps, releases and refund bills tagged with a deposit (CORE-04).
      if (!(["deposit_held", "deposit_return", "deposit_interest"].includes(t) || l.metadata?.depositId) || seen.has(l.entryId)) continue;
      seen.add(l.entryId);
      activity.push({ id: l.entryId, date: l.date, type: sourceLabel(t), memo: l.entry?.memo || "", tenant: names.lease.get(l.leaseId) || names.tenant.get(l.tenantId) || "", amount: Number(l.entry?.total) || 0 });
    }
    const totalHeld = round2(sum(rows, "ledger"));
    const totalRecorded = round2(sum(rows, "recorded"));
    const depositCash = round2(sum(trust.filter((t) => t.systemKey === "deposit_cash"), "balance"));
    if (!rows.length && !trust.length && !activity.length) {
      return { empty: { title: "No deposits yet", description: "Record security deposits on leases, or post deposits received in Accounting." } };
    }
    return {
      stats: [
        stat("Held (ledger)", money(totalHeld), `As of ${formatIso(f.to)}`),
        stat("Recorded on leases", money(totalRecorded), `${rows.length} leases`),
        stat("Variance", money(round2(totalHeld - totalRecorded)), "Ledger − deposit records"),
        stat("Deposit trust cash", money(depositCash), `${trust.filter((t) => t.state === "short").length} shortfalls`),
      ],
      sections: [
        {
          key: "leases",
          title: "Deposits by lease",
          searchable: true,
          columns: [
            { key: "tenant", header: "Tenant" },
            { key: "unit", header: "Unit" },
            { key: "property", header: "Property" },
            { key: "location", header: "Held at" },
            { key: "status", header: "Record status" },
            { key: "recorded", header: "Recorded", format: "money" },
            { key: "ledger", header: "Ledger", format: "money" },
            { key: "interest", header: "Interest held", format: "money" },
            { key: "match", header: "Reconciliation", format: "status", statusMap: DEPOSIT_MATCH_MAP },
          ],
          rows,
          totals: { tenant: "Totals", recorded: totalRecorded, ledger: totalHeld, interest: round2(sum(rows, "interest")) },
          emptyTitle: "No deposits held",
        },
        {
          key: "trust",
          title: "Trust positions",
          description: "Trust cash per account, owner and property. A negative position means one owner's funds are covering another's.",
          columns: [
            { key: "account", header: "Trust account" },
            { key: "owner", header: "Owner" },
            { key: "property", header: "Property" },
            { key: "state", header: "Status", format: "status", statusMap: TRUST_STATUS_MAP },
            { key: "balance", header: "Balance", format: "money" },
          ],
          rows: trust,
          emptyTitle: "No trust cash yet",
        },
        {
          key: "activity",
          title: "Deposit activity",
          columns: [
            { key: "date", header: "Date", format: "date" },
            { key: "type", header: "Type" },
            { key: "tenant", header: "Tenant / lease" },
            { key: "memo", header: "Memo" },
            { key: "amount", header: "Amount", format: "money" },
          ],
          rows: activity,
          emptyTitle: "No deposit postings in this range",
        },
      ],
    };
  },
};

// --- Trust & bank reconciliation (INTL-05) -------------------------------------------------

const bankLabel = (b) => [b?.name, b?.last4 ? `••${b.last4}` : ""].filter(Boolean).join(" ");
const trustBanksOf = (data) => list(data.bankAccounts).filter((b) => isTrustBank(b, L(data).accounts));
const signedBy = (by) => (by ? by.name || by.email || "" : "");
const finalizedLabel = (at, by) => (at ? `Finalized ${formatIso(dayOf(at))}${signedBy(by) ? ` by ${signedBy(by)}` : ""}` : "");
const NO_TRUST_BANK = {
  title: "No trust bank accounts",
  description: "Add a Trust or Security deposit account in Bank Accounts, then finalize its statements in Bank Reconciliation.",
};

const itemColumns = (refHeader) => [
  { key: "date", header: "Date", format: "date" },
  { key: "type", header: "Type" },
  { key: "reference", header: refHeader },
  { key: "party", header: "Payee / payer" },
  { key: "memo", header: "Memo" },
  { key: "amount", header: "Amount", format: "money" },
];
const itemSection = (key, title, rows, names, { refHeader = "Ref", description, emptyTitle } = {}) => ({
  key,
  title,
  description,
  columns: itemColumns(refHeader),
  rows: rows.map((r) => ({ ...r, party: partyName(r, names) })),
  totals: { date: "", type: "Total", amount: round2(sum(rows, "amount")) },
  emptyTitle,
});

export const trustReconciliationReport = {
  key: "trust_reconciliation",
  title: "Trust Reconciliation",
  description: "Three-way reconciliation of a trust account: the adjusted bank balance, the trust cash on the books, and the owner, tenant and deposit ledgers it holds.",
  category: "Owners & trust",
  keywords: ["three-way", "3-way", "trust", "trust account", "reconciliation", "owner liability", "beneficiaries", "outstanding checks", "deposits in transit", "untagged", "audit", "compliance"],
  // Whole ledger: outstanding items and owner positions need every line through the as-of date.
  sources: ["ledger", "bankAccounts", "bankReconciliations", "propertyOwners", "owners", "vendors", "leases", "tenants", "units", "deposits"],
  filters: [
    { type: "range", mode: "asOf", defaultPreset: "end_last_month" },
    { key: "bankAccountId", label: "Trust account", type: "select", options: (data) => optionsFrom(trustBanksOf(data), "", bankLabel), default: "first" },
  ],
  compute(data, f) {
    const banks = trustBanksOf(data);
    if (!banks.length) return { empty: NO_TRUST_BANK };
    const noLedger = ledgerEmpty(data.ledger);
    if (noLedger) return { empty: noLedger };
    const bank = banks.find((b) => b.id === f.bankAccountId) || banks[0];
    const names = nameMaps(data);
    const leases = byId(data.leases);
    const units = byId(data.units);
    const tw = threeWayTrust({
      lines: L(data).lines,
      accounts: L(data).accounts,
      reconciliations: list(data.bankReconciliations),
      bankAccounts: list(data.bankAccounts),
      asOf: f.to,
      bankAccountId: bank.id,
      ownership: ownershipIndex(list(data.propertyOwners)),
      deposits: list(data.deposits),
    });
    const { book, beneficiaries: ben, differences: diff, status } = tw;
    const statement = tw.bank;
    const ownerFunds = tw.role !== "deposit";
    const undepositedLabel = accountLabel(L(data).accounts.byKey.get("undeposited_funds")) || "Undeposited funds";
    const tenantOf = (r) => names.lease.get(r.leaseId) || names.tenant.get(r.tenantId) || "";

    const bankRows = statement
      ? [
          { id: "statement", label: `Statement balance · ${formatIso(statement.statementDate)}`, amount: statement.statementBalance },
          { id: "in", label: `Add deposits in transit (${statement.depositsInTransit.length})`, amount: statement.outstandingIn },
          { id: "out", label: `Less outstanding checks (${statement.outstandingChecks.length})`, amount: -statement.outstandingOut },
        ]
      : [{ id: "none", label: `No finalized statement on or before ${formatIso(f.to)}`, amount: 0, muted: true }];
    const bookRows = [
      { id: "cash", label: book.account || "Trust cash", amount: book.cash },
      ...(book.undeposited ? [{ id: "undeposited", label: undepositedLabel, amount: book.undeposited }] : []),
    ];
    const benRows = ownerFunds
      ? [
          { id: "owners", label: `Owner funds (${ben.ownerRows.length})`, amount: ben.owners },
          ...(tw.role === "rent" ? [{ id: "credits", label: `Tenant credits (${ben.creditRows.length})`, amount: ben.tenantCredits }] : []),
          ...(tw.holdsDeposits ? [{ id: "deposits", label: "Security deposits held", amount: ben.deposits }] : []),
        ]
      : [
          { id: "principal", label: `Security deposits held (${ben.depositRows.filter((r) => r.ledger).length})`, amount: ben.principal },
          { id: "interest", label: "Deposit interest held", amount: ben.interestFunded },
        ];
    const checkRows = [
      statement ? { id: "bank", label: "Adjusted bank − book", amount: diff.bank } : { id: "bank", label: "Adjusted bank − book (not reconciled)", amount: 0, muted: true },
      ownerFunds ? { id: "untagged", label: "Book − beneficiaries (untagged)", amount: diff.untagged } : { id: "deposits", label: "Deposit cash − deposits held", amount: diff.deposits },
      ...(tw.holdsDeposits ? [{ id: "unposted", label: "Deposit records not on the ledger", amount: diff.unposted }] : []),
    ];
    const variance = round2(Math.abs(diff.bank || 0) + Math.abs(diff.untagged) + Math.abs(diff.deposits) + Math.abs(diff.unposted));

    const ownerRows = ben.ownerRows
      .map((r) => ({ ...r, owner: names.owner.get(r.ownerId) || "Owner", property: names.property.get(r.propertyId) || (r.propertyId ? "Property" : "Owner-level") }))
      .sort((a, b) => a.owner.localeCompare(b.owner) || a.property.localeCompare(b.property));
    const creditRows = ben.creditRows
      .map((r) => ({ ...r, tenant: tenantOf(r) || "Tenant", unit: names.unit.get(r.unitId) || "", property: names.property.get(r.propertyId) || "" }))
      .sort(byPropertyUnit);
    const depositRows = ben.depositRows.map((r) => depositRowView(r, names, leases, units)).sort(byPropertyUnit);
    const untaggedRows = tw.untagged.lines.map((r) => ({ ...r, property: names.property.get(r.propertyId) || "", memo: r.memo || tenantOf(r) }));
    const depositName = new Map(depositRows.map((r) => [r.id, [r.tenant, r.unit].filter(Boolean).join(" · ") || r.lease]));
    const exceptionRows = tw.exceptions.map((x) => {
      const who = x.ownerId ? [names.owner.get(x.ownerId) || "Owner", names.property.get(x.propertyId) || ""].filter(Boolean).join(" · ") : x.leaseKey ? depositName.get(x.leaseKey) || "Deposit" : "";
      return { ...x, detail: who ? `${who}: ${x.detail}` : x.detail };
    });

    const sections = [
      { key: "bank", title: "Bank statement", kind: "statement", span: "half", columns: stmtCols, rows: bankRows, ...(statement ? { totals: { label: "Adjusted bank balance", amount: statement.adjusted } } : {}) },
      { key: "book", title: "Books", description: "Trust cash per the general ledger.", kind: "statement", span: "half", columns: stmtCols, rows: bookRows, totals: { label: "Book balance", amount: book.total } },
      { key: "beneficiaries", title: "Beneficiary ledgers", kind: "statement", span: "half", columns: stmtCols, rows: benRows, totals: { label: "Beneficiary total", amount: ben.total } },
      { key: "check", title: "Three-way check", description: status.label, kind: "statement", span: "half", columns: stmtCols, rows: checkRows, totals: { label: "Total variance", amount: variance } },
      itemSection("outstanding_deposits", "Outstanding deposits", statement?.depositsInTransit || [], names, {
        description: "On the books through the as-of date but not on the statement yet (deposits in transit).",
        emptyTitle: statement ? "No deposits in transit" : "No finalized statement",
      }),
      itemSection("outstanding_checks", "Outstanding checks", statement?.outstandingChecks || [], names, {
        refHeader: "Check / ref",
        description: "Paid on the books through the as-of date but not cleared by the bank yet.",
        emptyTitle: statement ? "No outstanding checks" : "No finalized statement",
      }),
    ];
    if (ownerFunds) {
      sections.push({
        key: "owners",
        title: "Owner liability listing",
        description: "Each owner's trust cash by property (their share of property money plus their own entries), less the tenant money held inside it.",
        searchable: true,
        columns: [
          { key: "owner", header: "Owner" },
          { key: "property", header: "Property" },
          { key: "position", header: "Trust position", format: "money" },
          { key: "held", header: "Held for tenants", format: "money" },
          { key: "funds", header: "Owner funds", format: "money" },
          { key: "state", header: "Status", format: "status", statusMap: TRUST_STATUS_MAP },
        ],
        rows: ownerRows,
        totals: { owner: "Totals", position: ben.positions, held: round2(sum(ownerRows, "held")), funds: ben.owners },
        emptyTitle: "No owner money in this account",
      });
    }
    if (tw.role === "rent") {
      sections.push({
        key: "credits",
        title: "Tenant credits",
        description: "Prepaid rent and unapplied payments held for tenants.",
        searchable: true,
        columns: [
          { key: "tenant", header: "Tenant" },
          { key: "unit", header: "Unit" },
          { key: "property", header: "Property" },
          { key: "prepaid", header: "Prepaid rent", format: "money" },
          { key: "unapplied", header: "Unapplied payments", format: "money" },
          { key: "credit", header: "Credit held", format: "money" },
        ],
        rows: creditRows,
        totals: { tenant: "Totals", prepaid: round2(sum(creditRows, "prepaid")), unapplied: round2(sum(creditRows, "unapplied")), credit: ben.tenantCredits },
        emptyTitle: "No tenant credits",
      });
    }
    if (tw.holdsDeposits) {
      sections.push({
        key: "deposits",
        title: "Deposits by lease",
        description: "Security deposits held per lease on the ledger against the deposit records, as Deposit Detail reconciles them.",
        searchable: true,
        columns: [
          { key: "tenant", header: "Tenant" },
          { key: "unit", header: "Unit" },
          { key: "property", header: "Property" },
          { key: "status", header: "Record status" },
          { key: "recorded", header: "Recorded", format: "money" },
          { key: "ledger", header: "Held (ledger)", format: "money" },
          { key: "interest", header: "Interest", format: "money" },
          { key: "match", header: "Reconciliation", format: "status", statusMap: DEPOSIT_MATCH_MAP },
        ],
        rows: depositRows,
        totals: { tenant: "Totals", recorded: round2(sum(depositRows, "recorded")), ledger: ben.principal, interest: ben.interest },
        emptyTitle: "No deposits held",
      });
    }
    if (ownerFunds) {
      sections.push({
        key: "untagged",
        title: "Untagged trust lines",
        description: "Trust money that can't be traced to an owner or a tenant: tag the line with its property or owner.",
        columns: [
          { key: "date", header: "Date", format: "date" },
          { key: "type", header: "Type" },
          { key: "memo", header: "Memo" },
          { key: "property", header: "Property" },
          { key: "reason", header: "Why" },
          { key: "amount", header: "Amount", format: "money" },
        ],
        rows: untaggedRows,
        totals: { date: "", type: "Total", amount: tw.untagged.total },
        emptyTitle: "Every trust line traces to an owner or tenant",
      });
    }
    sections.push({
      key: "exceptions",
      title: "Exceptions",
      columns: [
        { key: "severity", header: "Severity", format: "status", statusMap: TRUST_EXCEPTION_MAP },
        { key: "check", header: "Check" },
        { key: "detail", header: "Detail" },
        { key: "amount", header: "Amount", format: "money" },
      ],
      rows: exceptionRows,
      emptyTitle: "No exceptions",
      emptyDescription: "Bank, book and beneficiary ledgers agree, and no position is short.",
    });

    return {
      subtitle: [bankLabel(bank), bank.bankName, statement ? `Statement ${formatIso(statement.statementDate)}` : "", finalizedLabel(statement?.finalizedAt, statement?.finalizedBy)].filter(Boolean).join(" · "),
      stats: [
        stat("Adjusted bank", statement ? money(statement.adjusted) : "—", statement ? `Statement ${formatIso(statement.statementDate)}` : "No finalized statement"),
        stat("Book balance", money(book.total), book.account),
        stat("Beneficiaries", money(ben.total), ownerFunds ? "Owners, tenant credits and deposits" : "Security deposits held"),
        stat("Status", status.short, status.detail),
      ],
      sections,
    };
  },
};

// Finalized reconciliations for the printable report's picker, newest first.
const finalizedRecs = (data) =>
  list(data.bankReconciliations)
    .filter((r) => r.status === "Finalized")
    .sort((a, b) => String(b.statementDate || "").localeCompare(String(a.statementDate || "")));

export const bankReconciliationReport = {
  key: "bank_reconciliation_report",
  title: "Bank Reconciliation Report",
  description: "A finalized bank reconciliation as it was signed off: the statement, cleared and outstanding items, and the adjusted bank and book balances.",
  category: "Banking",
  keywords: ["bank reconciliation", "statement", "cleared", "outstanding checks", "deposits in transit", "adjusted bank", "print", "sign-off"],
  sources: ["ledger", "bankAccounts", "bankReconciliations", "vendors", "tenants", "owners", "leases"],
  filters: [
    {
      key: "reconciliationId",
      label: "Reconciliation",
      type: "select",
      options: (data) => {
        const banks = byId(data.bankAccounts);
        return finalizedRecs(data).map((r) => ({ value: r.id, label: `${bankLabel(banks.get(r.bankAccountId)) || r.name || "Bank"} · ${formatIso(r.statementDate)}` }));
      },
      default: "first",
    },
  ],
  compute(data, f) {
    const rec = finalizedRecs(data).find((r) => r.id === f.reconciliationId);
    if (!rec) return { empty: { title: "No finalized reconciliation", description: "Finalize a statement in Bank Reconciliation to print it." } };
    const view = bankReconciliationView(rec, { lines: L(data).lines, accounts: L(data).accounts, bankAccounts: list(data.bankAccounts), reconciliations: list(data.bankReconciliations) });
    const s = view.snapshot;
    const names = nameMaps(data);
    const bank = view.bank || s.bank;
    const S = s.statementDate;
    return {
      subtitle: [
        bankLabel(bank),
        bank?.bankName,
        finalizedLabel(s.finalizedAt || rec.finalizedAt, s.finalizedBy),
        view.reconstructed ? "Finalized before snapshots were kept: outstanding items and the book are read from today's ledger" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      periodLabel: `Statement ${formatIso(S)}`,
      stats: [
        stat("Statement balance", money(s.statementBalance), formatIso(S)),
        stat("Adjusted bank", money(s.adjustedBank), `${s.outstanding.deposits.length} in transit · ${s.outstanding.checks.length} outstanding`),
        stat("Book balance", money(s.bookBalance), view.reconstructed ? "Today's ledger" : "At sign-off"),
        stat("Difference", money(s.difference), Math.abs(s.difference) < 0.005 ? "Adjusted bank = book" : "Adjusted bank − book"),
      ],
      sections: [
        {
          key: "statement",
          title: "Statement",
          kind: "statement",
          span: "half",
          columns: stmtCols,
          rows: [
            { id: "opening", label: "Opening balance (previous statement)", amount: s.openingBalance },
            { id: "deposits", label: `Add cleared deposits (${view.cleared.deposits.length})`, amount: s.clearedDeposits },
            { id: "withdrawals", label: `Less cleared withdrawals (${view.cleared.withdrawals.length})`, amount: -s.clearedWithdrawals },
          ],
          totals: { label: `Statement balance · ${formatIso(S)}`, amount: s.statementBalance },
        },
        {
          key: "bank_to_book",
          title: "Bank to book",
          kind: "statement",
          span: "half",
          columns: stmtCols,
          rows: [
            { id: "statement", label: "Statement balance", amount: s.statementBalance },
            { id: "in", label: "Add deposits in transit", amount: s.outstandingDeposits },
            { id: "out", label: "Less outstanding checks", amount: -s.outstandingChecks },
            { id: "adjusted", label: "Adjusted bank balance", amount: s.adjustedBank },
            { id: "book", label: "Book balance per ledger", amount: s.bookBalance },
          ],
          totals: { label: "Difference", amount: s.difference },
        },
        itemSection("outstanding_deposits", "Deposits in transit", s.outstanding.deposits, names, { emptyTitle: "No deposits in transit" }),
        itemSection("outstanding_checks", "Outstanding checks", s.outstanding.checks, names, { refHeader: "Check / ref", emptyTitle: "No outstanding checks" }),
        itemSection("cleared_deposits", "Cleared deposits", view.cleared.deposits, names, { emptyTitle: "No deposits cleared" }),
        itemSection("cleared_withdrawals", "Cleared checks & withdrawals", view.cleared.withdrawals, names, { refHeader: "Check / ref", emptyTitle: "No withdrawals cleared" }),
      ],
    };
  },
};

// IRS 1099-NEC/MISC reporting threshold: $600 through 2025, $2,000 from 2026.
export const thresholdForYear = (year) => (Number(year) >= 2026 ? 2000 : 600);

export const vendor1099Report = {
  key: "vendor_1099",
  title: "1099 Summary",
  description: "Cash paid to each vendor in the period against the 1099 reporting threshold, with W-9 status.",
  category: "Tax",
  keywords: ["1099", "1099-nec", "1099-misc", "irs", "w-9", "w9", "tin", "vendor payments", "tax", "year end"],
  sources: ["ledger", "vendors"],
  sourceParams: (f) => ({ ledger: { from: f.from, to: f.to } }),
  filters: [
    { type: "range", defaultPreset: "last_year" },
    {
      key: "threshold",
      label: "Threshold",
      type: "select",
      options: () => [
        { value: "auto", label: "Threshold for the tax year" },
        { value: "2000", label: "$2,000 (2026+)" },
        { value: "600", label: "$600 (2025 and earlier)" },
      ],
      default: "auto",
    },
  ],
  compute(data, f) {
    const empty = ledgerEmpty(L(data));
    if (empty) return { empty };
    const year = parseIso(f.from)?.getFullYear();
    const threshold = f.threshold && f.threshold !== "auto" ? Number(f.threshold) : thresholdForYear(year);
    const vendors = byId(data.vendors);
    const rows = vendorPayments(L(data).lines, L(data).accounts, f)
      .filter((p) => p.total > 0)
      .map((p) => {
        const v = vendors.get(p.vendorId) || {};
        const m = v.metadata || {};
        const eligible = m.is1099 ?? true;
        const over = p.total >= threshold;
        return {
          id: p.vendorId,
          vendor: v.name || "Unknown vendor",
          taxpayer: m.taxpayerName || "",
          tin: m.tinLast4 ? `${m.tinType || "TIN"} ••${m.tinLast4}` : "",
          eligible,
          w9: Boolean(m.w9OnFile),
          payments: p.payments,
          last: p.last,
          total: p.total,
          state: !eligible ? "exempt" : !over ? "below" : m.w9OnFile ? "reportable" : "missing_w9",
        };
      })
      .sort((a, b) => b.total - a.total);
    const reportable = rows.filter((r) => r.state === "reportable" || r.state === "missing_w9");
    return {
      stats: [
        stat("Reportable vendors", reportable.length, `Paid ≥ ${money(threshold)}`),
        stat("Reportable total", money(round2(sum(reportable, "total")))),
        stat("Missing W-9", reportable.filter((r) => !r.w9).length, "Reportable without a W-9"),
        stat("Total paid", money(round2(sum(rows, "total"))), `${rows.length} vendors`),
      ],
      sections: [
        {
          key: "vendors",
          title: `Vendor payments · threshold ${money(threshold)}`,
          description: "Cash actually paid (bill payments and cash expenses tagged with the vendor), net of voids.",
          searchable: true,
          columns: [
            { key: "vendor", header: "Vendor" },
            { key: "taxpayer", header: "Taxpayer name" },
            { key: "tin", header: "TIN" },
            { key: "w9", header: "W-9 on file", format: "bool" },
            { key: "payments", header: "Payments", format: "number" },
            { key: "last", header: "Last paid", format: "date" },
            { key: "total", header: "Total paid", format: "money" },
            { key: "state", header: "1099 status", format: "status", statusMap: FILING_STATUS_MAP },
          ],
          rows,
          emptyTitle: "No vendor payments in this period",
        },
      ],
    };
  },
};

export const FINANCIAL_REPORTS = [
  financialStatementsReport,
  budgetVsActualReport,
  trialBalanceReport,
  generalLedgerDetailReport,
  checkRegisterReport,
  apAgingReport,
  depositDetailReport,
  trustReconciliationReport,
  managementFeesReport,
  vendor1099Report,
  bankReconciliationReport,
];
