// Formatters and option lists shared by the People area (Tenants, Owners,
// Vendors). Plain data, no JSX.

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Date-only strings ("YYYY-MM-DD") are read as local dates to avoid a day shift.
export const formatDate = (v) => {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const formatDateTime = (v) => {
  if (!v) return "Never";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
};

export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const opts = (...values) => values.map((v) => ({ value: v, label: v }));

export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

// Keep only the last four digits of a sensitive number (SSN, TIN, account…).
export const last4 = (v) => String(v ?? "").replace(/\D/g, "").slice(-4);
export const masked = (v) => (v ? `•••• ${v}` : "—");

export const CONTACT_CHANNEL_OPTIONS = opts("Email", "Phone", "SMS", "Mail", "Portal");
export const LANGUAGE_OPTIONS = opts("English", "Spanish", "French", "Chinese", "Vietnamese", "Korean", "Arabic", "Portuguese", "Other");
export const TIN_TYPE_OPTIONS = [
  { value: "SSN", label: "SSN" },
  { value: "EIN", label: "EIN" },
  { value: "ITIN", label: "ITIN" },
];
export const DELIVERY_OPTIONS = opts("E-delivery", "Mail", "Both");
export const PORTAL_STATUS_OPTIONS = opts("Not invited", "Invited", "Active", "Disabled");

export const PORTAL_STATUS_MAP = {
  "Not invited": { label: "Not invited", variant: "outline" },
  Invited: { label: "Invited", variant: "info" },
  Active: { label: "Active", variant: "success" },
  Disabled: { label: "Disabled", variant: "neutral" },
};

export const US_STATE_OPTIONS = opts(
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
);

// Address block for FieldsForm (meta keys `${prefix}Line1`, …), optional showIf.
export const addressFields = (prefix, label, showIf) => [
  { key: `${prefix}Heading`, label, type: "heading", showIf },
  { key: `${prefix}Line1`, label: "Street address", type: "text", meta: true, full: true, showIf },
  { key: `${prefix}Line2`, label: "Apt, suite, unit", type: "text", meta: true, showIf },
  { key: `${prefix}City`, label: "City", type: "text", meta: true, showIf },
  { key: `${prefix}State`, label: "State", type: "select", meta: true, options: US_STATE_OPTIONS, showIf },
  { key: `${prefix}Zip`, label: "ZIP code", type: "text", meta: true, showIf },
];

export const formatAddress = (item, prefix) => {
  const m = item?.metadata || {};
  const cityLine = [m[`${prefix}City`], [m[`${prefix}State`], m[`${prefix}Zip`]].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [m[`${prefix}Line1`], m[`${prefix}Line2`], cityLine].filter(Boolean).join(", ");
};
