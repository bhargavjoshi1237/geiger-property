"use client";

import { indexAccounts } from "@/lib/ledger/postings";
import { listLedger, listLedgerAccounts } from "@/lib/supabase/ledger";
import { createClient } from "@/lib/supabase/client";
import { getActiveProjectId } from "@/lib/supabase/scope";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { listPortfolios } from "@/lib/supabase/portfolios";
import { listTenants } from "@/lib/supabase/tenants";
import { leasesLayer } from "@/lib/supabase/leases";
import { ownersLayer } from "@/lib/supabase/owners";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { propertyOwnersLayer } from "@/lib/supabase/property_owners";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { securityDepositsLayer } from "@/lib/supabase/security_deposits";
import { bankAccountsLayer } from "@/lib/supabase/bank_accounts";
import { prospectsLayer } from "@/lib/supabase/prospects";
import { showingsLayer } from "@/lib/supabase/showings";
import { applicationsLayer } from "@/lib/supabase/applications";
import { renewalsLayer } from "@/lib/supabase/renewals";
import { complianceByOwner } from "@/lib/supabase/compliance";
import { billsLayer } from "@/lib/supabase/bills";
import { movesLayer } from "@/lib/supabase/moves";
import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { budgetsLayer } from "@/lib/supabase/budgets";
import { budgetLinesLayer } from "@/lib/supabase/budget_lines";
import { bankReconciliationsLayer } from "@/lib/supabase/bank_reconciliations";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import { automationRunsLayer } from "@/lib/supabase/automation_runs";
import { emptyTotals } from "./aggregates";
import { loadBudgets } from "./budget_load";
import { loadLedgerColumns, loadLedgerTotals, loadLedgerWindow } from "./ledger_load";
import { emptySource, isSkipped, paramsKey } from "./source_params";
import { redactSensitive } from "@/lib/screening/sensitive";

// Browser loaders for report sources (through the data layers). Each resolves to
// rows ([] when unavailable); "ledger" resolves to { lines, accounts } (bounded by
// its params when given) and "ledgerTotals" to server-side totals (CORE-41).
// Row lists pass the screening deny-list (RISK-02) before any report or export sees them.

async function loadLedger(params) {
  if (params) return isSupabaseConfigured() ? loadLedgerWindow(createClient(), getActiveProjectId(), params) : null;
  const [lines, accounts] = await Promise.all([listLedger({}), listLedgerAccounts()]);
  return { lines: lines || [], accounts: accounts || indexAccounts([]) };
}

const loadTotals = (params) => (isSupabaseConfigured() ? loadLedgerTotals(createClient(), getActiveProjectId(), params) : null);
const loadColumns = (params) => (isSupabaseConfigured() ? loadLedgerColumns(createClient(), getActiveProjectId(), params) : null);

// Budgets: with params the budgets and monthly lines of the range's years (CORE-44), else the budget rows.
function loadBudgetSource(params) {
  if (!params) return budgetsLayer.list();
  return isSupabaseConfigured() ? loadBudgets(createClient(), getActiveProjectId(), params) : null;
}

async function loadCompliance() {
  const [tenantInsurance, vendorCoi, vendorLicense] = await Promise.all([
    complianceByOwner("tenant", "insurance_policy"),
    complianceByOwner("vendor", "insurance_policy"),
    complianceByOwner("vendor", "license"),
  ]);
  return { tenantInsurance, vendorCoi, vendorLicense };
}

// Every loader takes the source's params (most ignore them).
export const CLIENT_SOURCES = {
  ledger: loadLedger,
  ledgerTotals: loadTotals,
  ledgerColumns: loadColumns,
  properties: listProperties,
  portfolios: listPortfolios,
  units: listUnits,
  leases: () => leasesLayer.list(),
  tenants: listTenants,
  owners: () => ownersLayer.list(),
  vendors: () => vendorsLayer.list(),
  propertyOwners: () => propertyOwnersLayer.list(),
  workOrders: () => workOrdersLayer.list(),
  deposits: () => securityDepositsLayer.list(),
  bankAccounts: () => bankAccountsLayer.list(),
  prospects: () => prospectsLayer.list(),
  showings: () => showingsLayer.list(),
  applications: () => applicationsLayer.list(),
  renewals: () => renewalsLayer.list(),
  bills: () => billsLayer.list(),
  moves: () => movesLayer.list(),
  unitTurns: () => unitTurnsLayer.list(),
  budgets: loadBudgetSource,
  budgetLines: () => budgetLinesLayer.list(),
  bankReconciliations: () => bankReconciliationsLayer.list(),
  rentAccounts: () => rentAccountsLayer.list(),
  automationRuns: () => automationRunsLayer.list(),
  compliance: loadCompliance,
};

// What a source resolves to when skipped or when it can't load (source_params.emptySource).
const fallback = emptySource;

// The params key each loaded bag was fetched with, per source (kept off the bag itself).
const LOADED_WITH = new WeakMap();

// Every source a report needs (plus properties for the filter), in parallel. `params` is { [sourceKey]: params }; pass the
// previous bag as `previous` and only the sources whose params changed are fetched again.
export async function loadReportSources(keys, params = {}, previous = null) {
  const wanted = [...new Set(["properties", ...keys])];
  const before = (previous && LOADED_WITH.get(previous)) || {};
  const loadedWith = {};
  const results = await Promise.all(
    wanted.map((k) => {
      const key = paramsKey(params[k]);
      loadedWith[k] = key;
      if (previous && k in previous && before[k] === key) return previous[k];
      if (isSkipped(params[k])) return fallback(k, params[k]);
      return Promise.resolve()
        .then(() => CLIENT_SOURCES[k]?.(params[k]))
        .then((v) => (Array.isArray(v) ? v.map(redactSensitive) : v ?? fallback(k, params[k])))
        .catch((e) => {
          console.error(`[reports.${k}]`, e?.message || e);
          return fallback(k, params[k], e);
        });
    }),
  );
  const bag = Object.fromEntries(wanted.map((k, i) => [k, results[i] ?? fallback(k, params[k])]));
  LOADED_WITH.set(bag, loadedWith);
  return bag;
}
