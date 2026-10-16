import { makeEntityData } from "./entity_factory";

// Data-access layer for Recurring Charges — scheduled tenant charges beyond base rent (owns `property.recurring_charges`).
export const recurringChargesLayer = makeEntityData({
  table: "recurring_charges",
  tag: "recurringCharges",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "amount", col: "amount", type: "number" },
    { key: "frequency", col: "frequency", type: "text" },
    { key: "nextDate", col: "next_date", type: "date" },
    { key: "account", col: "account", type: "text" },
    { key: "glAccountId", col: "gl_account_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const recurringChargesData = recurringChargesLayer.data;
