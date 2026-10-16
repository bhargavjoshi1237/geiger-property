// Shared lookups, formatters, and status maps for the Communications area
// (Inbox, Announcements, Message Templates). Plain data — no JSX.

export const formatDate = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Build FilterDropdown options ([{ all }, …statuses]) from a status map.
export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

// Turn a status map into shadcn Select options (no "all" sentinel).
export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

// Plain string list → Select options.
export const listOptions = (values) => values.map((v) => ({ value: v, label: v }));

// --- Inbox (tenant_communications) -------------------------------------------

// Channel values stored in `tenant_communications.channel` (lowercase keys).
export const INBOX_CHANNEL_LABEL = {
  email: "Email",
  sms: "SMS",
  call: "Call",
  portal: "Portal",
  note: "Note",
};

export const INBOX_CHANNEL_OPTIONS = Object.entries(INBOX_CHANNEL_LABEL).map(
  ([value, label]) => ({ value, label }),
);

export const DIRECTION_OPTIONS = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
];

// --- Announcements -----------------------------------------------------------

export const ANNOUNCEMENT_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  Sent: { label: "Sent", variant: "success", dotClass: "bg-emerald-400" },
};

export const AUDIENCES = ["All tenants", "Property tenants", "Owners", "Vendors"];
export const BROADCAST_CHANNELS = ["Email", "SMS", "Portal"];

// --- Message templates -------------------------------------------------------

export const TEMPLATE_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-[#525252]" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

export const TEMPLATE_CATEGORIES = ["Leasing", "Maintenance", "Payments", "General"];

// Merge fields a template body may use, with the sample values the preview fills in.
export const MERGE_FIELDS = [
  { token: "tenant_name", label: "Tenant name", sample: "Jordan Blake" },
  { token: "unit", label: "Unit", sample: "Maple Court · 4B" },
  { token: "rent", label: "Monthly rent", sample: "$1,850" },
  { token: "due_date", label: "Due date", sample: "Nov 1, 2026" },
  { token: "property", label: "Property", sample: "Maple Court" },
];

// Replace every known {{token}} with its sample value; unknown tokens stay visible.
export function fillMergeFields(text) {
  const samples = Object.fromEntries(MERGE_FIELDS.map((f) => [f.token, f.sample]));
  return String(text || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, token) =>
    token.toLowerCase() in samples ? samples[token.toLowerCase()] : match,
  );
}

// Tokens used in a text that aren't in MERGE_FIELDS (shown as a warning).
export function unknownTokens(text) {
  const known = new Set(MERGE_FIELDS.map((f) => f.token));
  const found = [...String(text || "").matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) =>
    m[1].toLowerCase(),
  );
  return [...new Set(found.filter((t) => !known.has(t)))];
}
