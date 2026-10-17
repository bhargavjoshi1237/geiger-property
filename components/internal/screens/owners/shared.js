// Shared lookups and field sets for the Owners area. Plain data, no JSX.
// `meta: true` fields persist into the owner's metadata bag.

import {
  CONTACT_CHANNEL_OPTIONS,
  DELIVERY_OPTIONS,
  TIN_TYPE_OPTIONS,
  US_STATE_OPTIONS,
  addressFields,
  currency,
  formatDate,
  opts,
} from "@/components/internal/screens/people/shared";

export { filterOptions, selectOptions, currency, formatDate, todayISO } from "@/components/internal/screens/people/shared";

export const OWNER_STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Onboarding: { label: "Onboarding", variant: "info" },
  Inactive: { label: "Inactive", variant: "outline" },
};

export const ENTITY_TYPE_OPTIONS = opts("Individual", "Joint", "LLC", "Corporation", "Partnership", "Trust", "Estate", "Non-profit");
const isPerson = (i) => ["Individual", "Joint", "", undefined].includes(i?.metadata?.entityType);
const isTrust = (i) => ["Trust", "Estate"].includes(i?.metadata?.entityType);
const isBusiness = (i) => ["LLC", "Corporation", "Partnership", "Non-profit"].includes(i?.metadata?.entityType);

export const PAYOUT_METHOD_OPTIONS = opts("ACH", "Check", "Wire", "Hold");
export const PAYOUT_SCHEDULE_OPTIONS = opts("Monthly", "Twice monthly", "Quarterly", "On request");
export const TAX_CLASSIFICATION_OPTIONS = [
  { value: "Individual", label: "Individual / sole proprietor" },
  { value: "LLC", label: "LLC" },
  { value: "Partnership", label: "Partnership" },
  { value: "Corporation", label: "Corporation" },
  { value: "Trust", label: "Trust / estate" },
];

export const percent = (n) => `${Number(n) || 0}%`;
export const holdsPayouts = (o) => Boolean(o?.metadata?.holdPayouts) || o?.payoutMethod === "Hold";
export const needsW9 = (o) => o?.status !== "Inactive" && o?.metadata?.requires1099 !== false && !o?.metadata?.w9OnFile;

// Legacy property splits (pre property_owners) in metadata.properties = [{ id, label, pct }].
export const legacySplitsOf = (r) => (Array.isArray(r?.metadata?.properties) ? r.metadata.properties : []);

export const OWNER_PROFILE_FIELDS = [
  { key: "entityType", label: "Entity type", type: "select", meta: true, options: ENTITY_TYPE_OPTIONS },
  { key: "status", label: "Status", type: "select", options: Object.keys(OWNER_STATUS_MAP).map((k) => ({ value: k, label: k })) },
  { key: "name", label: "Display name", type: "text", required: true, hint: "Shown on statements and in pickers." },
  { key: "since", label: "Owner since", type: "date" },
  { key: "hPerson", label: "Person", type: "heading", showIf: isPerson },
  { key: "firstName", label: "First name", type: "text", meta: true, showIf: isPerson },
  { key: "lastName", label: "Last name", type: "text", meta: true, showIf: isPerson },
  { key: "coOwnerName", label: "Co-owner name", type: "text", meta: true, showIf: (i) => i?.metadata?.entityType === "Joint" },
  { key: "dateOfBirth", label: "Date of birth", type: "date", meta: true, showIf: isPerson },
  { key: "hBusiness", label: "Business", type: "heading", showIf: isBusiness },
  { key: "company", label: "Legal name", type: "text", showIf: (i) => isBusiness(i) || isTrust(i) },
  { key: "dba", label: "Doing business as", type: "text", meta: true, showIf: isBusiness },
  { key: "formationState", label: "State of formation", type: "select", meta: true, options: US_STATE_OPTIONS, showIf: isBusiness },
  { key: "signerName", label: "Authorized signer", type: "text", meta: true, showIf: isBusiness },
  { key: "signerTitle", label: "Signer title", type: "text", meta: true, showIf: isBusiness },
  { key: "hTrust", label: "Trust / estate", type: "heading", showIf: isTrust },
  { key: "trusteeName", label: "Trustee / executor", type: "text", meta: true, showIf: isTrust },
  { key: "trustDate", label: "Trust date", type: "date", meta: true, showIf: isTrust },
];

export const OWNER_CONTACT_FIELDS = [
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "altEmail", label: "Alternate email", type: "email", meta: true },
  { key: "altPhone", label: "Alternate phone", type: "phone", meta: true },
  { key: "preferredContact", label: "Preferred channel", type: "select", meta: true, options: CONTACT_CHANNEL_OPTIONS },
  { key: "website", label: "Website", type: "url", meta: true },
  ...addressFields("mailing", "Mailing address"),
  { key: "hRemit", label: "Payment (remit) address", type: "heading" },
  { key: "remitSameAsMailing", label: "Same as mailing address", type: "switch", meta: true },
  ...addressFields("remit", "Remit to", (i) => !i?.metadata?.remitSameAsMailing).slice(1),
  { key: "payeeName", label: "Payee name", type: "text", meta: true, hint: "Name printed on checks, if different." },
];

export const OWNER_PAYOUT_FIELDS = [
  { key: "payoutMethod", label: "Payout method", type: "select", options: PAYOUT_METHOD_OPTIONS },
  { key: "payoutSchedule", label: "Schedule", type: "select", meta: true, options: PAYOUT_SCHEDULE_OPTIONS },
  { key: "distributionDay", label: "Distribution day", type: "number", meta: true, min: 1, max: 28, hint: "Day of month owner draws go out." },
  { key: "minimumPayout", label: "Minimum payout", type: "currency", meta: true, hint: "Smaller balances roll to next cycle." },
  { key: "hBank", label: "Bank account", type: "heading", hint: "Only the last four digits are stored.", showIf: (i) => i?.payoutMethod !== "Check" },
  { key: "bankName", label: "Bank", type: "text", meta: true, showIf: (i) => i?.payoutMethod !== "Check" },
  { key: "bankAccountType", label: "Account type", type: "select", meta: true, options: opts("Checking", "Savings"), showIf: (i) => i?.payoutMethod !== "Check" },
  { key: "bankLast4", label: "Account (last 4)", type: "text", meta: true, last4: true, placeholder: "1234", showIf: (i) => i?.payoutMethod !== "Check" },
  { key: "routingLast4", label: "Routing (last 4)", type: "text", meta: true, last4: true, placeholder: "5678", showIf: (i) => i?.payoutMethod !== "Check" },
  { key: "hReserve", label: "Holds & reserves", type: "heading" },
  { key: "holdPayouts", label: "Hold payouts", type: "switch", meta: true },
  { key: "holdReason", label: "Hold reason", type: "text", meta: true, showIf: (i) => Boolean(i?.metadata?.holdPayouts) },
  { key: "reserveAmount", label: "Reserve override", type: "currency", meta: true, hint: "Overrides the property's operating reserve." },
  { key: "separatePayments", label: "Separate payment per property", type: "switch", meta: true },
];

export const OWNER_AGREEMENT_FIELDS = [
  { key: "agreementStart", label: "Agreement start", type: "date", meta: true },
  { key: "agreementEnd", label: "Agreement end", type: "date", meta: true },
  { key: "agreementAutoRenew", label: "Auto-renews", type: "switch", meta: true },
  { key: "agreementNoticeDays", label: "Termination notice (days)", type: "number", meta: true, min: 0 },
  { key: "hFees", label: "Fees", type: "heading", hint: "Overrides the company defaults in Settings → Fees & Policies." },
  { key: "managementFeePct", label: "Management fee", type: "percent", hint: "Percent of collected rent." },
  { key: "managementFeeMinimum", label: "Minimum monthly fee", type: "currency", meta: true },
  { key: "leasingFeeType", label: "Leasing fee type", type: "select", meta: true, options: opts("Percent of first month", "Flat", "None") },
  {
    key: "leasingFeeAmount",
    label: "Leasing fee",
    type: "number",
    meta: true,
    showIf: (i) => i?.metadata?.leasingFeeType && i.metadata.leasingFeeType !== "None",
    hint: "Percent or dollars, per the type above.",
  },
  { key: "renewalFee", label: "Renewal fee", type: "currency", meta: true },
  { key: "maintenanceMarkupPct", label: "Maintenance markup", type: "percent", meta: true },
  { key: "setupFee", label: "Setup fee", type: "currency", meta: true },
  { key: "feeNotes", label: "Fee notes", type: "textarea", meta: true },
];

export const OWNER_TAX_FIELDS = [
  { key: "taxClassification", label: "Tax classification", type: "select", meta: true, options: TAX_CLASSIFICATION_OPTIONS },
  { key: "tinType", label: "TIN type", type: "select", meta: true, options: TIN_TYPE_OPTIONS },
  { key: "taxIdLast4", label: "TIN (last 4)", type: "text", last4: true, placeholder: "1234" },
  { key: "taxpayerName", label: "Taxpayer name", type: "text", meta: true, hint: "As it appears on the W-9." },
  { key: "requires1099", label: "Include in 1099 reporting", type: "switch", meta: true },
  { key: "delivery1099", label: "1099 delivery", type: "select", meta: true, options: DELIVERY_OPTIONS },
  { key: "w9OnFile", label: "W-9 on file", type: "switch", meta: true },
  { key: "w9ReceivedOn", label: "W-9 received", type: "date", meta: true, showIf: (i) => Boolean(i?.metadata?.w9OnFile) },
  { key: "foreignOwner", label: "Foreign owner (W-8)", type: "switch", meta: true },
];

export const OWNER_STATEMENT_FIELDS = [
  { key: "statementDelivery", label: "Statement delivery", type: "select", meta: true, options: DELIVERY_OPTIONS },
  { key: "statementFrequency", label: "Frequency", type: "select", meta: true, options: opts("Monthly", "Quarterly", "Annually") },
  {
    key: "statementReports",
    label: "Included reports",
    type: "multiselect",
    meta: true,
    options: opts("Owner statement", "Rent roll", "Income statement", "Cash flow", "Delinquency", "Work orders", "Bills paid"),
  },
  { key: "statementCc", label: "CC statements to", type: "email", meta: true },
  { key: "ownerNotesOnStatement", label: "Note printed on statements", type: "textarea", meta: true },
];

export const OWNER_MAINTENANCE_FIELDS = [
  { key: "approvalThreshold", label: "Approval required over", type: "currency", meta: true, hint: "Work orders and bills above this need owner approval." },
  { key: "approveBills", label: "Owner approves bills", type: "switch", meta: true },
  { key: "notifyEmergencies", label: "Notify on emergencies", type: "switch", meta: true },
  { key: "homeWarranty", label: "Home warranty provider", type: "text", meta: true },
  { key: "preferredVendors", label: "Preferred vendors", type: "textarea", meta: true, placeholder: "Vendors this owner prefers or wants to avoid…" },
  { key: "maintenanceNotes", label: "Maintenance notes", type: "textarea", meta: true },
];

export const OWNER_CONTACT_RECORD_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "relation", label: "Role", type: "select", options: opts("Spouse / partner", "Accountant", "Attorney", "Property manager", "Assistant", "Partner", "Other") },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "receivesStatements", label: "Receives statements", type: "switch" },
  { key: "canApprove", label: "Can approve work", type: "switch" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const OWNERSHIP_SUMMARY = (r) => ({
  title: r.propertyName || "Property",
  meta: [r.startsOn ? `Since ${formatDate(r.startsOn)}` : null, r.endsOn ? `Until ${formatDate(r.endsOn)}` : null].filter(Boolean).join(" · ") || undefined,
  badge: r.isPrimary ? "Primary owner" : undefined,
  badgeVariant: "info",
  aside: percent(r.ownershipPct),
});

export const reserveLabel = (o) => (Number(o?.metadata?.reserveAmount) ? currency(o.metadata.reserveAmount) : "Property default");
