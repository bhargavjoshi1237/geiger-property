// Shared lookups, formatters, and field sets for the Tenants area. The three
// tenant "lens" screens (Directory, Profiles, Resident Portal) and the All
// Tenants editor all read the same `tenants` table, so they share this config.

export const TENANT_STATUS_MAP = {
  Current: { label: "Current", variant: "success", dotClass: "bg-emerald-400" },
  Applicant: { label: "Applicant", variant: "info", dotClass: "bg-sky-400" },
  Late: { label: "Late", variant: "warning", dotClass: "bg-amber-400" },
  Past: { label: "Past", variant: "outline", dotClass: "bg-[#525252]" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

export const TENANT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "Current", label: "Current" },
  { value: "Applicant", label: "Applicant" },
  { value: "Late", label: "Late" },
  { value: "Past", label: "Past" },
  { value: "Draft", label: "Draft" },
];

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

export const formatDate = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

// Field sets reused across tenant sections. `meta: true` fields persist into the
// tenant's metadata bag; the rest are real columns.
export const TENANT_CONTACT_FIELDS = [
  { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
  { key: "email", label: "Email", type: "text", placeholder: "name@example.com" },
  { key: "phone", label: "Phone", type: "text", placeholder: "(555) 123-4567" },
  { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Maple Court · 4B" },
];

export const TENANT_LEASE_FIELDS = [
  { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Maple Court · 4B" },
  { key: "leaseStart", label: "Lease start", type: "date" },
  { key: "leaseEnd", label: "Lease end", type: "date" },
  { key: "propertyName", label: "Property", type: "text", meta: true, placeholder: "e.g. Maple Court" },
  { key: "rentAmount", label: "Monthly rent", type: "number", meta: true, placeholder: "0" },
];

export const TENANT_PAYMENT_FIELDS = [
  { key: "balance", label: "Current balance", type: "number", placeholder: "0" },
  {
    key: "autopay",
    label: "Autopay enabled",
    type: "switch",
    meta: true,
  },
  {
    key: "paymentMethod",
    label: "Payment method",
    type: "select",
    meta: true,
    options: [
      { value: "ACH", label: "Bank (ACH)" },
      { value: "Card", label: "Card" },
      { value: "Check", label: "Check" },
      { value: "Cash", label: "Cash" },
    ],
  },
  { key: "lastPaymentOn", label: "Last payment", type: "date", meta: true },
];

export const TENANT_SCREENING_FIELDS = [
  { key: "creditScore", label: "Credit score", type: "number", meta: true, placeholder: "e.g. 720" },
  {
    key: "backgroundStatus",
    label: "Background check",
    type: "select",
    meta: true,
    options: [
      { value: "Pending", label: "Pending" },
      { value: "Clear", label: "Clear" },
      { value: "Flagged", label: "Flagged" },
    ],
  },
  { key: "incomeVerified", label: "Income verified", type: "switch", meta: true },
  { key: "screeningNotes", label: "Notes", type: "textarea", meta: true, placeholder: "Screening notes…" },
];

export const TENANT_EMERGENCY_FIELDS = [
  { key: "emergencyName", label: "Contact name", type: "text", meta: true, placeholder: "e.g. Alex Blake" },
  { key: "emergencyPhone", label: "Contact phone", type: "text", meta: true, placeholder: "(555) 987-6543" },
  { key: "emergencyRelation", label: "Relationship", type: "text", meta: true, placeholder: "e.g. Sibling" },
];

export const TENANT_IDENTITY_FIELDS = [
  { key: "dateOfBirth", label: "Date of birth", type: "date", meta: true },
  { key: "ssnLast4", label: "SSN (last 4)", type: "text", meta: true, placeholder: "1234" },
  { key: "driverLicense", label: "Driver's license", type: "text", meta: true },
  { key: "nationality", label: "Nationality", type: "text", meta: true },
];

export const TENANT_EMPLOYMENT_FIELDS = [
  { key: "employer", label: "Employer", type: "text", meta: true, placeholder: "e.g. Acme Co." },
  { key: "jobTitle", label: "Job title", type: "text", meta: true },
  { key: "annualIncome", label: "Annual income", type: "number", meta: true, placeholder: "0" },
  {
    key: "employmentStatus",
    label: "Status",
    type: "select",
    meta: true,
    options: [
      { value: "Employed", label: "Employed" },
      { value: "Self-employed", label: "Self-employed" },
      { value: "Student", label: "Student" },
      { value: "Retired", label: "Retired" },
      { value: "Unemployed", label: "Unemployed" },
    ],
  },
];

export const TENANT_VEHICLES_PETS_FIELDS = [
  { key: "vehicle", label: "Vehicle", type: "text", meta: true, placeholder: "e.g. 2020 Honda Civic" },
  { key: "licensePlate", label: "License plate", type: "text", meta: true },
  { key: "pet", label: "Pet", type: "text", meta: true, placeholder: "e.g. Dog — Labrador" },
  { key: "petWeight", label: "Pet weight (lbs)", type: "number", meta: true },
];
