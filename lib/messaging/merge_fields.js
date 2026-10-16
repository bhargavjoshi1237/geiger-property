// Merge-field catalog for message templates (isomorphic — used by the template
// editor, the live preview, server sends and automations). Tokens are written
// as {{token}}; values come from buildMergeValues() in ./context.js.

export const MERGE_FIELD_GROUPS = [
  {
    key: "tenant",
    label: "Tenant",
    fields: [
      { token: "tenant_name", label: "Full name", sample: "Jordan Blake" },
      { token: "tenant_first_name", label: "First name", sample: "Jordan" },
      { token: "tenant_email", label: "Email", sample: "jordan@example.com" },
      { token: "tenant_phone", label: "Phone", sample: "(555) 201-3344" },
    ],
  },
  {
    key: "lease",
    label: "Lease",
    fields: [
      { token: "lease_name", label: "Lease name", sample: "Maple Court 4B — Blake" },
      { token: "lease_start", label: "Start date", sample: "Nov 1, 2025" },
      { token: "lease_end", label: "End date", sample: "Oct 31, 2026" },
      { token: "days_until_lease_end", label: "Days until the lease ends", sample: "45" },
      { token: "rent", label: "Monthly rent", sample: "$1,850" },
      { token: "deposit", label: "Security deposit", sample: "$1,850" },
      { token: "due_date", label: "Next rent due date", sample: "Nov 1, 2026" },
    ],
  },
  {
    key: "unit",
    label: "Unit",
    fields: [
      { token: "unit", label: "Unit (with property)", sample: "Maple Court · 4B" },
      { token: "unit_label", label: "Unit number", sample: "4B" },
    ],
  },
  {
    key: "property",
    label: "Property",
    fields: [
      { token: "property", label: "Property name", sample: "Maple Court" },
      { token: "property_address", label: "Street address", sample: "120 Maple Ave" },
      { token: "property_city", label: "City", sample: "Portland" },
    ],
  },
  {
    key: "owner",
    label: "Owner",
    fields: [
      { token: "owner_name", label: "Owner name", sample: "Rivera Holdings LLC" },
      { token: "owner_email", label: "Owner email", sample: "owner@example.com" },
    ],
  },
  {
    key: "vendor",
    label: "Vendor",
    fields: [
      { token: "vendor_name", label: "Vendor name", sample: "Brightline Plumbing" },
      { token: "vendor_email", label: "Vendor email", sample: "dispatch@brightline.example" },
    ],
  },
  {
    key: "balance",
    label: "Balance",
    fields: [
      { token: "balance", label: "Current balance", sample: "$250" },
      { token: "balance_due", label: "Balance due (or $0)", sample: "$250" },
    ],
  },
  {
    key: "general",
    label: "General",
    fields: [
      { token: "company_name", label: "Company name", sample: "Geiger Property Co." },
      { token: "today", label: "Today's date", sample: "Oct 16, 2026" },
      { token: "recipient_name", label: "Recipient name", sample: "Jordan Blake" },
    ],
  },
];

export const MERGE_FIELDS = MERGE_FIELD_GROUPS.flatMap((g) =>
  g.fields.map((f) => ({ ...f, group: g.key })),
);

export const SAMPLE_MERGE_VALUES = Object.fromEntries(MERGE_FIELDS.map((f) => [f.token, f.sample]));

const TOKEN_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

// Replace known {{tokens}} with values; unknown or empty ones stay visible (preview) or blank (send).
export function renderMerge(text, values = SAMPLE_MERGE_VALUES, { keepMissing = true } = {}) {
  return String(text || "").replace(TOKEN_RE, (match, token) => {
    const v = values?.[token.toLowerCase()];
    if (v === undefined || v === null || v === "") return keepMissing ? match : "";
    return String(v);
  });
}

// Tokens used in a text that aren't in the catalog.
export function unknownTokens(text) {
  const known = new Set(MERGE_FIELDS.map((f) => f.token));
  const found = [...String(text || "").matchAll(TOKEN_RE)].map((m) => m[1].toLowerCase());
  return [...new Set(found.filter((t) => !known.has(t)))];
}

// Known tokens used in a text that resolved to nothing for the chosen record.
export function missingTokens(text, values) {
  const found = [...String(text || "").matchAll(TOKEN_RE)].map((m) => m[1].toLowerCase());
  const known = new Set(MERGE_FIELDS.map((f) => f.token));
  return [...new Set(found.filter((t) => known.has(t) && (values?.[t] ?? "") === ""))];
}
