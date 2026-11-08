import { emptyColumns, emptyTotals, ledgerTotalsLines, totalsToLines } from "./aggregates";
import { cashBridge } from "./cash_basis";
import { money, pctLabel, round2 } from "./format";
import { scopeLines } from "./ledger_math";
import { list, stat } from "./lookups";
import { formatIso, monthName } from "./periods";
import { pnlByProperty } from "./portfolio";
import { resolvePropertyScope } from "./scope";
import {
  MAX_MONTH_COLUMNS,
  accountRows,
  balanceMatrix,
  budgetColumn,
  budgetFavorable,
  budgetLinesFor,
  cashMatrix,
  monthsTruncated,
  periodColumns,
  pnlMatrix,
  rollupParents,
  rowsByColumn,
  selectBudgets,
  spanLabel,
  statementMatrix,
  withVariance,
} from "./statements";

// Comparative statement views (CORE-44): the Financial Statements views beyond the single-period three, and Budget vs Actual. Each
// returns { stats, sections, subtitle?, empty? } with `kind: "statement"` sections whose columns are data (one per period, property or
// comparison), parent-account subtotals, and on a cash basis a bridge back to accrual.

export const T = (data) => data.ledgerTotals || emptyTotals();
export const C = (data) => data.ledgerColumns || emptyColumns();
export const B = (data) => (data.budgets && !Array.isArray(data.budgets) ? data.budgets : { budgets: [], lines: [] });

export const BASIS_OPTIONS = [
  { value: "accrual", label: "Accrual basis" },
  { value: "cash", label: "Cash basis" },
];
export const isCashBasis = (f) => f?.basis === "cash";
export const basisSubtitle = (f) => (isCashBasis(f) ? "Cash basis" : "");

export const CASH_BASIS_NOTE =
  "Cash basis: income counts when a payment (or a deposit applied) settles the charge it's applied to, expenses when the bill is paid, split across the charge's or bill's accounts; everything posted straight to cash counts as posted.";

const money$ = (key, header) => ({ key, header, format: "money" });
const pct$ = (key, header) => ({ key, header, format: "percent", digits: 1 });
const LABEL = { key: "label", header: "Account" };

const lean = ({ account: _account, ...r }) => r;
const neg = (vals) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, round2(-(Number(v) || 0))]));

// A matrix statement section: account rows with parent subtotals, variance pairs, and a totals row.
function matrixSection({ key, title, description, rows, accounts, keys, columns, totals, totalsLabel, variances = [], emptyLabel }) {
  let display = rollupParents(rows, accounts, keys).map(lean);
  let total = { label: totalsLabel, ...totals };
  for (const v of variances) {
    display = withVariance(display, v.a, v.b, v);
    [total] = withVariance([total], v.a, v.b, { ...v, favorable: () => 1 });
  }
  if (!display.length) display = [{ id: "none", label: emptyLabel, muted: true }];
  return { key, title, description, kind: "statement", columns: [LABEL, ...columns], rows: display, totals: total };
}

// Income, Expenses and Net income sections of a P&L matrix.
function pnlSections(matrix, accounts, { keys, columns, variances = [], netDescription } = {}) {
  const { totals } = matrix;
  return [
    matrixSection({ key: "income", title: "Income", rows: matrix.income, accounts, keys, columns, totals: totals.income, totalsLabel: "Total income", variances, emptyLabel: "No income in this period" }),
    matrixSection({ key: "expenses", title: "Expenses", rows: matrix.expenses, accounts, keys, columns, totals: totals.expense, totalsLabel: "Total expenses", variances, emptyLabel: "No expenses in this period" }),
    (() => {
      let rows = [
        { id: "i", label: "Total income", ...totals.income },
        { id: "e", label: "Less total expenses", ...neg(totals.expense) },
      ];
      let total = { label: "Net income", ...totals.net };
      for (const v of variances) {
        rows = withVariance(rows, v.a, v.b, { ...v, favorable: () => 1 });
        [total] = withVariance([total], v.a, v.b, { ...v, favorable: () => 1 });
      }
      return { key: "net", title: "Net income", description: netDescription, kind: "statement", columns: [{ key: "label", header: "Line" }, ...columns], rows, totals: total };
    })(),
  ];
}

// A ledgerTotals' P&L lines on the report's property scope (CORE-43: re-scoped after the scoped load).
const scopedLines = (rows, f, data) => scopeLines(totalsToLines(rows), { propertyIds: resolvePropertyScope(f, data.properties) });

// The cash-basis bridge per column: accrual net − increase in receivables + increase in payables + outside rows = cash-basis net.
function bridgeSection(columns, perColumn, accounts, cashNets) {
  const keys = columns.map((c) => c.key);
  const bridges = keys.map((k) => cashBridge({ ...perColumn.get(k), accounts }));
  const row = (id, label, field) => ({ id, label, ...Object.fromEntries(keys.map((k, i) => [k, bridges[i][field]])) });
  const off = keys.filter((k, i) => Math.round(bridges[i].cashNet * 100) !== Math.round((cashNets[k] || 0) * 100));
  return {
    key: "bridge",
    title: "Reconciliation to accrual",
    description: off.length
      ? `Doesn't tie to the cash-basis statement in ${off.length} column${off.length === 1 ? "" : "s"}; report this to support.`
      : "Cash-basis net income is accrual net income less the growth in receivables plus the growth in payables. Unapplied prepayments, deposits billed through receivables and opening balances stay outside income until a charge or bill takes them.",
    kind: "statement",
    columns: [{ key: "label", header: "Line" }, ...columns.map((c) => money$(c.key, c.label))],
    rows: [
      row("accrual", "Accrual net income", "accrualNet"),
      row("receivables", "Less increase in receivables", "receivables"),
      row("payables", "Add increase in payables", "payables"),
      row("outside", "Receipts and payments outside income", "outside"),
    ],
    totals: { label: "Cash-basis net income", ...Object.fromEntries(keys.map((k, i) => [k, bridges[i].cashNet])) },
  };
}

// Per column, the accrual rows, the accrual net and the cash rows the bridge reads.
function bridgeInputs(columns, accrualByColumn, cashByColumn, accounts, f, data) {
  const out = new Map();
  for (const c of columns) {
    const accrualRows = (accrualByColumn.get(c.key) || []).filter((r) => scopedRow(r, f, data));
    const cashRows = (cashByColumn.get(c.key) || []).filter((r) => scopedRow(r, f, data));
    const accrualNet = pnlMatrix(new Map([[c.key, totalsToLines(accrualRows)]]), accounts, [c]).totals.net[c.key];
    out.set(c.key, { accrualRows, cashRows, accrualNet });
  }
  return out;
}

const scopedRow = (r, f, data) => {
  const ids = resolvePropertyScope(f, data.properties);
  return !ids || ids.includes(r.propertyId);
};

// --- Profit & loss by month ---------------------------------------------------------------------------------------------

export function pnlMonthsView(data, f) {
  const totals = T(data);
  const accounts = totals.accounts;
  const months = periodColumns({ from: f.from, to: f.to, mode: "months" });
  const total = { key: "total", label: "Total", from: months[0]?.from || f.from, to: months[months.length - 1]?.to || f.to };
  const cols = [...months, total];
  const lines = scopedLines(totals.period, f, data);
  const byMonth = rowsByColumn(totals.period, months);
  const linesBy = new Map([...months.map((c) => [c.key, scopeLines(totalsToLines(byMonth.get(c.key)), { propertyIds: resolvePropertyScope(f, data.properties) })]), ["total", scopeLines(lines, { from: total.from, to: total.to })]]);
  const matrix = pnlMatrix(linesBy, accounts, cols);
  const keys = cols.map((c) => c.key);
  const columns = cols.map((c) => money$(c.key, c.label));
  const sections = pnlSections(matrix, accounts, { keys, columns });
  if (isCashBasis(f)) {
    const accrualBy = rowsByColumn(totals.accrual, months);
    accrualBy.set("total", (totals.accrual || []).filter((r) => r.period >= total.from && r.period <= total.to));
    const cashBy = new Map([...byMonth, ["total", (totals.period || []).filter((r) => r.period >= total.from && r.period <= total.to)]]);
    sections.push(bridgeSection(cols, bridgeInputs(cols, accrualBy, cashBy, accounts, f, data), accounts, matrix.totals.net));
  }
  const nets = months.map((c) => matrix.totals.net[c.key]);
  const truncated = monthsTruncated(f.from, f.to);
  return {
    subtitle: basisSubtitle(f),
    periodLabel: truncated ? `${spanLabel(total.from, total.to)} · first ${MAX_MONTH_COLUMNS} months of the range` : undefined,
    stats: [
      stat("Income", money(matrix.totals.income.total), `${months.length} months`),
      stat("Expenses", money(matrix.totals.expense.total)),
      stat("Net income", money(matrix.totals.net.total), "Income − expenses"),
      stat("Average month", money(months.length ? round2(nets.reduce((s, n) => s + n, 0) / months.length) : 0), "Net income per month"),
    ],
    sections,
  };
}

// --- Comparison: this period, the one before it, and the same period last year -------------------------------------------

export const compareColumns = (f) => periodColumns({ from: f.from, to: f.to, mode: "compare" });

export function pnlCompareView(data, f) {
  const src = C(data);
  const accounts = src.accounts;
  const base = compareColumns(f);
  const cols = src.columns.length ? src.columns.map((c, i) => ({ ...base[i], ...c, label: base[i]?.label || c.key })) : base;
  const linesBy = new Map(cols.map((c) => [c.key, scopedLines(c.period || [], f, data)]));
  const matrix = pnlMatrix(linesBy, accounts, cols);
  const [cur, prior, ly] = cols.map((c) => c.key);
  const variances = [
    { a: cur, b: prior, key: "vs_prior" },
    { a: cur, b: ly, key: "vs_last_year" },
  ];
  const columns = [
    money$(cur, cols[0].label),
    money$(prior, cols[1].label),
    money$("vs_prior", "vs prior $"),
    pct$("vs_priorPct", "vs prior %"),
    money$(ly, cols[2].label),
    money$("vs_last_year", "vs last year $"),
    pct$("vs_last_yearPct", "vs last year %"),
  ];
  const sections = pnlSections(matrix, accounts, { keys: [cur, prior, ly], columns, variances, netDescription: "Changes are this period less the comparison period." });
  if (isCashBasis(f)) {
    const accrualBy = new Map(cols.map((c) => [c.key, c.accrual || []]));
    const cashBy = new Map(cols.map((c) => [c.key, c.period || []]));
    sections.push(bridgeSection(cols, bridgeInputs(cols, accrualBy, cashBy, accounts, f, data), accounts, matrix.totals.net));
  }
  const net = matrix.totals.net;
  const change = (a, b) => (b ? pctLabel((a - b) / Math.abs(b), 1) : "—");
  return {
    subtitle: basisSubtitle(f),
    stats: [
      stat("Net income", money(net[cur]), cols[0].label),
      stat("Prior period", money(net[prior]), `${change(net[cur], net[prior])} · ${cols[1].label}`),
      stat("Same period last year", money(net[ly]), `${change(net[cur], net[ly])} · ${cols[2].label}`),
      stat("Income", money(matrix.totals.income[cur]), `${change(matrix.totals.income[cur], matrix.totals.income[ly])} vs last year`),
    ],
    sections,
  };
}

// --- Budget vs actual ---------------------------------------------------------------------------------------------------

export function budgetOptions(data) {
  const budgets = [...B(data).budgets].sort((a, b) => b.year - a.year || String(a.name).localeCompare(String(b.name)));
  return [{ value: "auto", label: "Each property's budget (Approved first)" }, ...budgets.map((b) => ({ value: b.id, label: `${b.name || `${b.year} budget`} · ${b.status}` }))];
}

const NO_BUDGET = {
  title: "No budget for this range",
  description: "Add monthly amounts to a budget for these properties in Accounting → Budgets, or pick another budget.",
};

// Actual vs budget per account for the range (with the full-year budget when `fullYear`), plus a by-month comparison when `monthly`.
export function budgetView(data, f, { monthly = false, fullYear = false } = {}) {
  const totals = T(data);
  const accounts = totals.accounts;
  const ids = resolvePropertyScope(f, data.properties);
  const budgetLines = budgetLinesFor(B(data), { budgetId: f.budgetId || "auto", propertyIds: ids });
  if (!budgetLines.length) return { empty: NO_BUDGET };
  const range = { from: f.from, to: f.to };
  const actual = { key: "actual", label: "Actual", from: f.from, to: f.to };
  const lines = scopedLines(totals.period, f, data);
  const budget = budgetColumn(budgetLines, accounts, range);
  const years = B(data).params?.years || [Number(f.from.slice(0, 4)), Number(f.to.slice(0, 4))];
  const annual = budgetColumn(budgetLines, accounts, { from: `${years[0]}-01-01`, to: `${years[1]}-12-31` });
  const typed = (id) => accounts.byId.get(id);
  const extra = [...new Set([...budget.byAccount.keys(), ...(fullYear ? annual.byAccount.keys() : [])])]
    .map((id) => typed(id))
    .filter((a) => a && ["Income", "Expense"].includes(a.accountType))
    .map((a) => ({ id: a.id, account: a, label: a.name, accountType: a.accountType }));
  const matrix = pnlMatrix(new Map([["actual", lines]]), accounts, [actual], { extra });
  const fill = (rows) => rows.map((r) => ({ ...r, budget: budget.byAccount.get(r.id) || 0, ...(fullYear ? { annual: annual.byAccount.get(r.id) || 0 } : {}) }));
  matrix.income = fill(matrix.income);
  matrix.expenses = fill(matrix.expenses);
  matrix.totals.income = { ...matrix.totals.income, budget: budget.income, ...(fullYear ? { annual: annual.income } : {}) };
  matrix.totals.expense = { ...matrix.totals.expense, budget: budget.expense, ...(fullYear ? { annual: annual.expense } : {}) };
  matrix.totals.net = { ...matrix.totals.net, budget: budget.net, ...(fullYear ? { annual: annual.net } : {}) };
  const keys = ["actual", "budget", ...(fullYear ? ["annual"] : [])];
  const columns = [money$("actual", "Actual"), money$("budget", "Budget"), money$("variance", "Variance"), pct$("variancePct", "Variance %"), ...(fullYear ? [money$("annual", "Full-year budget")] : [])];
  const variances = [{ a: "actual", b: "budget", key: "variance", favorable: budgetFavorable }];
  const chosen = selectBudgets(B(data).budgets, { budgetId: f.budgetId || "auto", propertyIds: ids }).filter((b) => budgetLines.some((l) => l.budgetId === b.id));
  const sections = pnlSections(matrix, accounts, { keys, columns, variances, netDescription: "A positive variance is favourable: income above budget, expenses below it." });
  sections[0].description = `Budget covers ${monthsSpan(range)} from ${chosen.length} budget${chosen.length === 1 ? "" : "s"}: ${chosen.map((b) => b.name || `${b.year} budget`).join(", ")}.`;
  if (isCashBasis(f)) {
    const perColumn = bridgeInputs([actual], new Map([["actual", totals.accrual || []]]), new Map([["actual", totals.period || []]]), accounts, f, data);
    sections.push(bridgeSection([actual], perColumn, accounts, matrix.totals.net));
  }
  if (monthly) sections.push(...monthlyBudgetSections(totals, budgetLines, accounts, f, data));
  const net = matrix.totals.net;
  const variance = round2(net.actual - net.budget);
  return {
    subtitle: basisSubtitle(f),
    stats: [
      stat("Actual net income", money(net.actual), spanLabel(f.from, f.to)),
      stat("Budgeted net income", money(net.budget), `${chosen.length} budget${chosen.length === 1 ? "" : "s"}`),
      stat("Variance", money(variance), variance >= 0 ? "Ahead of budget" : "Behind budget"),
      stat("Expenses vs budget", budget.expense ? pctLabel(matrix.totals.expense.actual / budget.expense, 0) : "—", "Actual ÷ budgeted expenses"),
    ],
    sections,
  };
}

const monthsSpan = (range) => {
  const cols = periodColumns({ ...range, mode: "months" });
  if (!cols.length) return "";
  const [a, b] = [cols[0].from.slice(0, 7), cols[cols.length - 1].from.slice(0, 7)];
  return a === b ? `the month of ${monthName(a)}` : `whole months ${monthName(a)} – ${monthName(b)}`;
};

// Budget against actual net income per month: a chart and the month-by-month table.
function monthlyBudgetSections(totals, budgetLines, accounts, f, data) {
  const months = periodColumns({ from: f.from, to: f.to, mode: "months" });
  const byMonth = rowsByColumn(totals.period, months);
  const rows = months.map((c) => {
    const pl = pnlMatrix(new Map([[c.key, scopedLines(byMonth.get(c.key), f, data)]]), accounts, [c]).totals;
    const b = budgetColumn(budgetLines, accounts, { from: c.from, to: c.to });
    const actualNet = pl.net[c.key];
    return {
      id: c.key,
      label: c.label,
      budgetIncome: b.income,
      actualIncome: pl.income[c.key],
      budgetExpense: b.expense,
      actualExpense: pl.expense[c.key],
      budgetNet: b.net,
      actualNet,
      variance: round2(actualNet - b.net),
    };
  });
  const sum = (k) => round2(rows.reduce((s, r) => s + r[k], 0));
  return [
    {
      key: "by_month_chart",
      title: "Net income by month",
      kind: "chart",
      chart: { x: "label", series: [{ key: "budgetNet", label: "Budget" }, { key: "actualNet", label: "Actual" }] },
      columns: [{ key: "label", header: "Month" }, money$("budgetNet", "Budget"), money$("actualNet", "Actual")],
      rows,
    },
    {
      key: "by_month",
      title: "By month",
      columns: [
        { key: "label", header: "Month" },
        money$("budgetIncome", "Budget income"),
        money$("actualIncome", "Actual income"),
        money$("budgetExpense", "Budget expenses"),
        money$("actualExpense", "Actual expenses"),
        money$("budgetNet", "Budget net"),
        money$("actualNet", "Actual net"),
        money$("variance", "Variance"),
      ],
      rows,
      totals: { label: "Totals", ...Object.fromEntries(["budgetIncome", "actualIncome", "budgetExpense", "actualExpense", "budgetNet", "actualNet", "variance"].map((k) => [k, sum(k)])) },
      emptyTitle: "No months in this range",
    },
  ];
}

// --- Property comparison (CORE-43 pnlByProperty) ------------------------------------------------------------------------

export function propertyCompareView(data, f) {
  const totals = T(data);
  const accounts = totals.accounts;
  const ids = resolvePropertyScope(f, data.properties);
  const lines = scopedLines(totals.period, f, data);
  const range = { from: f.from, to: f.to };
  const res = pnlByProperty(lines, accounts, range, ids);
  const names = new Map(list(data.properties).map((p) => [p.id, p.name || "Untitled property"]));
  const nameOf = (id) => (id ? names.get(id) || "Other property" : "No property");
  const props = [...res.columns].sort((a, b) => (a.propertyId ? 0 : 1) - (b.propertyId ? 0 : 1) || nameOf(a.propertyId).localeCompare(nameOf(b.propertyId), undefined, { numeric: true }));
  const cols = [...props.map((c, i) => ({ key: `p${i}`, label: nameOf(c.propertyId), propertyId: c.propertyId, ...range })), { key: "total", label: "Total", ...range }];
  const matrix = statementMatrix([...props, res.total], cols);
  const keys = cols.map((c) => c.key);
  const sections = pnlSections(matrix, accounts, { keys, columns: cols.map((c) => money$(c.key, c.label)), netDescription: "Each property's column holds its own lines; together they make the total." });
  if (isCashBasis(f)) {
    const group = (rows) => {
      const by = new Map(cols.map((c) => [c.key, []]));
      for (const r of rows || []) {
        const col = cols.find((c) => c.propertyId !== undefined && c.propertyId === (r.propertyId || ""));
        if (col) by.get(col.key).push(r);
        by.get("total").push(r);
      }
      return by;
    };
    sections.push(bridgeSection(cols, bridgeInputs(cols, group(totals.accrual), group(totals.period), accounts, f, data), accounts, matrix.totals.net));
  }
  return {
    subtitle: basisSubtitle(f),
    stats: [
      stat("Properties", props.filter((c) => c.propertyId).length, props.some((c) => !c.propertyId) ? "Plus lines with no property" : "In scope"),
      stat("Income", money(res.total.totalIncome)),
      stat("Expenses", money(res.total.totalExpense)),
      stat("Net income", money(res.total.net), `NOI ${money(res.total.noi)}`),
    ],
    sections,
  };
}

// --- Balance sheet comparison ---------------------------------------------------------------------------------------------

export const asOfColumns = (f) => periodColumns({ to: f.to, mode: "asOf" });

export function balanceCompareView(data, f) {
  const src = C(data);
  const accounts = src.accounts;
  const base = asOfColumns(f);
  const cols = src.columns.length ? src.columns.map((c, i) => ({ ...base[i], ...c, label: base[i]?.label || c.key })) : base;
  const linesBy = new Map(cols.map((c) => [c.key, scopedLines(c.period || [], f, data)]));
  const m = balanceMatrix(linesBy, accounts, cols);
  const [now, monthEnd, yearEnd] = cols.map((c) => c.key);
  const keys = [now, monthEnd, yearEnd];
  const variances = [
    { a: now, b: monthEnd, key: "vs_month_end" },
    { a: now, b: yearEnd, key: "vs_year_end" },
  ];
  const columns = [
    money$(now, cols[0].label),
    money$(monthEnd, cols[1].label),
    money$("vs_month_end", "Change since month-end"),
    money$(yearEnd, cols[2].label),
    money$("vs_year_end", "Change since year-end"),
  ];
  const section = (key, title, rows, totals, totalsLabel, emptyLabel) => matrixSection({ key, title, rows, accounts, keys, columns, totals, totalsLabel, variances, emptyLabel });
  const lPlusE = Object.fromEntries(keys.map((k) => [k, round2(m.totals.liabilities[k] + m.totals.equity[k])]));
  const diff = Object.fromEntries(keys.map((k) => [k, round2(m.totals.assets[k] - lPlusE[k])]));
  let checkRows = [
    { id: "a", label: "Total assets", ...m.totals.assets },
    { id: "le", label: "Total liabilities + equity", ...lPlusE },
  ];
  let checkTotal = { label: "Assets − (liabilities + equity)", ...diff };
  for (const v of variances) {
    checkRows = withVariance(checkRows, v.a, v.b, v);
    [checkTotal] = withVariance([checkTotal], v.a, v.b, v);
  }
  const balanced = keys.filter((k) => m.balanced[k]).length;
  return {
    periodLabel: `As of ${formatIso(cols[0].to)}, ${formatIso(cols[1].to)} and ${formatIso(cols[2].to)}`,
    stats: [
      stat("Total assets", money(m.totals.assets[now]), `As of ${formatIso(cols[0].to)}`),
      stat("Change since month-end", money(round2(m.totals.assets[now] - m.totals.assets[monthEnd])), `Assets vs ${formatIso(cols[1].to)}`),
      stat("Change since year-end", money(round2(m.totals.assets[now] - m.totals.assets[yearEnd])), `Assets vs ${formatIso(cols[2].to)}`),
      stat("Check", balanced === keys.length ? "Balanced" : "Out of balance", `${balanced} of ${keys.length} columns: assets = liabilities + equity`),
    ],
    sections: [
      section("assets", "Assets", m.assets, m.totals.assets, "Total assets", "No assets"),
      section("liabilities", "Liabilities", m.liabilities, m.totals.liabilities, "Total liabilities", "No liabilities"),
      section("equity", "Equity", m.equity, m.totals.equity, "Total equity", "No equity"),
      { key: "check", title: "Check", description: "Every column balances when the last line is zero.", kind: "statement", columns: [{ key: "label", header: "Line" }, ...columns], rows: checkRows, totals: checkTotal },
    ],
  };
}

// --- Cash flow by month ---------------------------------------------------------------------------------------------------

export function cashMonthsView(data, f) {
  const totals = T(data);
  const months = periodColumns({ from: f.from, to: f.to, mode: "months" });
  const { summaries, total, categories } = cashMatrix(totals, months);
  const cols = [...months, { key: "total", label: "Total" }];
  const all = [...summaries, total];
  const value = (fn) => Object.fromEntries(cols.map((c, i) => [c.key, fn(all[i])]));
  const cat = (s, label) => s.byCategory.find((x) => x.label === label) || { inflow: 0, outflow: 0 };
  const nonzero = (r) => cols.some((c) => r[c.key]);
  const rows = [
    { id: "opening", label: "Opening cash", ...value((s) => s.opening) },
    ...categories.map((label) => ({ id: `in:${label}`, label: `Cash in · ${label}`, depth: 1, ...value((s) => cat(s, label).inflow) })).filter(nonzero),
    ...categories.map((label) => ({ id: `out:${label}`, label: `Cash out · ${label}`, depth: 1, ...value((s) => -cat(s, label).outflow) })).filter(nonzero),
    { id: "net", label: "Net change in cash", subtotal: true, ...value((s) => s.net) },
  ];
  return {
    stats: [
      stat("Opening cash", money(total.opening), formatIso(months[0]?.from || f.from)),
      stat("Cash in", money(total.inflow)),
      stat("Cash out", money(total.outflow)),
      stat("Closing cash", money(total.closing), formatIso(months[months.length - 1]?.to || f.to)),
    ],
    sections: [
      {
        key: "cash_months",
        title: "Cash flow by month",
        description: "Operating = rent, bills and other cash; financing = owner contributions and distributions. Transfers between cash accounts net out.",
        kind: "statement",
        columns: [{ key: "label", header: "Line" }, ...cols.map((c) => money$(c.key, c.label))],
        rows,
        totals: { label: "Closing cash", ...value((s) => s.closing) },
      },
      {
        key: "chart",
        title: "Monthly cash flow",
        kind: "chart",
        chart: { x: "label", series: [{ key: "inflow", label: "Cash in" }, { key: "outflow", label: "Cash out" }] },
        columns: [{ key: "label", header: "Month" }, money$("inflow", "Cash in"), money$("outflow", "Cash out"), money$("net", "Net")],
        rows: months.map((c, i) => ({ id: c.key, label: c.label, inflow: summaries[i].inflow, outflow: summaries[i].outflow, net: summaries[i].net })),
      },
    ],
  };
}

// --- Single-period statements with parent subtotals (the original P&L and balance sheet views) ------------------------------

// Statement rows ({ id, label, amount, account }) → display rows with parent headings and subtotals (amount under "amount").
export function stmtDisplay(rows, accounts, emptyLabel) {
  const display = rollupParents(rows, accounts, ["amount"]).map(lean);
  return display.length ? display : [{ id: "none", label: emptyLabel, amount: 0, muted: true }];
}

export { accountRows };

// The cash-basis bridge of a single-period P&L (the plain Profit & Loss view on a cash basis).
export function singleBridge(data, f, cashNet) {
  const totals = T(data);
  const col = { key: "amount", label: "Amount", from: f.from, to: f.to };
  const perColumn = bridgeInputs([col], new Map([["amount", totals.accrual || []]]), new Map([["amount", totals.period || []]]), totals.accounts, f, data);
  const s = bridgeSection([col], perColumn, totals.accounts, { amount: cashNet });
  return { ...s, columns: [{ key: "label", header: "Line" }, { key: "amount", header: "Amount", format: "money" }] };
}

export const openingAware = (data) => ledgerTotalsLines(T(data));
