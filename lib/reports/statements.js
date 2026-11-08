import { accountLabel } from "@/lib/ledger/postings";
import { round2 } from "./format";
import { CASH_CATEGORIES, balanceSheet, cashFlowSummary, incomeStatement, isCash } from "./ledger_math";
import { fiscalYearOf } from "./portfolio";
import { dayBefore, dayOf, formatIso, isoLocal, monthKeyOf, monthName, monthsIn, parseIso } from "./periods";

// Comparative statements (CORE-44), pure: period columns, P&L / balance-sheet / cash-flow matrices with one amount per column, variance,
// budget columns and parent-account subtotals. Inputs are CORE-41 totals turned into synthetic lines (aggregates.ledgerTotalsLines /
// totalsToLines), so every column is the same ledger_math the single-period statements use.

export const MAX_MONTH_COLUMNS = 24;

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => isoLocal(new Date(y, m, d));
const endOfMonth = (iso) => {
  const d = parseIso(iso);
  return ymd(d.getFullYear(), d.getMonth() + 1, 0);
};
const isMonthStart = (iso) => dayOf(iso).slice(8) === "01";
const isMonthEnd = (iso) => Boolean(iso) && endOfMonth(iso) === dayOf(iso);
const wholeMonths = (from, to) => isMonthStart(from) && isMonthEnd(to);
const monthCount = (from, to) => {
  const a = parseIso(from);
  const b = parseIso(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
};
const shiftMonths = (iso, n) => {
  const d = parseIso(iso);
  return ymd(d.getFullYear(), d.getMonth() + n, 1);
};
// The same calendar day `years` earlier (Feb 29 becomes Feb 28).
function shiftYears(iso, years) {
  const d = parseIso(iso);
  const y = d.getFullYear() + years;
  return ymd(y, d.getMonth(), Math.min(d.getDate(), new Date(y, d.getMonth() + 1, 0).getDate()));
}
const addDays = (iso, n) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};

// A short label for a range: "Nov 2026", "Jan – Nov 2026", or "Mar 17 – Aug 9, 2026".
export function spanLabel(from, to) {
  if (!from) return `As of ${formatIso(to)}`;
  if (wholeMonths(from, to)) {
    const [a, b] = [monthKeyOf(from), monthKeyOf(to)];
    if (a === b) return monthName(a);
    return a.slice(0, 4) === b.slice(0, 4) ? `${monthName(a, false)} – ${monthName(b)}` : `${monthName(a)} – ${monthName(b)}`;
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatIso(from, sameYear ? { month: "short", day: "numeric" } : undefined)} – ${formatIso(to)}`;
}

// The period immediately before a range: the same number of whole months, else the same number of days.
export function priorPeriod(from, to) {
  if (wholeMonths(from, to)) {
    const n = monthCount(from, to);
    const start = shiftMonths(from, -n);
    return { from: start, to: dayBefore(from) };
  }
  const days = Math.round((parseIso(to) - parseIso(from)) / 86400000);
  const end = dayBefore(from);
  return { from: addDays(end, -days), to: end };
}

// The same range a year earlier (whole months stay whole months).
export function samePeriodLastYear(from, to) {
  if (wholeMonths(from, to)) return { from: shiftYears(from, -1), to: endOfMonth(shiftYears(to, -1)) };
  return { from: shiftYears(from, -1), to: shiftYears(to, -1) };
}

// Column sets → [{ key, label, from, to }]:
// "months" one per calendar month in the range (clamped to it, at most MAX_MONTH_COLUMNS); "compare" the range, the period before it
// and the same period last year; "asOf" balances as of `to`, the prior month-end and the prior fiscal year-end (from: null).
export function periodColumns({ from, to, mode = "months", fiscalStartMonth = 1 } = {}) {
  if (mode === "asOf") {
    const d = parseIso(to);
    const priorMonthEnd = ymd(d.getFullYear(), d.getMonth(), 0);
    const priorYearEnd = dayBefore(fiscalYearOf(to, fiscalStartMonth).from);
    return [
      { key: "asof", label: formatIso(to), from: null, to },
      { key: "month_end", label: formatIso(priorMonthEnd), from: null, to: priorMonthEnd },
      { key: "year_end", label: formatIso(priorYearEnd), from: null, to: priorYearEnd },
    ];
  }
  if (mode === "compare") {
    const prior = priorPeriod(from, to);
    const ly = samePeriodLastYear(from, to);
    return [
      { key: "current", label: spanLabel(from, to), from, to },
      { key: "prior", label: spanLabel(prior.from, prior.to), ...prior },
      { key: "last_year", label: spanLabel(ly.from, ly.to), ...ly },
    ];
  }
  if (mode === "range") return [{ key: "total", label: "Total", from, to }];
  return monthsIn({ from, to })
    .slice(0, MAX_MONTH_COLUMNS)
    .map((k, i) => {
      const start = `${k}-01`;
      return { key: `m${i}`, label: monthName(k), from: start < from ? from : start, to: endOfMonth(start) > to ? to : endOfMonth(start) };
    });
}

// Is the month range longer than the matrix shows?
export const monthsTruncated = (from, to) => monthsIn({ from, to }).length > MAX_MONTH_COLUMNS;

// Totals rows per column: each row goes to the column whose range holds its `period` (month-grain totals → month columns).
export function rowsByColumn(rows, columns) {
  const out = new Map(columns.map((c) => [c.key, []]));
  for (const r of rows || []) {
    const d = dayOf(r.period);
    const col = columns.find((c) => (!c.from || d >= c.from) && d <= c.to);
    if (col) out.get(col.key).push(r);
  }
  return out;
}

const byNumber = (a, b) => String(a?.number ?? "").localeCompare(String(b?.number ?? ""), undefined, { numeric: true });

// Per-account rows across columns: [{ id, account, label, accountType, [key]: amount }] sorted by account number (0 where absent).
function unionRows(perColumn, keys, extra = []) {
  const rows = new Map();
  const touch = (id, src) => {
    if (!rows.has(id)) rows.set(id, { id, account: src.account || null, label: src.label, accountType: src.accountType, ...Object.fromEntries(keys.map((k) => [k, 0])) });
    return rows.get(id);
  };
  perColumn.forEach((list, i) => {
    for (const r of list) touch(r.id, r)[keys[i]] = r.amount;
  });
  for (const r of extra) touch(r.id, r);
  const special = (r) => (r.account ? 0 : 1);
  return [...rows.values()].sort((a, b) => special(a) - special(b) || byNumber(a.account, b.account));
}

const sumKeys = (rows, keys) => Object.fromEntries(keys.map((k) => [k, round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0))]));

// The P&L of each column (lines per column key, each column's own range) → { income, expenses, totals: { income, expense, net } }.
// `extra` adds accounts with no actuals (budget-only); a column's amounts are incomeStatement's, so a column equals that range's P&L.
export function pnlMatrix(linesByColumn, accounts, columns, { extra = [] } = {}) {
  const statements = columns.map((c) => incomeStatement(linesByColumn.get(c.key) || [], accounts, { from: c.from, to: c.to }));
  return statementMatrix(statements, columns, { extra });
}

// Income statements (one per column, e.g. CORE-43 pnlByProperty's) → the same matrix shape as pnlMatrix.
export function statementMatrix(statements, columns, { extra = [] } = {}) {
  const keys = columns.map((c) => c.key);
  const income = unionRows(statements.map((s) => s.income), keys, extra.filter((r) => r.accountType === "Income"));
  const expenses = unionRows(statements.map((s) => s.expenses), keys, extra.filter((r) => r.accountType === "Expense"));
  const pick = (k) => Object.fromEntries(columns.map((c, i) => [c.key, statements[i][k]]));
  return { income, expenses, totals: { income: pick("totalIncome"), expense: pick("totalExpense"), net: pick("net") } };
}

// Each column's balance sheet (as of the column's `to`) → { assets, liabilities, equity, totals, balanced: { [key]: bool } }.
export function balanceMatrix(linesByColumn, accounts, columns) {
  const keys = columns.map((c) => c.key);
  const sheets = columns.map((c) => balanceSheet(linesByColumn.get(c.key) || [], accounts, c.to));
  const pick = (k) => Object.fromEntries(columns.map((c, i) => [c.key, sheets[i][k]]));
  return {
    assets: unionRows(sheets.map((s) => s.assets), keys),
    liabilities: unionRows(sheets.map((s) => s.liabilities), keys),
    equity: unionRows(sheets.map((s) => s.equity), keys),
    totals: { assets: pick("totalAssets"), liabilities: pick("totalLiabilities"), equity: pick("totalEquity") },
    balanced: pick("balanced"),
  };
}

// Variance of column `a` against column `b` on every row (and totals): `${key}` = a − b (or b − a where `favorable(row)` is −1, so a
// positive variance is always good), `${key}Pct` = variance ÷ |b| (null when b is 0). Heading rows stay blank.
export function withVariance(rows, a, b, { key = `${a}_vs_${b}`, favorable = () => 1 } = {}) {
  return rows.map((r) => {
    if (r.heading) return r;
    const base = Number(r[b]) || 0;
    const variance = round2(favorable(r) * ((Number(r[a]) || 0) - base));
    return { ...r, [key]: variance, [`${key}Pct`]: base ? variance / Math.abs(base) : null };
  });
}

// Favourable direction for budget variance: income above budget and expenses below it are positive.
export const budgetFavorable = (r) => (r.accountType === "Expense" ? -1 : 1);

// The months (YYYY-MM) a range touches.
export const rangeMonths = (range) => monthsIn(range);

// Budget amounts per account for the months a range touches → { byAccount: Map(id → amount), lines (those counted), total }.
export function budgetColumn(budgetLines, accounts, range) {
  const months = new Set(rangeMonths(range));
  const byAccount = new Map();
  const counted = [];
  for (const l of budgetLines || []) {
    if (!months.has(`${l.year}-${pad(l.month)}`)) continue;
    counted.push(l);
    byAccount.set(l.glAccountId, round2((byAccount.get(l.glAccountId) || 0) + (Number(l.amount) || 0)));
  }
  const typeOf = (id) => accounts?.byId?.get(id)?.accountType;
  const total = (t) => round2([...byAccount].filter(([id]) => typeOf(id) === t).reduce((s, [, v]) => s + v, 0));
  const income = total("Income");
  const expense = total("Expense");
  return { byAccount, lines: counted, total: round2(counted.reduce((s, l) => s + (Number(l.amount) || 0), 0)), income, expense, net: round2(income - expense) };
}

const STATUS_RANK = { Approved: 0, Draft: 1, Archived: 2 };

// The budgets a report reads: one id, or ("auto") per property and year the Approved budget, else Draft, else Archived (latest
// updated first). Budgets for no property count only when every property is in scope.
export function selectBudgets(budgets, { budgetId = "auto", propertyIds = null } = {}) {
  const list = budgets || [];
  if (budgetId && budgetId !== "auto") return list.filter((b) => b.id === budgetId);
  const best = new Map();
  for (const b of list) {
    if (propertyIds && !propertyIds.includes(b.propertyId)) continue;
    const k = `${b.propertyId || ""}|${b.year}`;
    const cur = best.get(k);
    const rank = (x) => [STATUS_RANK[x.status] ?? 3, -Date.parse(x.updatedAt || 0) || 0];
    if (!cur || rank(b)[0] < rank(cur)[0] || (rank(b)[0] === rank(cur)[0] && rank(b)[1] < rank(cur)[1])) best.set(k, b);
  }
  return [...best.values()];
}

// Budget lines of the chosen budgets inside the property scope (lines without a property only when every property is in scope).
export function budgetLinesFor(source, { budgetId = "auto", propertyIds = null } = {}) {
  const chosen = new Set(selectBudgets(source?.budgets, { budgetId, propertyIds }).map((b) => b.id));
  return (source?.lines || []).filter((l) => chosen.has(l.budgetId) && (!propertyIds || propertyIds.includes(l.propertyId)));
}

// Parent-account subtotals: rows (one per account, amounts under `keys`) → display rows in chart order. A parent with sub-accounts
// becomes a heading, its own postings a "(direct)" row, its sub-accounts indented under it, then "Total <parent>" = own + Σ children.
// Rows without an account (current earnings) follow the accounts. Parents of another account type don't nest.
export function rollupParents(rows, accounts, keys) {
  const byId = accounts?.byId || new Map();
  const own = new Map(rows.filter((r) => r.account || byId.get(r.id)).map((r) => [r.id, r]));
  const loose = rows.filter((r) => !own.has(r.id));
  const parentOf = (id) => {
    const a = byId.get(id);
    const p = a?.parentId ? byId.get(a.parentId) : null;
    return p && p.id !== id && p.accountType === a.accountType ? p.id : null;
  };
  const children = new Map();
  const nodes = new Set();
  for (const id of own.keys()) {
    let cur = id;
    for (let depth = 0; cur && depth < 10 && !nodes.has(cur); depth += 1) {
      nodes.add(cur);
      const p = parentOf(cur);
      if (p) {
        if (!children.has(p)) children.set(p, new Set());
        children.get(p).add(cur);
      }
      cur = p;
    }
  }
  const sorted = (ids) => [...ids].sort((a, b) => byNumber(byId.get(a), byId.get(b)));
  const zero = () => Object.fromEntries(keys.map((k) => [k, 0]));
  const out = [];
  const emit = (id, depth, seen) => {
    const a = byId.get(id);
    const label = a ? accountLabel(a) : own.get(id)?.label || "";
    const kids = sorted(children.get(id) || []).filter((k) => !seen.has(k));
    const mine = own.get(id);
    if (!kids.length) {
      const vals = mine ? Object.fromEntries(keys.map((k) => [k, mine[k] ?? 0])) : zero();
      if (mine) out.push({ ...mine, id, label, depth });
      return vals;
    }
    out.push({ id: `${id}:heading`, accountId: id, label, depth, heading: true, accountType: a?.accountType });
    const total = zero();
    const add = (vals) => keys.forEach((k) => (total[k] = round2(total[k] + (Number(vals[k]) || 0))));
    if (mine) {
      out.push({ ...mine, id, label: `${label} (direct)`, depth: depth + 1 });
      add(mine);
    }
    const next = new Set([...seen, id]);
    for (const k of kids) add(emit(k, depth + 1, next));
    out.push({ id: `${id}:subtotal`, accountId: id, label: `Total ${label}`, depth, subtotal: true, accountType: a?.accountType, ...total });
    return total;
  };
  const roots = sorted([...nodes].filter((id) => !parentOf(id) || !nodes.has(parentOf(id))));
  for (const id of roots) emit(id, 0, new Set());
  for (const r of loose) out.push({ ...r, depth: 0 });
  return out;
}

// Rows counted once each (no headings or subtotals): what section totals add up.
export const accountRows = (rows) => rows.filter((r) => !r.heading && !r.subtotal);

// Monthly cash flow matrix from a ledgerTotals result with cash rows (grain month) → { rows, columns' summaries, total }.
// Each column: opening cash, inflow / outflow per activity, net change, closing; the total column runs from the first opening to the
// last closing, so it equals the single-range cash flow.
export function cashMatrix(totals, columns) {
  const accounts = totals?.accounts || { byId: new Map() };
  const from = totals?.params?.from;
  let opening = from ? round2((totals.opening || []).reduce((s, r) => (isCash(accounts.byId.get(r.glAccountId)) ? s + r.debit - r.credit : s), 0)) : 0;
  const moves = (totals?.cash || []).flatMap((r) => [
    { date: r.period, entry: { sourceType: r.sourceType }, delta: r.inflow },
    { date: r.period, entry: { sourceType: r.sourceType }, delta: -r.outflow },
  ]).filter((m) => m.delta);
  const summaries = columns.map((c) => {
    const s = cashFlowSummary(opening, moves.filter((m) => m.date >= c.from && m.date <= c.to), { from: c.from, to: c.to });
    opening = s.closing;
    return s;
  });
  const total = cashFlowSummary(summaries[0]?.opening ?? opening, moves.filter((m) => (!columns.length || (m.date >= columns[0].from && m.date <= columns[columns.length - 1].to))), {
    from: columns[0]?.from,
    to: columns[columns.length - 1]?.to,
  });
  return { summaries, total, categories: CASH_CATEGORIES };
}
