import { delinquentAging } from "@/lib/ledger/ar_reads";
import { loadFiscalStartMonth, loadLedgerTotals } from "./ledger_load";
import { fiscalYearOf, ytdOf } from "./portfolio";
import { portfolioPropertyIds } from "./scope";

// A portfolio's ledger figures (CORE-43), isomorphic like ledger_load.js: fiscal year-to-date totals for its current member properties
// (the CORE-41 aggregates, one grain-"range" read) and the delinquent leases on them (CORE-07's aging, the Delinquency report's rows).
// `scope` narrows a query to the project (scopeQuery in the browser, (q) => forProject(q, id) on the server). Throws on failure.
// The year is the company fiscal year (CORE-40) unless a caller passes startMonth.
export async function loadPortfolioFinancials(sb, projectId, scope, { portfolioId, properties, startMonth = null, today = new Date() } = {}) {
  const ids = portfolioPropertyIds(portfolioId, properties);
  startMonth = startMonth ?? (await loadFiscalStartMonth(sb, projectId));
  const fiscalYear = fiscalYearOf(today, startMonth);
  const ytd = ytdOf(today, startMonth);
  if (!ids.length) return { ids, fiscalYear, ytd, totals: null, delinquent: [] };
  const totals = await loadLedgerTotals(sb, projectId, { ...ytd, grain: "range", propertyIds: ids });
  const delinquent = (await delinquentAging(sb, scope, totals.accounts, ytd.to)).filter((r) => ids.includes(r.propertyId));
  return { ids, fiscalYear, ytd, totals, delinquent };
}
