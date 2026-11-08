import { listProperties } from "@/lib/supabase/properties";
import { portfolioFinancials } from "@/lib/supabase/portfolios";
import { ledgerTotalsLines } from "@/lib/reports/aggregates";
import { pnlByProperty, pnlSummary, targetChecks } from "@/lib/reports/portfolio";
import { formatIso } from "@/lib/reports/periods";
import { loadScopeData, scopeKpis } from "@/components/internal/screens/properties/joins";
import { currency } from "@/components/internal/screens/properties/constants";

// Portfolio editor data: the member rollup (properties.portfolio_id) and its ledger financials (CORE-43), shared by the Overview,
// Properties and Financials sections.

// Member properties with their own KPIs.
export async function loadRollup(portfolioId) {
  const [properties, all] = await Promise.all([listProperties(), loadScopeData()]);
  const members = (properties || []).filter((p) => p.portfolioId === portfolioId);
  const rows = members.map((p) => ({ ...p, kpis: scopeKpis(all, { propertyIds: [p.id] }).kpis }));
  const total = scopeKpis(all, { propertyIds: members.map((p) => p.id) });
  return { properties: properties || [], members: rows, total };
}

export const targetsOf = (item) => item?.metadata?.targets || item?.targets || {};

const sumBy = (rows, key) => Math.round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0) * 100) / 100;

// Fiscal year-to-date P&L, NOI per member and delinquency against the rent roll; null when the ledger can't load.
export async function loadFinancials(portfolioId, rollup, startMonth) {
  const fin = await portfolioFinancials({ portfolioId, properties: rollup.properties, startMonth });
  if (!fin) return null;
  const { ids, fiscalYear, ytd, totals, delinquent } = fin;
  const lines = totals ? ledgerTotalsLines(totals) : [];
  const accounts = totals?.accounts || { byId: new Map(), byKey: new Map(), list: [] };
  const pnl = pnlSummary(lines, accounts, ytd);
  const owed = new Map();
  for (const r of delinquent) owed.set(r.propertyId, (owed.get(r.propertyId) || 0) + (Number(r.balance) || 0));
  const comparison = pnlByProperty(lines, accounts, ytd, ids);
  const byProperty = rollup.members.map((m) => {
    const c = comparison.columns.find((x) => x.propertyId === m.id) || { totalIncome: 0, totalExpense: 0, noi: 0 };
    return { id: m.id, name: m.name, income: c.totalIncome, expenses: c.totalExpense, noi: c.noi, delinquent: Math.round((owed.get(m.id) || 0) * 100) / 100, rentRoll: m.kpis.rentRoll };
  });
  return { fiscalYear, ytd, pnl, byProperty, delinquent: sumBy(byProperty, "delinquent"), delinquentLeases: delinquent.length, rentRoll: rollup.total.kpis.rentRoll, any: totals?.any ?? false };
}

// The NOI and delinquency target checks for loaded financials and the portfolio's current targets.
export const financialChecks = (fin, targets) =>
  fin ? targetChecks({ targets, fiscalYear: fin.fiscalYear, ytd: fin.ytd, noi: fin.pnl.noi, delinquent: fin.delinquent, rentRoll: fin.rentRoll }) : { noi: null, delinquency: null };

// Overview "Needs attention" items for missed NOI and delinquency targets.
export function targetAlerts(fin, checks) {
  const out = [];
  const noi = checks?.noi;
  const dq = checks?.delinquency;
  if (noi && !noi.met) {
    out.push({ key: "noi", label: `NOI ${currency(noi.actual)} is below the ${currency(noi.expected)} target to date`, detail: `${currency(noi.annual)} a year, pro-rated through ${formatIso(fin.ytd.to)}`, tone: "warning", section: "financials" });
  }
  if (dq && !dq.met) {
    const label = dq.pct === null ? `${currency(dq.amount)} delinquent with no rent roll to measure it against` : `Delinquency ${dq.pct}% is above the ${dq.max}% limit`;
    out.push({ key: "delinquency", label, detail: `${currency(dq.amount)} owed against a ${currency(dq.rentRoll)} monthly rent roll`, tone: "danger", section: "financials" });
  }
  return out;
}
