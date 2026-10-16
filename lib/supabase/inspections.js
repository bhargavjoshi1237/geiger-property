import { makeEntityData } from "./entity_factory";

// Data-access layer for Move-in Inspection (owns `property.inspections`).
export const inspectionsLayer = makeEntityData({
  table: "inspections",
  tag: "inspections",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "inspector", col: "inspector", type: "text" },
    { key: "inspectionDate", col: "inspection_date", type: "date" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Scheduled" },
  ],
});

export const inspectionsData = inspectionsLayer.data;
