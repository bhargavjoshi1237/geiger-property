import { makeEntityData } from "./entity_factory";

// Data-access layer for Online Payments (owns `property.online_payments`,
// `property.autopay_plans`, `property.stripe_events`). Rows are written by the
// Stripe server code (lib/payments/*); the browser only reads them here.

export const onlinePaymentsLayer = makeEntityData({
  table: "online_payments",
  tag: "onlinePayments",
  fields: [
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "autopayPlanId", col: "autopay_plan_id", type: "uuid" },
    { key: "description", col: "description", type: "text" },
    { key: "payerName", col: "payer_name", type: "text" },
    { key: "payerEmail", col: "payer_email", type: "text" },
    { key: "source", col: "source", type: "text", default: "portal" },
    { key: "method", col: "method", type: "text" },
    { key: "methodLabel", col: "method_label", type: "text" },
    { key: "status", col: "status", type: "text", default: "pending" },
    { key: "amount", col: "amount", type: "number" },
    { key: "convenienceFee", col: "convenience_fee", type: "number" },
    { key: "processorFee", col: "processor_fee", type: "number" },
    { key: "total", col: "total", type: "number" },
    { key: "refundedAmount", col: "refunded_amount", type: "number" },
    { key: "linkToken", col: "link_token", type: "text" },
    { key: "linkExpiresAt", col: "link_expires_at", type: "text" },
    { key: "stripePaymentIntentId", col: "stripe_payment_intent_id", type: "text" },
    { key: "stripeChargeId", col: "stripe_charge_id", type: "text" },
    { key: "ledgerEntryId", col: "ledger_entry_id", type: "uuid" },
    { key: "feeEntryId", col: "fee_entry_id", type: "uuid" },
    { key: "nsfEntryId", col: "nsf_entry_id", type: "uuid" },
    { key: "paidAt", col: "paid_at", type: "text" },
    { key: "failedAt", col: "failed_at", type: "text" },
    { key: "returnedAt", col: "returned_at", type: "text" },
    { key: "returnReason", col: "return_reason", type: "text" },
    { key: "payoutId", col: "payout_id", type: "text" },
    { key: "payoutArrivalDate", col: "payout_arrival_date", type: "date" },
  ],
});

export const autopayPlansLayer = makeEntityData({
  table: "autopay_plans",
  tag: "autopayPlans",
  fields: [
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "tenantId", col: "tenant_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "name", col: "name", type: "text" },
    { key: "payerEmail", col: "payer_email", type: "text" },
    { key: "status", col: "status", type: "text", default: "pending_setup" },
    { key: "amountMode", col: "amount_mode", type: "text", default: "balance" },
    { key: "fixedAmount", col: "fixed_amount", type: "number" },
    { key: "maxAmount", col: "max_amount", type: "number" },
    { key: "chargeDay", col: "charge_day", type: "number" },
    { key: "method", col: "method", type: "text" },
    { key: "methodLabel", col: "method_label", type: "text" },
    { key: "lastRunOn", col: "last_run_on", type: "date" },
    { key: "lastStatus", col: "last_status", type: "text" },
    { key: "lastError", col: "last_error", type: "text" },
    { key: "failureCount", col: "failure_count", type: "number" },
    { key: "activatedAt", col: "activated_at", type: "text" },
  ],
});

export const stripeEventsLayer = makeEntityData({
  table: "stripe_events",
  tag: "stripeEvents",
  fields: [
    { key: "eventId", col: "event_id", type: "text" },
    { key: "eventType", col: "event_type", type: "text" },
    { key: "livemode", col: "livemode", type: "bool" },
    { key: "objectId", col: "object_id", type: "text" },
    { key: "status", col: "status", type: "text" },
    { key: "error", col: "error", type: "text" },
    { key: "processedAt", col: "processed_at", type: "text" },
  ],
});

export const listOnlinePayments = (where) => onlinePaymentsLayer.list(where);
export const listLeaseOnlinePayments = (leaseId) => onlinePaymentsLayer.list({ leaseId });
export const listTenantOnlinePayments = (tenantId) => onlinePaymentsLayer.list({ tenantId });
export const listAutopayPlans = (where) => autopayPlansLayer.list(where);
export const listStripeEvents = () => stripeEventsLayer.list();
