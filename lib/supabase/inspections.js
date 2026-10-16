import { makeEntityData } from "./entity_factory";

// Data-access layer for Inspections (owns `property.inspections`): kind =
// move_in | move_out | routine | annual | drive_by; rooms → items live in metadata.
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
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "leaseName", col: "lease_name", type: "text" },
    { key: "moveId", col: "move_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "kind", col: "kind", type: "text" },
    { key: "status", col: "status", type: "text", default: "Scheduled" },
  ],
});

export const inspectionsData = inspectionsLayer.data;

export const listLeaseInspections = (leaseId) => inspectionsLayer.list({ leaseId });
export const listUnitInspections = (unitId) => inspectionsLayer.list({ unitId });
