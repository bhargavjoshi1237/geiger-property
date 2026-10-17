// Shared lookups and defaults for the Settings pages. Plain data — no JSX.

export const listOptions = (values) => values.map((v) => ({ value: v, label: v }));

export const formatDate = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

// Build FilterDropdown options ([{ all }, …statuses]) from a status map.
export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

// --- Company profile ---------------------------------------------------------

export const COMPANY_PROFILE_DEFAULTS = {
  legalName: "",
  dba: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  licenseNumber: "",
  timezone: "America/New_York",
  currency: "USD",
};

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain — no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Central Europe (Berlin)" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD — US dollar" },
  { value: "CAD", label: "CAD — Canadian dollar" },
  { value: "GBP", label: "GBP — British pound" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "AUD", label: "AUD — Australian dollar" },
  { value: "INR", label: "INR — Indian rupee" },
];

// Fees & policies live in lib/policies.js (the policy cascade catalog).

// --- Branding & portals ------------------------------------------------------

// Fixed named accent palette — stored by key, never as free-form hex.
export const ACCENT_PALETTE = [
  { value: "slate", label: "Slate", swatch: "bg-slate-400" },
  { value: "blue", label: "Blue", swatch: "bg-blue-500" },
  { value: "sky", label: "Sky", swatch: "bg-sky-400" },
  { value: "emerald", label: "Emerald", swatch: "bg-emerald-500" },
  { value: "violet", label: "Violet", swatch: "bg-violet-500" },
  { value: "amber", label: "Amber", swatch: "bg-amber-400" },
  { value: "rose", label: "Rose", swatch: "bg-rose-500" },
];

export const BRANDING_DEFAULTS = {
  displayName: "",
  logoUrl: "",
  accent: "blue",
  residentPortal: false,
  ownerPortal: false,
  vendorPortal: false,
  portalWelcome: "",
  supportEmail: "",
  supportPhone: "",
};

// --- Integrations ------------------------------------------------------------

export const INTEGRATIONS_DEFAULTS = { webhooks: [] };

export const WEBHOOK_EVENTS = [
  "tenant.created",
  "lease.signed",
  "payment.received",
  "work_order.created",
  "work_order.completed",
  "application.submitted",
];

// --- Custom fields -----------------------------------------------------------

export const CUSTOM_FIELD_ENTITIES = [
  { value: "properties", label: "Properties" },
  { value: "buildings", label: "Buildings" },
  { value: "units", label: "Units" },
  { value: "tenants", label: "Tenants" },
  { value: "leases", label: "Leases" },
  { value: "owners", label: "Owners" },
  { value: "vendors", label: "Vendors" },
  { value: "work_orders", label: "Work orders" },
  { value: "applications", label: "Applications" },
  { value: "prospects", label: "Prospects" },
];

export const CUSTOM_FIELDS_DEFAULTS = Object.fromEntries(CUSTOM_FIELD_ENTITIES.map((e) => [e.value, []]));

export const CUSTOM_FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date", label: "Date" },
  { value: "select", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" },
  { value: "switch", label: "Yes / no" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "Link" },
];

// --- Team & members ----------------------------------------------------------

export const TEAM_STATUS_MAP = {
  Invited: { label: "Invited", variant: "info" },
  Active: { label: "Active", variant: "success" },
  Disabled: { label: "Disabled", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

// Used when no roles have been saved yet.
export const FALLBACK_ROLE_NAMES = [
  "Owner",
  "Manager",
  "Leasing agent",
  "Maintenance tech",
  "Accountant",
];
