import { makeEntityData } from "./entity_factory";

// Data-access layer for Security Deposits (owns `property.security_deposits`).
// Itemized deductions and the disposition live in metadata; the dates the
// return-deadline tracking filters on are real columns.
export const securityDepositsLayer = makeEntityData({
  table: "security_deposits",
  tag: "securityDeposits",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "unit", col: "unit", type: "text" },
    { key: "amount", col: "amount", type: "number" },
    { key: "heldLocation", col: "held_location", type: "text" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "tenantName", col: "tenant_name", type: "text" },
    { key: "leaseName", col: "lease_name", type: "text" },
    { key: "moveId", col: "move_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "moveOutDate", col: "move_out_date", type: "date" },
    { key: "returnDue", col: "return_due", type: "date" },
    { key: "returnedOn", col: "returned_on", type: "date" },
    { key: "refundAmount", col: "refund_amount", type: "number" },
    { key: "status", col: "status", type: "text", default: "Held" },
  ],
});

export const securityDepositsData = securityDepositsLayer.data;

export const listLeaseDeposits = (leaseId) => securityDepositsLayer.list({ leaseId });
