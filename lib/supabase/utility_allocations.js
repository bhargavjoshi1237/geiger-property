import { makeEntityData } from "./entity_factory";

// Data-access layer for RUBS utility billing (owns `property.utility_allocations`):
// one utility bill split across a property's leases by sqft, occupants or
// equal share. Per-lease shares live in metadata.shares.
export const utilityAllocationsLayer = makeEntityData({
  table: "utility_allocations",
  tag: "utilityAllocations",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "billId", col: "bill_id", type: "uuid" },
    { key: "glAccountId", col: "gl_account_id", type: "uuid" },
    { key: "utility", col: "utility", type: "text" },
    { key: "periodStart", col: "period_start", type: "date" },
    { key: "periodEnd", col: "period_end", type: "date" },
    { key: "chargeDate", col: "charge_date", type: "date" },
    { key: "totalAmount", col: "total_amount", type: "number" },
    { key: "method", col: "method", type: "text", default: "sqft" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const utilityAllocationsData = utilityAllocationsLayer.data;
