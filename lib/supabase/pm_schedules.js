import { makeEntityData } from "./entity_factory";

// Data-access layer for Preventive & Recurring — maintenance schedules that spawn work orders (owns `property.pm_schedules`).
export const pmSchedulesLayer = makeEntityData({
  table: "pm_schedules",
  tag: "pmSchedules",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "category", col: "category", type: "text" },
    { key: "frequency", col: "frequency", type: "text" },
    { key: "nextDue", col: "next_due", type: "date" },
    { key: "vendorId", col: "vendor_id", type: "uuid" },
    { key: "vendorName", col: "vendor_name", type: "text" },
    { key: "estimatedCost", col: "estimated_cost", type: "number" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const pmSchedulesData = pmSchedulesLayer.data;

export const getPmSchedule = (id) => pmSchedulesLayer.get(id);
export const listPmSchedulesForProperty = (propertyId) => pmSchedulesLayer.list({ propertyId });
export const listPmSchedulesForUnit = (unitId) => pmSchedulesLayer.list({ unitId });
