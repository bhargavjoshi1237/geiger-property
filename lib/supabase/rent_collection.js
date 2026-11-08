import { makeEntityData } from "./entity_factory";
import { receivableByParty } from "./ledger";
import { leasesLayer } from "./leases";
import { listProperties } from "./properties";
import { getSetting } from "./settings";
import { effectivePolicies } from "@/lib/policies";

// Data layer for Rent Collection (owns `property.rent_accounts`, the collection record per lease); rent comes from the lease's schedule, the due day from policy (CORE-01).
export const rentAccountsLayer = makeEntityData({
  table: "rent_accounts",
  tag: "rentAccounts",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "rent", col: "rent", type: "number" },
    { key: "dueDay", col: "due_day", type: "number", default: 1 },
    { key: "frequency", col: "frequency", type: "text", default: "Monthly" },
    { key: "autopay", col: "autopay", type: "bool" },
    { key: "paymentMethod", col: "payment_method", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Due" },
  ],
});

export const rentAccountsData = rentAccountsLayer.data;

// Rent accounts with the lease's current rent, the policy due day and the ledger receivable as `ledgerBalance` (unset without ledger activity, so balanceOf() falls back).
export async function listRentAccountsWithBalances() {
  const [rows, byLease, byTenant, leases, properties, company] = await Promise.all([
    rentAccountsLayer.list(),
    receivableByParty("leaseId"),
    receivableByParty("tenantId"),
    leasesLayer.list(),
    listProperties(),
    getSetting("fees_policies", {}),
  ]);
  if (!rows) return null;
  const leaseById = new Map((leases || []).map((l) => [l.id, l]));
  const propertyById = new Map((properties || []).map((p) => [p.id, p]));
  return rows.map((r) => {
    const lease = leaseById.get(r.leaseId) || null;
    const property = propertyById.get(r.propertyId || lease?.propertyId) || null;
    const policies = effectivePolicies({ company: company || {}, property, lease });
    const out = { ...r, rent: lease ? Number(lease.rent) || 0 : 0, dueDay: Number(policies.rentDueDay) || 1, leaseStatus: lease?.status || "" };
    if (r.leaseId && byLease?.has(r.leaseId)) return { ...out, ledgerBalance: byLease.get(r.leaseId) };
    if (!r.leaseId && r.tenantId && byTenant?.has(r.tenantId)) return { ...out, ledgerBalance: byTenant.get(r.tenantId) };
    return out;
  });
}
