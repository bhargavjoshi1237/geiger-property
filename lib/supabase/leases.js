import { makeEntityData } from "./entity_factory";

// Data-access layer for Leasing (owns `property.leases`). Thin config over the
// shared entity-data factory; lifecycle dates are real columns so lists,
// reports and scheduled jobs can filter on them.
export const leasesLayer = makeEntityData({
  table: "leases",
  tag: "leases",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "rent", col: "rent", type: "number" },
    { key: "deposit", col: "deposit", type: "number" },
    { key: "termStart", col: "term_start", type: "date" },
    { key: "termEnd", col: "term_end", type: "date" },
    { key: "leaseType", col: "lease_type", type: "text", default: "residential" },
    { key: "termType", col: "term_type", type: "text", default: "fixed" },
    { key: "signedDate", col: "signed_date", type: "date" },
    { key: "moveInDate", col: "move_in_date", type: "date" },
    { key: "noticeDate", col: "notice_date", type: "date" },
    { key: "moveOutDate", col: "move_out_date", type: "date" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "templateId", col: "template_id", type: "uuid" },
    { key: "renewalOfId", col: "renewal_of_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const leasesData = leasesLayer.data;

export const getLease = (id) => leasesLayer.get(id);
export const listLeasesForUnit = (unitId) => leasesLayer.list({ unitId });
export const listLeasesForTenant = (tenantId) => leasesLayer.list({ tenantId });
// Leases created by renewing `leaseId` (the renewal chain, newest first).
export const listRenewalLeases = (leaseId) => leasesLayer.list({ renewalOfId: leaseId });
