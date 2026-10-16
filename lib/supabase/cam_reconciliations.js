import { makeEntityData } from "./entity_factory";

// Data-access layer for CAM reconciliations (owns `property.cam_reconciliations`):
// a commercial property's year of common-area costs vs the estimates billed to
// each lease. Per-lease shares live in metadata.shares.
export const camReconciliationsLayer = makeEntityData({
  table: "cam_reconciliations",
  tag: "camReconciliations",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "year", col: "year", type: "number" },
    { key: "budgetAmount", col: "budget_amount", type: "number" },
    { key: "actualAmount", col: "actual_amount", type: "number" },
    { key: "glAccountId", col: "gl_account_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const camReconciliationsData = camReconciliationsLayer.data;
