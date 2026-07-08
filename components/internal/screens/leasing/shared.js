// Shared lookups, formatters, and status maps for the Leasing area. Plain data
// (no JSX) so every leasing screen imports the same config.

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

// Build FilterDropdown options ([{ all }, …statuses]) from a status map.
export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

export const LEASE_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Pending: { label: "Pending", variant: "info", dotClass: "bg-sky-400" },
  "Expiring soon": { label: "Expiring soon", variant: "warning", dotClass: "bg-amber-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  Ended: { label: "Ended", variant: "outline", dotClass: "bg-[#525252]" },
};

export const TEMPLATE_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  Published: { label: "Published", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-[#525252]" },
};

export const ESIGN_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  Sent: { label: "Sent", variant: "info", dotClass: "bg-sky-400" },
  Viewed: { label: "Viewed", variant: "purple", dotClass: "bg-violet-300" },
  Signed: { label: "Signed", variant: "success", dotClass: "bg-emerald-400" },
  Declined: { label: "Declined", variant: "warning", dotClass: "bg-red-400" },
};

export const ADDENDA_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  Attached: { label: "Attached", variant: "info", dotClass: "bg-sky-400" },
  Signed: { label: "Signed", variant: "success", dotClass: "bg-emerald-400" },
};

export const DEPOSIT_STATUS_MAP = {
  Held: { label: "Held", variant: "info", dotClass: "bg-sky-400" },
  "Partially returned": { label: "Partially returned", variant: "warning", dotClass: "bg-amber-400" },
  Returned: { label: "Returned", variant: "success", dotClass: "bg-emerald-400" },
  Forfeited: { label: "Forfeited", variant: "outline", dotClass: "bg-[#525252]" },
};

export const MOVE_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Complete: { label: "Complete", variant: "success", dotClass: "bg-emerald-400" },
};

export const INSPECTION_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Complete: { label: "Complete", variant: "success", dotClass: "bg-emerald-400" },
  Failed: { label: "Failed", variant: "warning", dotClass: "bg-red-400" },
};
