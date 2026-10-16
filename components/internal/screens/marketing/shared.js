// Shared lookups, formatters, and status maps for the Marketing & Leads area.
// Plain data (no JSX) so every marketing screen imports the same config.

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

export const formatDate = (v) =>
  v
    ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

// Today as a local YYYY-MM-DD string, for comparing against date columns.
export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Build FilterDropdown options ([{ all }, …statuses]) from a status map.
export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

// Turn a status/select map into shadcn Select options (no "all" sentinel).
export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

// Plain string list → Select options.
const toOptions = (list) => list.map((v) => ({ value: v, label: v }));

export const LISTING_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
  Leased: { label: "Leased", variant: "outline", dotClass: "bg-border-strong" },
};

export const PROSPECT_STATUS_MAP = {
  New: { label: "New", variant: "info", dotClass: "bg-sky-400" },
  Contacted: { label: "Contacted", variant: "neutral", dotClass: "bg-text-tertiary" },
  Touring: { label: "Touring", variant: "purple", dotClass: "bg-violet-300" },
  Applied: { label: "Applied", variant: "warning", dotClass: "bg-amber-400" },
  Leased: { label: "Leased", variant: "success", dotClass: "bg-emerald-400" },
  Lost: { label: "Lost", variant: "outline", dotClass: "bg-border-strong" },
};

export const SHOWING_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  Completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  "No-show": { label: "No-show", variant: "warning", dotClass: "bg-amber-400" },
  Cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-border-strong" },
};

export const APPLICATION_STATUS_MAP = {
  Submitted: { label: "Submitted", variant: "info", dotClass: "bg-sky-400" },
  Screening: { label: "Screening", variant: "purple", dotClass: "bg-violet-300" },
  Approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  "Conditionally approved": {
    label: "Conditionally approved",
    variant: "warning",
    dotClass: "bg-amber-400",
  },
  Denied: { label: "Denied", variant: "danger", dotClass: "bg-red-400" },
  Withdrawn: { label: "Withdrawn", variant: "outline", dotClass: "bg-border-strong" },
};

export const WAITLIST_STATUS_MAP = {
  Waiting: { label: "Waiting", variant: "info", dotClass: "bg-sky-400" },
  Offered: { label: "Offered", variant: "warning", dotClass: "bg-amber-400" },
  Converted: { label: "Converted", variant: "success", dotClass: "bg-emerald-400" },
  Removed: { label: "Removed", variant: "outline", dotClass: "bg-border-strong" },
};

export const COMP_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-border-strong" },
};

export const SOURCE_OPTIONS = toOptions([
  "Website",
  "Zillow",
  "Apartments.com",
  "Referral",
  "Walk-in",
  "Social",
  "Other",
]);

export const SHOWING_TYPE_OPTIONS = toOptions(["In-person", "Self-guided", "Virtual"]);

export const SYNDICATION_CHANNELS = [
  "Company website",
  "Zillow",
  "Trulia",
  "Apartments.com",
  "Rent.com",
  "Craigslist",
  "Facebook Marketplace",
];

export const BACKGROUND_OPTIONS = toOptions(["Pending", "Clear", "Flagged"]);
export const EVICTION_OPTIONS = toOptions(["None", "Found"]);
