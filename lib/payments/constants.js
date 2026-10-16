// Online-payments config (isomorphic, plain data): the per-project settings key,
// its defaults, method labels and the payment / autopay status sets. No I/O.

export const PAYMENT_SETTINGS_KEY = "online_payments";

export const PAYMENT_SETTINGS_DEFAULTS = {
  // Master switch for card / ACH collection through Stripe.
  enabled: true,
  // Add the Fees & Policies card fee / ACH fee as a separate "Convenience fee" line.
  passFees: true,
  // Bank account whose cash GL receives online payments ("" = Trust Cash).
  depositBankAccountId: "",
  // Up to 22 characters shown on the payer's statement.
  statementDescriptor: "",
  // Credit ACH payments when submitted (reversed if they come back) instead of on settlement.
  achCreditOnSubmit: false,
  // Offer saving the payment method at checkout.
  allowSaveMethod: true,
  // Largest single online payment (0 = no limit).
  maxPaymentAmount: 0,
  // Autopay: charge the open balance on the rent due day.
  autopayEnabled: true,
  autopayDayOffset: 0,
  // Pause autopay after this many failed attempts in a row.
  autopayMaxFailures: 2,
  // Returned payments: switch the tenant to certified funds after this many (0 = never).
  certifiedAfterReturns: 2,
  // Email the tenant a receipt when a payment settles.
  sendReceipts: true,
};

export const withPaymentDefaults = (stored) => ({
  ...PAYMENT_SETTINGS_DEFAULTS,
  ...(stored && typeof stored === "object" ? stored : {}),
});

// Policy method keys (lib/policies.js paymentMethods) → Stripe payment method types.
export const ONLINE_METHODS = {
  card: { label: "Card", stripeType: "card", ledgerLabel: "Card" },
  ach: { label: "Bank account (ACH)", stripeType: "us_bank_account", ledgerLabel: "ACH" },
};

export const methodFromStripeType = (type) =>
  type === "us_bank_account" ? "ach" : type === "card" ? "card" : type || "";

export const PAYMENT_STATUS_MAP = {
  link_sent: { label: "Link sent", variant: "info", dotClass: "bg-sky-400" },
  pending: { label: "Pending", variant: "neutral", dotClass: "bg-text-tertiary" },
  processing: { label: "Processing", variant: "warning", dotClass: "bg-amber-400" },
  succeeded: { label: "Paid", variant: "success", dotClass: "bg-emerald-400" },
  partially_refunded: { label: "Partly refunded", variant: "info", dotClass: "bg-sky-400" },
  refunded: { label: "Refunded", variant: "neutral", dotClass: "bg-text-tertiary" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
  returned: { label: "Returned", variant: "danger", dotClass: "bg-red-400" },
  disputed: { label: "Disputed", variant: "danger", dotClass: "bg-red-400" },
  canceled: { label: "Canceled", variant: "neutral", dotClass: "bg-text-tertiary" },
  expired: { label: "Expired", variant: "neutral", dotClass: "bg-text-tertiary" },
};

export const AUTOPAY_STATUS_MAP = {
  pending_setup: { label: "Awaiting setup", variant: "warning", dotClass: "bg-amber-400" },
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
  canceled: { label: "Canceled", variant: "neutral", dotClass: "bg-text-tertiary" },
};

export const PAYMENT_SOURCE_LABELS = {
  portal: "Resident portal",
  staff_link: "Payment link",
  staff_checkout: "Taken by staff",
  autopay: "Autopay",
};

// Payment statuses that hold money (count toward collected).
export const COLLECTED_STATUSES = ["succeeded", "partially_refunded"];
