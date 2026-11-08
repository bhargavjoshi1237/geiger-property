import { makeEntityData } from "./entity_factory";

// Data-access layer for Security Deposits (owns `property.security_deposits`).
// Itemized deductions and the disposition live in metadata; the dates the
// return-deadline tracking filters on are real columns; ledger links are server-written (CORE-04).
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
    { key: "kind", col: "kind", type: "text", default: "Security deposit" },
    { key: "interestBearing", col: "interest_bearing", type: "bool" },
    // Ledger links (CORE-04), written only by the /api/billing/deposits routes.
    { key: "chargeEntryId", col: "charge_entry_id", type: "uuid" },
    { key: "applyEntryId", col: "apply_entry_id", type: "uuid" },
    { key: "refundBillId", col: "refund_bill_id", type: "uuid" },
  ],
});

export const securityDepositsData = securityDepositsLayer.data;

export const listLeaseDeposits = (leaseId) => securityDepositsLayer.list({ leaseId });
