import { makeEntityData } from "./entity_factory";

// Data-access layer for the people on a lease (owns `property.lease_parties`):
// role = tenant | cosigner | guarantor | occupant.
export const leasePartiesLayer = makeEntityData({
  table: "lease_parties",
  tag: "leaseParties",
  order: { col: "created_at", ascending: true },
  fields: [
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "role", col: "role", type: "text", default: "tenant" },
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "phone", col: "phone", type: "text" },
    { key: "responsibilityPct", col: "responsibility_pct", type: "number" },
    { key: "isPrimary", col: "is_primary", type: "bool" },
  ],
});

export const listLeaseParties = (leaseId) => leasePartiesLayer.list({ leaseId });
export const listTenantLeaseParties = (tenantId) => leasePartiesLayer.list({ tenantId });
