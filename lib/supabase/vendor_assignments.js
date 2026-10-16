import { makeEntityData } from "./entity_factory";

// Data-access layer for vendor assignments (owns `property.vendor_assignments`).
// Thin config over the shared entity-data factory.
export const vendorAssignmentsLayer = makeEntityData({
  table: "vendor_assignments",
  tag: "vendor_assignments",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "vendorName", col: "vendor_name", type: "text" },
    { key: "workOrderLabel", col: "work_order_label", type: "text" },
    { key: "scheduledDate", col: "scheduled_date", type: "date" },
    { key: "vendorId", col: "vendor_id", type: "uuid" },
    { key: "workOrderId", col: "work_order_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Assigned" },
  ],
});

export const vendorAssignmentsData = vendorAssignmentsLayer.data;
