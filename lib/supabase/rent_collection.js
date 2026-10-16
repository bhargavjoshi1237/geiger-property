import { makeEntityData } from "./entity_factory";
import { receivableByParty } from "./ledger";

// Data-access layer for Rent Collection (owns `property.rent_accounts`). Each
// row is a rent-roll obligation. Balances come from the general ledger (AR by
// lease, else by tenant); older rows may still carry metadata charges[]/payments[].
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

// Rent accounts joined with their ledger receivable as `ledgerBalance` (left
// undefined when the lease/tenant has no ledger activity, so legacy rows fall
// back to their metadata lists in balanceOf()).
export async function listRentAccountsWithBalances() {
  const [rows, byLease, byTenant] = await Promise.all([
    rentAccountsLayer.list(),
    receivableByParty("leaseId"),
    receivableByParty("tenantId"),
  ]);
  if (!rows) return null;
  return rows.map((r) => {
    if (r.leaseId && byLease?.has(r.leaseId)) return { ...r, ledgerBalance: byLease.get(r.leaseId) };
    if (!r.leaseId && r.tenantId && byTenant?.has(r.tenantId)) return { ...r, ledgerBalance: byTenant.get(r.tenantId) };
    return r;
  });
}
