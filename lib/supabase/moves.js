import { makeEntityData } from "./entity_factory";

// Data-access layer for Moves (owns `property.moves`). Backs both the Move-in
// (kind = "in") and Move-out (kind = "out") lenses.
export const movesLayer = makeEntityData({
  table: "moves",
  tag: "moves",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "kind", col: "kind", type: "text", default: "in" },
    { key: "moveDate", col: "move_date", type: "date" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "leaseName", col: "lease_name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "inspectionId", col: "inspection_id", type: "uuid" },
    { key: "depositId", col: "deposit_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Scheduled" },
  ],
});

export const movesData = movesLayer.data;

export const listLeaseMoves = (leaseId) => movesLayer.list({ leaseId });
