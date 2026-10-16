import { makeEntityData } from "./entity_factory";

// Data-access layer for Maintenance (owns `property.work_orders`). Also backs the
// Work Orders (kind='work_order'), Maintenance Requests (kind='request'), and
// Mobile Maintenance (is_field=true) lenses. Thin config over the shared
// entity-data factory; structured editor data (line items, approvals, status
// history, materials used…) lives in the metadata bag.
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
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "vendorId", col: "vendor_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "pmScheduleId", col: "pm_schedule_id", type: "uuid" },
    { key: "pmDueDate", col: "pm_due_date", type: "date" },
    { key: "unitTurnId", col: "unit_turn_id", type: "uuid" },
    { key: "inspectionId", col: "inspection_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Open" },
    { key: "vendorName", col: "vendor_name", type: "text" },
    { key: "technician", col: "technician", type: "text" },
    { key: "scheduledDate", col: "scheduled_date", type: "date" },
    { key: "laborCost", col: "labor_cost", type: "number" },
    { key: "materialCost", col: "material_cost", type: "number" },
    { key: "totalCost", col: "total_cost", type: "number" },
  ],
});

// Editor contract. Creates from the screen (new / duplicate) never carry the
// preventive occurrence key, so a copied PM work order can't collide with it.
export const workOrdersData = {
  ...workOrdersLayer.data,
  create: (input) => workOrdersLayer.create({ ...input, pmDueDate: "" }),
};

export const getWorkOrder = (id) => workOrdersLayer.get(id);
export const listWorkOrdersForUnit = (unitId) => workOrdersLayer.list({ unitId });
export const listWorkOrdersForProperty = (propertyId) => workOrdersLayer.list({ propertyId });
export const listWorkOrdersForVendor = (vendorId) => workOrdersLayer.list({ vendorId });
export const listWorkOrdersForTenant = (tenantId) => workOrdersLayer.list({ tenantId });
export const listWorkOrdersForSchedule = (pmScheduleId) => workOrdersLayer.list({ pmScheduleId });
export const listWorkOrdersForTurn = (unitTurnId) => workOrdersLayer.list({ unitTurnId });
export const listWorkOrdersForInspection = (inspectionId) => workOrdersLayer.list({ inspectionId });
