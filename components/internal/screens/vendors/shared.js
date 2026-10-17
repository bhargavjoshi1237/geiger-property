// Shared lookups and field sets for the Vendors area. Plain data, no JSX.
// `meta: true` fields persist into the vendor's metadata bag.

import { glAccountIdOptions, propertyNameOptions } from "@/components/internal/screens/people/options";
import {
  CONTACT_CHANNEL_OPTIONS,
  TIN_TYPE_OPTIONS,
  US_STATE_OPTIONS,
  addressFields,
  opts,
} from "@/components/internal/screens/people/shared";

export { filterOptions, selectOptions, currency, formatDate, todayISO } from "@/components/internal/screens/people/shared";

export const VENDOR_STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Onboarding: { label: "Onboarding", variant: "info" },
  Preferred: { label: "Preferred", variant: "purple" },
  Inactive: { label: "Inactive", variant: "outline" },
  "Do not use": { label: "Do not use", variant: "danger" },
};

export const TRADE_OPTIONS = opts(
  "Plumbing", "Electrical", "HVAC", "Appliance repair", "General contractor", "Handyman", "Painting", "Flooring",
  "Roofing", "Landscaping", "Snow removal", "Pest control", "Cleaning", "Locksmith", "Pool & spa", "Elevator",
  "Fire & life safety", "Junk removal", "Restoration", "Inspection",
);

export const isPreferred = (v) => Boolean(v?.metadata?.preferred) || v?.status === "Preferred";
export const isUsable = (v) => !["Inactive", "Do not use"].includes(v?.status);
export const coiRequired = (v) => isUsable(v) && !v?.metadata?.coiWaived;
export const licenseRequired = (v) => isUsable(v) && Boolean(v?.metadata?.licenseRequired);
export const needsW9 = (v) => isUsable(v) && Boolean(v?.metadata?.is1099) && !v?.metadata?.w9OnFile;
export const tradesOf = (v) => {
  const list = Array.isArray(v?.metadata?.trades) ? v.metadata.trades : [];
  return v?.specialty && !list.includes(v.specialty) ? [v.specialty, ...list] : list;
};

export const VENDOR_COMPANY_FIELDS = [
  { key: "name", label: "Vendor name", type: "text", required: true },
  { key: "dba", label: "Doing business as", type: "text", meta: true },
  { key: "companyType", label: "Type", type: "select", meta: true, options: opts("Company", "Individual") },
  { key: "status", label: "Status", type: "select", options: Object.keys(VENDOR_STATUS_MAP).map((k) => ({ value: k, label: k })) },
  { key: "preferred", label: "Preferred vendor", type: "switch", meta: true, hint: "Shown first when assigning work." },
  { key: "since", label: "Vendor since", type: "date", meta: true },
  { key: "accountNumber", label: "Our account #", type: "text", meta: true, hint: "Your customer number with this vendor." },
  { key: "website", label: "Website", type: "url", meta: true },
  { key: "doNotUseReason", label: "Do-not-use reason", type: "text", meta: true, full: true, showIf: (i) => i?.status === "Do not use" },
];

export const VENDOR_CONTACT_FIELDS = [
  { key: "contactName", label: "Primary contact", type: "text" },
  { key: "contactTitle", label: "Title", type: "text", meta: true },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Office phone", type: "phone" },
  { key: "mobilePhone", label: "Mobile", type: "phone", meta: true },
  { key: "afterHoursPhone", label: "After-hours line", type: "phone", meta: true },
  { key: "dispatchEmail", label: "Dispatch email", type: "email", meta: true, hint: "Where work orders are sent." },
  { key: "preferredContact", label: "Preferred channel", type: "select", meta: true, options: CONTACT_CHANNEL_OPTIONS },
  ...addressFields("vendor", "Address"),
];

export const VENDOR_TRADE_FIELDS = [
  { key: "specialty", label: "Primary trade", type: "select", options: TRADE_OPTIONS },
  { key: "trades", label: "All trades", type: "multiselect", meta: true, options: TRADE_OPTIONS },
  { key: "serviceAreas", label: "Properties served", type: "multiselect", meta: true, optionsFrom: propertyNameOptions },
  { key: "serviceZips", label: "Service ZIP codes", type: "text", meta: true, full: true, placeholder: "e.g. 94110, 94112" },
  { key: "serviceRadiusMiles", label: "Service radius", type: "number", meta: true, suffix: "mi", min: 0 },
  { key: "maxJobSize", label: "Largest job", type: "currency", meta: true },
];

export const VENDOR_RATE_FIELDS = [
  { key: "hourlyRate", label: "Hourly rate", type: "currency" },
  { key: "tripCharge", label: "Trip charge", type: "currency", meta: true },
  { key: "minimumCharge", label: "Minimum charge", type: "currency", meta: true },
  { key: "afterHoursMultiplier", label: "After-hours multiplier", type: "number", meta: true, step: 0.25, suffix: "×", placeholder: "1.5" },
  { key: "weekendMultiplier", label: "Weekend multiplier", type: "number", meta: true, step: 0.25, suffix: "×" },
  { key: "emergencyRate", label: "Emergency hourly rate", type: "currency", meta: true },
  { key: "materialsMarkupPct", label: "Materials markup", type: "percent", meta: true },
  { key: "estimateRequiredOver", label: "Estimate required over", type: "currency", meta: true },
  { key: "rateNotes", label: "Rate notes", type: "textarea", meta: true },
];

export const VENDOR_PAYMENT_FIELDS = [
  { key: "paymentTerms", label: "Payment terms", type: "select", meta: true, options: opts("Due on receipt", "Net 10", "Net 15", "Net 30", "Net 45", "Net 60") },
  { key: "paymentMethod", label: "Payment method", type: "select", meta: true, options: opts("ACH", "Check", "Card", "Wire") },
  { key: "payeeName", label: "Payee name", type: "text", meta: true },
  { key: "invoiceEmail", label: "Billing email", type: "email", meta: true },
  { key: "defaultGlAccountId", label: "Default GL account", type: "select", meta: true, optionsFrom: glAccountIdOptions, hint: "Pre-fills the expense account on this vendor's bills." },
  { key: "bankLast4", label: "Bank account (last 4)", type: "text", meta: true, last4: true, showIf: (i) => i?.metadata?.paymentMethod === "ACH" },
  { key: "discountPct", label: "Early-pay discount", type: "percent", meta: true },
  { key: "discountDays", label: "Discount window (days)", type: "number", meta: true, min: 0 },
  { key: "holdPayments", label: "Hold payments", type: "switch", meta: true },
  { key: "holdReason", label: "Hold reason", type: "text", meta: true, showIf: (i) => Boolean(i?.metadata?.holdPayments) },
];

export const VENDOR_TAX_FIELDS = [
  { key: "is1099", label: "1099 eligible", type: "switch", meta: true },
  { key: "box1099", label: "1099 form / box", type: "select", meta: true, options: opts("NEC · Box 1", "MISC · Box 1 (Rents)", "MISC · Box 10 (Attorney)"), showIf: (i) => Boolean(i?.metadata?.is1099) },
  { key: "taxClassification", label: "Tax classification", type: "select", meta: true, options: opts("Individual / sole proprietor", "LLC", "Partnership", "C corporation", "S corporation", "Other") },
  { key: "tinType", label: "TIN type", type: "select", meta: true, options: TIN_TYPE_OPTIONS },
  { key: "tinLast4", label: "TIN (last 4)", type: "text", meta: true, last4: true, placeholder: "1234" },
  { key: "taxpayerName", label: "Taxpayer name", type: "text", meta: true },
  { key: "w9OnFile", label: "W-9 on file", type: "switch", meta: true },
  { key: "w9ReceivedOn", label: "W-9 received", type: "date", meta: true, showIf: (i) => Boolean(i?.metadata?.w9OnFile) },
];

export const VENDOR_REQUIREMENT_FIELDS = [
  { key: "coiWaived", label: "Waive insurance requirement", type: "switch", meta: true },
  { key: "coiMinGeneralLiability", label: "Minimum general liability", type: "currency", meta: true },
  { key: "coiRequireAdditionalInsured", label: "Require additional insured", type: "switch", meta: true },
  { key: "workersCompRequired", label: "Require workers' comp", type: "switch", meta: true },
  { key: "licenseRequired", label: "Require a trade license", type: "switch", meta: true },
  { key: "complianceNotes", label: "Compliance notes", type: "textarea", meta: true },
];

export const VENDOR_AVAILABILITY_FIELDS = [
  { key: "emergencyAvailable", label: "24/7 emergency service", type: "switch", meta: true },
  { key: "emergencyResponseHours", label: "Emergency response", type: "number", meta: true, suffix: "hrs", showIf: (i) => Boolean(i?.metadata?.emergencyAvailable) },
  { key: "responseTimeHours", label: "Standard response", type: "number", meta: true, suffix: "hrs" },
  { key: "businessHours", label: "Business hours", type: "text", meta: true, placeholder: "e.g. 7am–5pm" },
  { key: "daysAvailable", label: "Days available", type: "multiselect", meta: true, options: opts("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun") },
  { key: "holidayCoverage", label: "Holiday coverage", type: "switch", meta: true },
  { key: "crewSize", label: "Crew size", type: "number", meta: true, min: 0 },
  { key: "availabilityNotes", label: "Notes", type: "textarea", meta: true },
];

export const VENDOR_PORTAL_FIELDS = [
  { key: "vendorPortalAccess", label: "Vendor portal access", type: "switch", meta: true },
  { key: "portalAcceptWork", label: "Accept and decline work orders", type: "switch", meta: true, showIf: (i) => Boolean(i?.metadata?.vendorPortalAccess) },
  { key: "portalUploadInvoices", label: "Upload invoices", type: "switch", meta: true, showIf: (i) => Boolean(i?.metadata?.vendorPortalAccess) },
  { key: "portalUploadCoi", label: "Upload insurance certificates", type: "switch", meta: true, showIf: (i) => Boolean(i?.metadata?.vendorPortalAccess) },
  { key: "portalSeeTenantContact", label: "See tenant contact details", type: "switch", meta: true, showIf: (i) => Boolean(i?.metadata?.vendorPortalAccess) },
];

export const COI_FIELDS = [
  { key: "name", label: "Carrier", type: "text", required: true },
  { key: "policyType", label: "Coverage", type: "select", required: true, options: opts("General liability", "Workers' compensation", "Commercial auto", "Umbrella", "Professional liability") },
  { key: "policyNumber", label: "Policy number", type: "text" },
  { key: "status", label: "Status", type: "select", options: opts("Active", "Pending", "Cancelled") },
  { key: "startsOn", label: "Effective", type: "date" },
  { key: "endsOn", label: "Expires", type: "date", required: true },
  { key: "amount", label: "Per occurrence", type: "currency" },
  { key: "aggregate", label: "Aggregate", type: "currency" },
  { key: "additionalInsured", label: "We're additional insured", type: "switch" },
  { key: "waiverOfSubrogation", label: "Waiver of subrogation", type: "switch" },
  { key: "certificateHolder", label: "Certificate holder", type: "text", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const LICENSE_FIELDS = [
  { key: "name", label: "License type", type: "text", required: true, placeholder: "e.g. Master plumber" },
  { key: "number", label: "License number", type: "text", required: true },
  { key: "state", label: "State", type: "select", options: US_STATE_OPTIONS },
  { key: "classification", label: "Classification", type: "text" },
  { key: "status", label: "Status", type: "select", options: opts("Active", "Pending", "Cancelled") },
  { key: "startsOn", label: "Issued", type: "date" },
  { key: "endsOn", label: "Expires", type: "date", required: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const REVIEW_FIELDS = [
  { key: "name", label: "Reviewer", type: "text", required: true },
  { key: "amount", label: "Rating (1–5)", type: "number", required: true, min: 1, max: 5, step: 1 },
  { key: "startsOn", label: "Date", type: "date" },
  { key: "workOrder", label: "Job / work order", type: "text" },
  { key: "quality", label: "Quality", type: "select", options: opts("Excellent", "Good", "Fair", "Poor") },
  { key: "timeliness", label: "Timeliness", type: "select", options: opts("Early", "On time", "Late") },
  { key: "wouldHireAgain", label: "Would hire again", type: "switch" },
  { key: "comment", label: "Comment", type: "textarea" },
];

export const VENDOR_CONTACT_RECORD_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "relation", label: "Role", type: "select", options: opts("Owner", "Dispatcher", "Billing", "Technician", "Estimator", "Other") },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "isPrimary", label: "Primary contact", type: "switch" },
  { key: "notes", label: "Notes", type: "textarea" },
];
