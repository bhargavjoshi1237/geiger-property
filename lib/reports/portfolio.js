import { round2 } from "./format";
import { incomeStatement } from "./ledger_math";
import { daysBetweenIso, dayOf, isoLocal, parseIso } from "./periods";
import { fiscalYearRange } from "@/lib/ledger/periods";

// Portfolio financials (CORE-43, pure): fiscal year-to-date P&L, NOI, a per-property P&L (the property comparison CORE-44 builds its
// columns on) and the target checks the portfolio overview and Financials tab share. Inputs are ledger lines in scope (usually
// ledgerTotalsLines of a CORE-41 ledgerTotals source) and an account index.


// A fiscal-year start month as 1–12 (January when unset or invalid).
export function startMonthOf(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 1;
}

// The fiscal year containing `today` → { from, to } (inclusive ISO days): the company fiscal year (CORE-40, lib/ledger/periods.js), whose
// start month loadPortfolioFinancials reads from accounting_settings; the per-portfolio "Fiscal year starts" target is no longer used.
export function fiscalYearOf(today = new Date(), startMonth = 1) {
  const day = dayOf(today) || isoLocal(parseIso(today) || new Date());
  const { start, end } = fiscalYearRange(day, startMonthOf(startMonth));
  return { from: start, to: end };
}

// Fiscal year-to-date through `today`.
export function ytdOf(today = new Date(), startMonth = 1) {
  const day = dayOf(today) || isoLocal(new Date());
  return { from: fiscalYearOf(day, startMonth).from, to: day };
}

// The income statement plus NOI: income less the manager's fee income (4500, the manager's side of each fee) less expenses.
export function pnlSummary(lines, accounts, range = {}) {
  const pl = incomeStatement(lines, accounts, range);
  const feeId = accounts?.byKey?.get("management_fee_income")?.id;
  const feeIncome = round2(pl.income.filter((r) => r.id === feeId).reduce((s, r) => s + r.amount, 0));
  return { ...pl, feeIncome, noi: round2(pl.totalIncome - feeIncome - pl.totalExpense) };
}

// Property comparison: one pnlSummary per property plus the consolidated total of the same lines, so the columns sum to the total.
// `propertyIds` fixes the columns (and their order); null groups every line by its property, "" holding lines without one.
export function pnlByProperty(lines, accounts, range = {}, propertyIds = null) {
  const groups = new Map((propertyIds || []).map((id) => [id, []]));
  for (const l of lines || []) {
    const id = l.propertyId || "";
    if (propertyIds && !groups.has(id)) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(l);
  }
  const columns = [...groups]
    .map(([propertyId, rows]) => ({ propertyId, ...pnlSummary(rows, accounts, range) }))
    .filter((c) => c.propertyId || c.income.length || c.expenses.length);
  const total = pnlSummary([...groups.values()].flat(), accounts, range);
  return { columns, total };
}

// An annual target pro-rated to the elapsed share of its fiscal year (days through `to`, inclusive).
export function proRatedTarget(annual, fiscalYear, to) {
  const total = (daysBetweenIso(fiscalYear.from, fiscalYear.to) ?? 0) + 1;
  const elapsed = Math.min(total, Math.max(0, (daysBetweenIso(fiscalYear.from, to) ?? -1) + 1));
  return total > 0 ? round2((Number(annual) || 0) * (elapsed / total)) : 0;
}

// Delinquent balance as a percent of the monthly rent roll; null without a rent roll.
export const delinquencyPct = (delinquent, rentRoll) => (Number(rentRoll) > 0 ? round2(((Number(delinquent) || 0) / Number(rentRoll)) * 100) : null);

// The portfolio's NOI and delinquency targets against actuals: { noi, delinquency }, each null when its target isn't set.
// NOI YTD meets the target when it reaches the annual target pro-rated to today; delinquency is within it at or under the max %.
export function targetChecks({ targets = {}, fiscalYear, ytd, noi = 0, delinquent = 0, rentRoll = 0 } = {}) {
  const annual = Number(targets.targetNoi) || 0;
  const max = targets.maxDelinquencyPct === "" || targets.maxDelinquencyPct == null ? null : Number(targets.maxDelinquencyPct);
  const pct = delinquencyPct(delinquent, rentRoll);
  const expected = annual > 0 && fiscalYear && ytd ? proRatedTarget(annual, fiscalYear, ytd.to) : 0;
  return {
    noi: annual > 0 ? { annual, expected, actual: round2(noi), gap: round2(noi - expected), met: round2(noi) >= expected } : null,
    delinquency: Number.isFinite(max) ? { max, pct, amount: round2(delinquent), rentRoll: round2(rentRoll), met: pct === null ? round2(delinquent) <= 0 : pct <= max } : null,
  };
}
