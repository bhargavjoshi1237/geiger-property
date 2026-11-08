import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery } from "./scope";
import { listLedgerAccounts } from "./ledger";
import { arMonthlyRows, delinquentAging, partyReceivables } from "@/lib/ledger/ar_reads";
import { isoLocal } from "@/lib/reports/periods";

// Browser data layer for tenant receivables (CORE-07): every balance a screen shows is the ledger's tenant AR
// (ledger_party_balances), the monthly trend is ledger_ar_monthly. Pure: null on failure, never throws or toasts.

const fail = (tag, e) => {
  console.error(`[receivables.${tag}]`, e?.message || e);
  return null;
};

async function read(tag, run) {
  if (!isSupabaseConfigured()) return null;
  try {
    return await run(createClient());
  } catch (e) {
    return fail(tag, e);
  }
}

// Map leaseId → tenant AR balance.
export const arByLease = () => read("byLease", (sb) => partyReceivables(sb, scopeQuery, "lease"));

// Map tenantId → tenant AR balance (every lease of theirs).
export const arByTenant = () => read("byTenant", (sb) => partyReceivables(sb, scopeQuery, "tenant"));

// Monthly AR rows ({ propertyId, leaseId, tenantId, month, charged, collected, credited, transferred, net }) from / to a day, optionally one property.
export const arMonthly = ({ from, to, propertyId } = {}) => read("monthly", (sb) => arMonthlyRows(sb, scopeQuery, { from, to, propertyId }));

// Delinquent leases on a day (default today), aged from their AR lines like the Delinquency report.
export const delinquentLeases = (asOf) =>
  read("delinquent", async (sb) => {
    const accounts = await listLedgerAccounts();
    return delinquentAging(sb, scopeQuery, accounts, asOf || isoLocal(new Date()));
  });

// Tenants with `balance` set from the ledger (0 without AR activity).
export async function withTenantBalances(tenants) {
  if (!tenants) return tenants;
  const byTenant = (await arByTenant()) || new Map();
  return tenants.map((t) => ({ ...t, balance: byTenant.get(t.id) || 0 }));
}
