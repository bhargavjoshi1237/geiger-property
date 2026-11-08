import { makeEntityData } from "./entity_factory";
import { arByLease, arByTenant } from "./receivables";
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

// Rent accounts with the lease's current rent, the policy due day and `balance`: the lease's tenant AR (else the tenant's), 0 without ledger activity (CORE-07).
export async function listRentAccountsWithBalances() {
  const [rows, byLease, byTenant, leases, properties, company] = await Promise.all([
    rentAccountsLayer.list(),
    arByLease(),
    arByTenant(),
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
    const balance = r.leaseId ? byLease?.get(r.leaseId) : r.tenantId ? byTenant?.get(r.tenantId) : 0;
    return { ...r, rent: lease ? Number(lease.rent) || 0 : 0, dueDay: Number(policies.rentDueDay) || 1, leaseStatus: lease?.status || "", balance: balance || 0 };
  });
}
