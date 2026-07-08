import { makeEntityData } from "./entity_factory";

// Data-access layer for Maintenance (owns `property.work_orders`). Also backs the
// Work Orders (kind='work_order'), Maintenance Requests (kind='request'), and
// Mobile Maintenance (is_field=true) lenses. Thin config over the shared
// entity-data factory.
export const workOrdersLayer = makeEntityData({
  table: "work_orders",
  tag: "work_orders",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "kind", col: "kind", type: "text", default: "work_order" },
    { key: "isField", col: "is_field", type: "bool" },
    { key: "propertyLabel", col: "property_label", type: "text" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "category", col: "category", type: "text" },
    { key: "priority", col: "priority", type: "text", default: "Medium" },
    { key: "status", col: "status", type: "text", default: "Open" },
    { key: "vendorName", col: "vendor_name", type: "text" },
    { key: "technician", col: "technician", type: "text" },
    { key: "scheduledDate", col: "scheduled_date", type: "date" },
    { key: "laborCost", col: "labor_cost", type: "number" },
    { key: "materialCost", col: "material_cost", type: "number" },
    { key: "totalCost", col: "total_cost", type: "number" },
  ],
});

export const workOrdersData = workOrdersLayer.data;
