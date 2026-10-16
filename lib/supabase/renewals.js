import { makeEntityData } from "./entity_factory";

// Data-access layer for Renewals — lease renewal offers and rent increases (owns `property.renewals`).
export const renewalsLayer = makeEntityData({
  table: "renewals",
  tag: "renewals",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "currentRent", col: "current_rent", type: "number" },
    { key: "proposedRent", col: "proposed_rent", type: "number" },
    { key: "currentEnd", col: "current_end", type: "date" },
    { key: "newStart", col: "new_start", type: "date" },
    { key: "newEnd", col: "new_end", type: "date" },
    { key: "status", col: "status", type: "text", default: "Not started" },
  ],
});

export const renewalsData = renewalsLayer.data;
