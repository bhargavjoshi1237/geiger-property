// Shared lookups, formatters, and status maps for the Communications area
// (Inbox, Announcements, Message Templates, Notifications). Plain data — no JSX.

export {
  MERGE_FIELDS,
  MERGE_FIELD_GROUPS,
  SAMPLE_MERGE_VALUES,
  renderMerge,
  unknownTokens,
  missingTokens,
} from "@/lib/messaging/merge_fields";

export const formatDate = (v) =>
  v
    ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export const formatDateTime = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

// Compact relative time for thread lists ("3m", "2h", "Oct 4").
export function timeAgo(v) {
  if (!v) return "";
  const diff = Date.now() - new Date(v).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

// --- Inbox -------------------------------------------------------------------

export const INBOX_CHANNEL_LABEL = {
  email: "Email",
  sms: "SMS",
  call: "Call",
  portal: "Portal",
  note: "Note",
};

export const INBOX_CHANNEL_OPTIONS = Object.entries(INBOX_CHANNEL_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export const DIRECTION_OPTIONS = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
];

export const THREAD_STATUS_MAP = {
  Open: { label: "Open", variant: "info" },
  Waiting: { label: "Waiting on them", variant: "warning" },
  Closed: { label: "Closed", variant: "outline" },
};

export const PARTY_TYPES = [
  { value: "tenant", label: "Tenant" },
  { value: "owner", label: "Owner" },
  { value: "vendor", label: "Vendor" },
  { value: "prospect", label: "Prospect" },
];

export const PARTY_LABEL = { tenant: "Tenant", owner: "Owner", vendor: "Vendor", prospect: "Prospect", other: "Contact" };

// Sidebar screen that opens a party record.
export const PARTY_TAB = { tenant: "Tenants", owner: "Owners", vendor: "Vendors", prospect: "Prospects" };

export const DELIVERY_STATUS_MAP = {
  sent: { label: "Sent", variant: "success" },
  received: { label: "Received", variant: "info" },
  logged: { label: "Logged", variant: "neutral" },
  not_sent: { label: "Not sent", variant: "warning" },
  skipped: { label: "Skipped", variant: "outline" },
  failed: { label: "Failed", variant: "danger" },
};

// --- Announcements -----------------------------------------------------------

export const ANNOUNCEMENT_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral" },
  Scheduled: { label: "Scheduled", variant: "info" },
  Sent: { label: "Sent", variant: "success" },
};

export const AUDIENCES = ["All tenants", "Property tenants", "Building tenants", "Owners", "Vendors"];
export const BROADCAST_CHANNELS = ["Email", "SMS", "Portal"];

// --- Message templates -------------------------------------------------------

export const TEMPLATE_STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Archived: { label: "Archived", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

export const TEMPLATE_CATEGORIES = ["Leasing", "Maintenance", "Payments", "Renewals", "Collections", "General"];

// Record types a template preview can be rendered against.
export const PREVIEW_RECORD_TYPES = [
  { value: "tenant", label: "Tenant" },
  { value: "lease", label: "Lease" },
  { value: "owner", label: "Owner" },
  { value: "vendor", label: "Vendor" },
];
