// Lookups, option lists and formatters shared by the Properties, Buildings and
// Portfolios editors. Config only — never row data.

export const PROPERTY_STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Vacant: { label: "Vacant", variant: "info" },
  Maintenance: { label: "Maintenance", variant: "purple" },
  Draft: { label: "Draft", variant: "neutral" },
  "Off-market": { label: "Off-market", variant: "outline" },
  Inactive: { label: "Inactive", variant: "outline" },
  Archived: { label: "Archived", variant: "outline" },
};

export const PROPERTY_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.keys(PROPERTY_STATUS_MAP).map((k) => ({ value: k, label: k })),
];

export const PROPERTY_TYPE_MAP = {
  "Single-family": { variant: "neutral" },
  "Multi-family": { variant: "neutral" },
  Apartment: { variant: "neutral" },
  Condo: { variant: "neutral" },
  Townhome: { variant: "neutral" },
  HOA: { variant: "neutral" },
  Commercial: { variant: "neutral" },
  "Mixed-use": { variant: "neutral" },
  "Student housing": { variant: "neutral" },
  "Senior living": { variant: "neutral" },
  "Manufactured housing": { variant: "neutral" },
};

export const PROPERTY_TYPE_OPTIONS = Object.keys(PROPERTY_TYPE_MAP).map((k) => ({
  value: k,
  label: k === "HOA" ? "HOA community" : k,
}));

// Types that carry an association (HOA / condo board).
export const ASSOCIATION_TYPES = ["Condo", "Townhome", "HOA"];
export const hasAssociation = (item) =>
  ASSOCIATION_TYPES.includes(item?.type) || Boolean(item?.metadata?.hasAssociation ?? item?.hasAssociation);

export const COMMERCIAL_TYPES = ["Commercial", "Mixed-use"];

export const BUILDING_STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  "Under construction": { label: "Under construction", variant: "warning" },
  Inactive: { label: "Inactive", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
  Archived: { label: "Archived", variant: "outline" },
};

export const PORTFOLIO_STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Draft: { label: "Draft", variant: "neutral" },
  Inactive: { label: "Inactive", variant: "outline" },
  Archived: { label: "Archived", variant: "outline" },
};

export const UNIT_STATUS_MAP = {
  Occupied: { label: "Occupied", variant: "success" },
  Vacant: { label: "Vacant", variant: "info" },
  Notice: { label: "Notice", variant: "warning" },
  "Make-ready": { label: "Make-ready", variant: "purple" },
  Down: { label: "Down", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

export const UNIT_STATUS_OPTIONS = Object.keys(UNIT_STATUS_MAP).map((k) => ({ value: k, label: k }));

export const STRUCTURE_OPTIONS = ["Low-rise", "Mid-rise", "High-rise", "Townhome", "Garden", "Detached", "Podium"].map(
  (v) => ({ value: v, label: v }),
);

export const CLASS_OPTIONS = ["A", "B", "C", "D"].map((v) => ({ value: v, label: `Class ${v}` }));

export const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((m, i) => ({ value: String(i + 1), label: m }));

export const PORTFOLIO_COLOR_OPTIONS = ["emerald", "sky", "violet", "amber", "rose"].map((v) => ({
  value: v,
  label: v[0].toUpperCase() + v.slice(1),
}));

export const opts = (...values) => values.map((v) => ({ value: v, label: v }));

// --- status tones for related tables ----------------------------------------

const TONES = {
  success: ["Active", "Occupied", "Completed", "Complete", "Published", "Compliant", "Signed", "In service", "Available", "Paid"],
  info: ["Open", "Pending", "Vacant", "Scheduled", "Assigned", "Sent", "New", "Draft listing"],
  warning: ["Expiring soon", "In progress", "Notice", "On hold", "Due soon", "Action needed", "Needs repair", "Checked out", "Make-ready"],
  danger: ["Overdue", "Failed", "Urgent", "Expired", "Lost", "Emergency", "Down"],
  outline: ["Ended", "Archived", "Inactive", "Retired", "Closed", "Cancelled", "Rejected", "Out of service"],
};

export function statusTone(status) {
  for (const [tone, list] of Object.entries(TONES)) if (list.includes(status)) return tone;
  return "neutral";
}

// --- formatters --------------------------------------------------------------

export const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Number(n) || 0,
  );

export const pct = (n) => `${Math.round(Number(n) || 0)}%`;

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

// Whole days from today until an ISO date (negative when past); null when unset.
export function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(`${todayISO()}T00:00:00`);
  return Math.round((d - today) / 86400000);
}

// Badge for a dated record: expired / expiring soon / current.
export function expiryBadge(endsOn, { soonDays = 60, active = "Current" } = {}) {
  const days = daysUntil(endsOn);
  if (days === null) return { badge: null, variant: "neutral", days };
  if (days < 0) return { badge: "Expired", variant: "danger", days };
  if (days <= soonDays) return { badge: `Expires in ${days}d`, variant: "warning", days };
  return { badge: active, variant: "success", days };
}

export const dateRange = (a, b) => (a || b ? `${formatDate(a)} – ${b ? formatDate(b) : "open"}` : "");

export function addMonths(iso, months) {
  if (!iso || !months) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + Number(months));
  return d.toISOString().slice(0, 10);
}
