"use client";

import { indexAccounts } from "@/lib/ledger/postings";
import { listLedger, listLedgerAccounts } from "@/lib/supabase/ledger";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
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

// Browser loaders for report sources (through the data layers). Each resolves to
// rows ([] when unavailable); "ledger" resolves to { lines, accounts }.

async function loadLedger() {
  const [lines, accounts] = await Promise.all([listLedger({}), listLedgerAccounts()]);
  return { lines: lines || [], accounts: accounts || indexAccounts([]) };
}

async function loadCompliance() {
  const [tenantInsurance, vendorCoi, vendorLicense] = await Promise.all([
    complianceByOwner("tenant", "insurance_policy"),
    complianceByOwner("vendor", "insurance_policy"),
    complianceByOwner("vendor", "license"),
  ]);
  return { tenantInsurance, vendorCoi, vendorLicense };
}

export const CLIENT_SOURCES = {
  ledger: loadLedger,
  properties: listProperties,
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
  compliance: loadCompliance,
};

// Every source a report needs (plus properties for the filter), in parallel.
export async function loadReportSources(keys) {
  const wanted = [...new Set(["properties", ...keys])];
  const results = await Promise.all(
    wanted.map((k) => Promise.resolve().then(() => CLIENT_SOURCES[k]?.()).catch(() => null)),
  );
  return Object.fromEntries(wanted.map((k, i) => [k, results[i] ?? (k === "ledger" ? loadLedgerEmpty() : [])]));
}

const loadLedgerEmpty = () => ({ lines: [], accounts: indexAccounts([]) });
