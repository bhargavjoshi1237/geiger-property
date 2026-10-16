// Shared lookups, formatters, and field sets for the Tenants area (one Tenants
// screen over the `tenants` table). `meta: true` fields persist into the
// tenant's metadata bag; the rest are real columns.

import {
  CONTACT_CHANNEL_OPTIONS,
  DELIVERY_OPTIONS,
  LANGUAGE_OPTIONS,
  US_STATE_OPTIONS,
  addressFields,
  currency,
  opts,
} from "@/components/internal/screens/people/shared";

export { currency, formatDate, formatDateTime, todayISO } from "@/components/internal/screens/people/shared";

export const TENANT_STATUS_MAP = {
  Applicant: { label: "Applicant", variant: "info", dotClass: "bg-sky-400" },
  Future: { label: "Future", variant: "purple", dotClass: "bg-violet-300" },
  Current: { label: "Current", variant: "success", dotClass: "bg-emerald-400" },
  Late: { label: "Late", variant: "warning", dotClass: "bg-amber-400" },
  Notice: { label: "On notice", variant: "warning", dotClass: "bg-orange-400" },
  Past: { label: "Past", variant: "outline", dotClass: "bg-neutral-600" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
};

export const TENANT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.entries(TENANT_STATUS_MAP).map(([value, m]) => ({ value, label: m.label })),
];

const STATUS_OPTIONS = Object.entries(TENANT_STATUS_MAP).map(([value, m]) => ({ value, label: m.label }));

// Statuses that live in a unit (insurance is required by default for these).
export const RESIDENT_STATUSES = ["Current", "Late", "Notice"];
export const isResident = (t) => RESIDENT_STATUSES.includes(t?.status);
export const insuranceRequired = (t) => isResident(t) && !t?.metadata?.insuranceWaived;

export const portalStatusOf = (t) => t?.metadata?.portalStatus || (t?.portalEnabled ? "Active" : "Not invited");

export const RESTRICTION_KEYS = [
  { key: "restrictNoOnline", label: "No online payments" },
  { key: "restrictCertifiedOnly", label: "Certified funds only" },
  { key: "restrictNoPartial", label: "No partial payments" },
  { key: "restrictNoChecks", label: "No personal checks" },
];
export const activeRestrictions = (t) =>
  RESTRICTION_KEYS.filter((r) => Boolean(t?.metadata?.[r.key] ?? t?.[r.key]));

const RELATION_OPTIONS = opts("Spouse / partner", "Parent", "Child", "Sibling", "Roommate", "Co-tenant", "Guarantor", "Caregiver", "Friend", "Other");
const company = (i) => i?.metadata?.tenantType === "Company";

export const TENANT_PROFILE_FIELDS = [
  { key: "hName", label: "Name", type: "heading" },
  { key: "tenantType", label: "Tenant type", type: "select", meta: true, options: opts("Individual", "Company") },
  { key: "companyName", label: "Company name", type: "text", meta: true, showIf: company },
  { key: "firstName", label: "First name", type: "text", meta: true },
  { key: "middleName", label: "Middle name", type: "text", meta: true },
  { key: "lastName", label: "Last name", type: "text", meta: true },
  { key: "suffix", label: "Suffix", type: "select", meta: true, options: opts("Jr.", "Sr.", "II", "III", "IV") },
  { key: "preferredName", label: "Preferred name", type: "text", meta: true, placeholder: "What they like to be called" },
  { key: "name", label: "Display name", type: "text", required: true, hint: "Shown across leases, ledgers, and notices." },
  { key: "hContact", label: "Contact", type: "heading" },
  { key: "email", label: "Email", type: "email", placeholder: "name@example.com" },
  { key: "phone", label: "Mobile phone", type: "phone", placeholder: "(555) 123-4567" },
  { key: "altEmail", label: "Alternate email", type: "email", meta: true },
  { key: "homePhone", label: "Home phone", type: "phone", meta: true },
  { key: "workPhone", label: "Work phone", type: "phone", meta: true },
  { key: "hPersonal", label: "Personal", type: "heading" },
  { key: "dateOfBirth", label: "Date of birth", type: "date", meta: true },
  { key: "pronouns", label: "Pronouns", type: "select", meta: true, options: opts("She/her", "He/him", "They/them", "Prefer not to say") },
  { key: "language", label: "Preferred language", type: "select", meta: true, options: LANGUAGE_OPTIONS },
  { key: "interpreterNeeded", label: "Interpreter needed", type: "switch", meta: true },
  { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
  { key: "tenantSince", label: "Tenant since", type: "date", meta: true },
];

export const TENANT_COMMUNICATION_FIELDS = [
  { key: "hChannels", label: "Channels", type: "heading" },
  { key: "preferredContact", label: "Preferred channel", type: "select", meta: true, options: CONTACT_CHANNEL_OPTIONS },
  { key: "emailOptIn", label: "Email updates", type: "switch", meta: true },
  { key: "smsOptIn", label: "SMS opt-in", type: "switch", meta: true, hint: "Text messages need express consent." },
  { key: "smsConsentOn", label: "SMS consent date", type: "date", meta: true, showIf: (i) => Boolean(i?.metadata?.smsOptIn) },
  { key: "marketingConsent", label: "Marketing consent", type: "switch", meta: true },
  { key: "quietHoursStart", label: "Quiet hours from", type: "time", meta: true },
  { key: "quietHoursEnd", label: "Quiet hours to", type: "time", meta: true },
  { key: "hDelivery", label: "Delivery", type: "heading" },
  { key: "statementDelivery", label: "Statements", type: "select", meta: true, options: DELIVERY_OPTIONS },
  { key: "noticeDelivery", label: "Legal notices", type: "select", meta: true, options: opts("Email", "Mail", "Hand delivery", "Posting", "Portal") },
  { key: "doNotContact", label: "Do not contact", type: "switch", meta: true },
  { key: "doNotContactReason", label: "Reason", type: "text", meta: true, showIf: (i) => Boolean(i?.metadata?.doNotContact) },
  { key: "consentNotes", label: "Consent notes", type: "textarea", meta: true, placeholder: "Where and when consent was captured…" },
];

export const TENANT_PAYMENT_FIELDS = [
  { key: "balance", label: "Current balance", type: "readonly", format: (v) => currency(v), hint: "Calculated from Rent Collection." },
  { key: "paymentMethod", label: "Preferred method", type: "select", meta: true, options: opts("ACH", "Card", "Check", "Money order", "Cash") },
  { key: "autopay", label: "Autopay enabled", type: "switch", meta: true },
  { key: "autopayDay", label: "Autopay day", type: "number", meta: true, min: 1, max: 28, showIf: (i) => Boolean(i?.metadata?.autopay) },
  { key: "lastPaymentOn", label: "Last payment", type: "date", meta: true },
  { key: "lastPaymentAmount", label: "Last payment amount", type: "currency", meta: true },
  { key: "lateFeeExempt", label: "Don't charge late fees", type: "switch", meta: true },
  { key: "nsfCount", label: "Returned payments (NSF)", type: "number", meta: true, min: 0 },
  { key: "paymentNotes", label: "Payment notes", type: "textarea", meta: true },
];

export const TENANT_RESTRICTION_FIELDS = [
  ...RESTRICTION_KEYS.map((r) => ({ key: r.key, label: r.label, type: "switch", meta: true })),
  { key: "restrictionReason", label: "Reason", type: "textarea", meta: true, placeholder: "e.g. Two returned payments in 6 months" },
  { key: "restrictionSetBy", label: "Set by", type: "text", meta: true },
  { key: "restrictionSetOn", label: "Set on", type: "date", meta: true },
  { key: "restrictionReviewOn", label: "Review on", type: "date", meta: true },
];

export const TENANT_EMPLOYMENT_FIELDS = [
  {
    key: "employmentStatus",
    label: "Employment status",
    type: "select",
    meta: true,
    options: opts("Employed", "Self-employed", "Student", "Retired", "Unemployed", "Other"),
  },
  { key: "employer", label: "Employer", type: "text", meta: true, placeholder: "e.g. Acme Co." },
  { key: "jobTitle", label: "Job title", type: "text", meta: true },
  { key: "employmentStart", label: "Start date", type: "date", meta: true },
  { key: "supervisorName", label: "Supervisor", type: "text", meta: true },
  { key: "employerPhone", label: "Employer phone", type: "phone", meta: true },
  { key: "employerAddress", label: "Employer address", type: "text", meta: true, full: true },
  { key: "hIncome", label: "Income", type: "heading" },
  { key: "annualIncome", label: "Annual income", type: "currency", meta: true },
  {
    key: "monthlyIncome",
    label: "Monthly income",
    type: "readonly",
    format: (_v, i) => (Number(i?.metadata?.annualIncome) ? currency(Number(i.metadata.annualIncome) / 12) : "—"),
  },
  { key: "otherIncome", label: "Other income (annual)", type: "currency", meta: true },
  { key: "otherIncomeSource", label: "Other income source", type: "text", meta: true, placeholder: "e.g. Housing voucher" },
  { key: "incomeVerified", label: "Income verified", type: "switch", meta: true },
  { key: "incomeVerifiedOn", label: "Verified on", type: "date", meta: true, showIf: (i) => Boolean(i?.metadata?.incomeVerified) },
];

export const TENANT_IDENTITY_FIELDS = [
  { key: "hId", label: "Government ID", type: "heading", hint: "Only the ID type and last four digits are stored." },
  {
    key: "idType",
    label: "ID type",
    type: "select",
    meta: true,
    options: opts("Driver's license", "State ID", "Passport", "Military ID", "Permanent resident card", "Other"),
  },
  { key: "idLast4", label: "ID number (last 4)", type: "text", meta: true, last4: true, placeholder: "1234" },
  { key: "idIssuingState", label: "Issuing state", type: "select", meta: true, options: US_STATE_OPTIONS },
  { key: "idIssuingCountry", label: "Issuing country", type: "text", meta: true, placeholder: "e.g. United States" },
  { key: "idExpiresOn", label: "ID expires", type: "date", meta: true },
  { key: "hTax", label: "Taxpayer ID", type: "heading" },
  { key: "ssnLast4", label: "SSN / ITIN (last 4)", type: "text", meta: true, last4: true, placeholder: "1234" },
];

export const TENANT_SCREENING_FIELDS = [
  { key: "screeningDate", label: "Screened on", type: "date", meta: true },
  { key: "creditScore", label: "Credit score", type: "number", meta: true, placeholder: "e.g. 720" },
  { key: "backgroundStatus", label: "Background check", type: "select", meta: true, options: opts("Pending", "Clear", "Flagged") },
  { key: "evictionHistory", label: "Eviction history", type: "select", meta: true, options: opts("None found", "Found", "Not checked") },
  { key: "screeningDecision", label: "Decision", type: "select", meta: true, options: opts("Approved", "Conditional", "Declined") },
  { key: "screeningConditions", label: "Conditions", type: "text", meta: true, placeholder: "e.g. Extra deposit", showIf: (i) => i?.metadata?.screeningDecision === "Conditional" },
  { key: "screeningNotes", label: "Notes", type: "textarea", meta: true, placeholder: "Screening notes…" },
];

export const RENT_REPORTING_STATUS_MAP = {
  "Not enrolled": { label: "Not enrolled", variant: "outline", dotClass: "bg-neutral-600" },
  Pending: { label: "Pending", variant: "info", dotClass: "bg-sky-400" },
  Reporting: { label: "Reporting", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
  "Opted out": { label: "Opted out", variant: "neutral", dotClass: "bg-neutral-500" },
};

export const TENANT_RENT_REPORTING_FIELDS = [
  { key: "rentReportingConsent", label: "Tenant consent on file", type: "switch", meta: true },
  { key: "rentReportingConsentOn", label: "Consent date", type: "date", meta: true, showIf: (i) => Boolean(i?.metadata?.rentReportingConsent) },
  { key: "rentReportingOptInOn", label: "Opted in on", type: "date", meta: true },
  { key: "rentReportingStatus", label: "Status", type: "select", meta: true, options: Object.keys(RENT_REPORTING_STATUS_MAP).map((k) => ({ value: k, label: k })) },
  { key: "rentReportingBureaus", label: "Bureaus", type: "multiselect", meta: true, options: opts("Experian", "Equifax", "TransUnion") },
  { key: "rentReportingPositiveOnly", label: "Report on-time payments only", type: "switch", meta: true },
  { key: "rentReportingBackfillMonths", label: "Backfill history (months)", type: "number", meta: true, min: 0, max: 24 },
  { key: "rentReportingNotes", label: "Notes", type: "textarea", meta: true },
];

export const TENANT_MOVE_OUT_FIELDS = [
  { key: "moveOutDate", label: "Move-out date", type: "date", meta: true },
  { key: "noticeGivenOn", label: "Notice given on", type: "date", meta: true },
  {
    key: "moveOutReason",
    label: "Reason",
    type: "select",
    meta: true,
    options: opts("Bought a home", "Relocating", "Rent increase", "Unit size", "Eviction", "Lease ended", "Other"),
  },
  { key: "depositDisposition", label: "Deposit", type: "select", meta: true, options: opts("Pending", "Refunded", "Partially refunded", "Applied to balance") },
  { key: "wouldRentAgain", label: "Would rent to again", type: "select", meta: true, options: opts("Yes", "No", "With conditions") },
  { key: "forwardingEmail", label: "Forwarding email", type: "email", meta: true },
  { key: "forwardingPhone", label: "Forwarding phone", type: "phone", meta: true },
  ...addressFields("forwarding", "Forwarding address"),
  { key: "moveOutNotes", label: "Move-out notes", type: "textarea", meta: true },
];

// --- record_items repeaters ---------------------------------------------------

export const CONTACT_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "relation", label: "Relationship", type: "select", options: RELATION_OPTIONS },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "isPrimary", label: "Primary contact", type: "switch" },
  { key: "onLease", label: "Named on the lease", type: "switch" },
  { key: "receivesNotices", label: "Receives notices", type: "switch" },
  { key: "receivesStatements", label: "Receives statements", type: "switch" },
  { key: "smsOptIn", label: "SMS opt-in", type: "switch" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const OCCUPANT_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "relation", label: "Relationship", type: "select", options: RELATION_OPTIONS },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "isMinor", label: "Minor", type: "switch" },
  { key: "startsOn", label: "Moved in", type: "date" },
  { key: "endsOn", label: "Moved out", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const EMERGENCY_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "relation", label: "Relationship", type: "select", options: RELATION_OPTIONS },
  { key: "phone", label: "Phone", type: "phone", required: true },
  { key: "altPhone", label: "Alternate phone", type: "phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "sort", label: "Call order", type: "number", min: 1, hint: "1 = call first." },
  { key: "address", label: "Address", type: "text", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const PET_FIELDS = [
  { key: "name", label: "Pet name", type: "text", required: true },
  { key: "petType", label: "Type", type: "select", required: true, options: opts("Dog", "Cat", "Bird", "Fish", "Reptile", "Small mammal", "Other") },
  { key: "breed", label: "Breed", type: "text" },
  { key: "weight", label: "Weight", type: "number", suffix: "lbs", min: 0 },
  { key: "color", label: "Color", type: "text" },
  { key: "age", label: "Age (years)", type: "number", min: 0 },
  { key: "assistance", label: "Assistance animal", type: "select", options: opts("None", "Service animal", "Emotional support (ESA)") },
  { key: "spayedNeutered", label: "Spayed / neutered", type: "switch" },
  { key: "endsOn", label: "Vaccinations expire", type: "date" },
  { key: "licenseNumber", label: "City license #", type: "text" },
  { key: "amount", label: "Pet rent (monthly)", type: "currency", hint: "Not charged for assistance animals." },
  { key: "petDeposit", label: "Pet deposit", type: "currency" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const VEHICLE_FIELDS = [
  { key: "name", label: "Make", type: "text", required: true, placeholder: "e.g. Honda" },
  { key: "model", label: "Model", type: "text", placeholder: "e.g. Civic" },
  { key: "year", label: "Year", type: "number", min: 1950, max: 2100 },
  { key: "color", label: "Color", type: "text" },
  { key: "plate", label: "License plate", type: "text", required: true },
  { key: "plateState", label: "Plate state", type: "select", options: US_STATE_OPTIONS },
  { key: "parkingSpot", label: "Parking spot", type: "text" },
  { key: "permitNumber", label: "Permit #", type: "text" },
  { key: "endsOn", label: "Permit expires", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const INSURANCE_POLICY_FIELDS = [
  { key: "name", label: "Carrier", type: "text", required: true, placeholder: "e.g. Lemonade" },
  { key: "policyNumber", label: "Policy number", type: "text" },
  { key: "status", label: "Status", type: "select", options: opts("Active", "Pending", "Cancelled") },
  { key: "startsOn", label: "Effective", type: "date" },
  { key: "endsOn", label: "Expires", type: "date", required: true },
  { key: "amount", label: "Liability coverage", type: "currency" },
  { key: "personalProperty", label: "Personal property", type: "currency" },
  { key: "deductible", label: "Deductible", type: "currency" },
  { key: "interestedPartyListed", label: "We're listed as interested party", type: "switch" },
  { key: "insuredNames", label: "Insured residents", type: "text", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];

export const INSURANCE_REQUIREMENT_FIELDS = [
  { key: "insuranceWaived", label: "Waive insurance requirement", type: "switch", meta: true },
  { key: "insuranceMinLiability", label: "Minimum liability", type: "currency", meta: true, placeholder: "100000" },
  { key: "insuranceWaiverReason", label: "Waiver reason", type: "text", meta: true, showIf: (i) => Boolean(i?.metadata?.insuranceWaived) },
];

export const COMMUNICATION_FIELDS = [
  { key: "channel", label: "Channel", type: "select", required: true, options: opts("email", "sms", "call", "letter", "portal", "note") },
  { key: "direction", label: "Direction", type: "select", options: opts("outbound", "inbound") },
  { key: "subject", label: "Subject", type: "text", required: true, full: true },
  { key: "occurredAt", label: "Date", type: "date" },
  { key: "deliveryStatus", label: "Delivery", type: "select", options: opts("Sent", "Delivered", "Opened", "Failed", "Bounced") },
  { key: "body", label: "Message", type: "textarea" },
];
