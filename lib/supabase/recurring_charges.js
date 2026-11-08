import { makeEntityData } from "./entity_factory";

// Data-access layer for Recurring Charges — scheduled tenant charges beyond base rent (owns `property.recurring_charges`); the billing job posts them (lib/billing/charges.js).
export const recurringChargesLayer = makeEntityData({
  table: "recurring_charges",
  tag: "recurringCharges",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "description", col: "description", type: "text" },
    { key: "chargeType", col: "charge_type", type: "text" },
    { key: "category", col: "category", type: "text" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "unit", col: "unit", type: "text" },
    { key: "amount", col: "amount", type: "number" },
    { key: "frequency", col: "frequency", type: "text", default: "Monthly" },
    { key: "nextDate", col: "next_date", type: "date" },
    { key: "endsOn", col: "ends_on", type: "date" },
    { key: "prorate", col: "prorate", type: "bool", default: false },
    { key: "billWithRent", col: "bill_with_rent", type: "bool", default: true },
    { key: "showInPortal", col: "show_in_portal", type: "bool", default: true },
    { key: "account", col: "account", type: "text" },
    { key: "glAccountId", col: "gl_account_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const recurringChargesData = recurringChargesLayer.data;
