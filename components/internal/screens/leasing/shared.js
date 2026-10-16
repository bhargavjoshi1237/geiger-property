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

// Select options from a plain list of labels.
export const toOptions = (labels) => labels.map((l) => ({ value: l, label: l }));

// Whole days from today until a yyyy-mm-dd date (negative = past, null = unset).
export function daysUntil(date) {
  if (!date) return null;
  const target = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// True when a date falls within the next `days` days (today included).
export const withinDays = (date, days) => {
  const d = daysUntil(date);
  return d !== null && d >= 0 && d <= days;
};

// Shift a yyyy-mm-dd date by days/years; returns "" for an unset date.
export function shiftDate(date, { days = 0, years = 0 } = {}) {
  if (!date) return "";
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Proposed-vs-current rent change for a renewal.
export function rentIncrease(r) {
  const current = Number(r?.currentRent) || 0;
  const proposed = Number(r?.proposedRent) || 0;
  const amount = proposed - current;
  const pct = current > 0 ? (amount / current) * 100 : null;
  return { amount, pct };
}

export const formatPct = (pct) =>
  pct === null || pct === undefined ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

export const LEASE_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Pending: { label: "Pending", variant: "info", dotClass: "bg-sky-400" },
  "Expiring soon": { label: "Expiring soon", variant: "warning", dotClass: "bg-amber-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Ended: { label: "Ended", variant: "outline", dotClass: "bg-zinc-600" },
};

export const TEMPLATE_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Published: { label: "Published", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-zinc-600" },
};

export const ESIGN_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Sent: { label: "Sent", variant: "info", dotClass: "bg-sky-400" },
  Viewed: { label: "Viewed", variant: "purple", dotClass: "bg-violet-300" },
  Signed: { label: "Signed", variant: "success", dotClass: "bg-emerald-400" },
  Declined: { label: "Declined", variant: "danger", dotClass: "bg-red-400" },
};

export const ADDENDA_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Attached: { label: "Attached", variant: "info", dotClass: "bg-sky-400" },
  Signed: { label: "Signed", variant: "success", dotClass: "bg-emerald-400" },
};

export const DEPOSIT_STATUS_MAP = {
  Held: { label: "Held", variant: "info", dotClass: "bg-sky-400" },
  "Partially returned": { label: "Partially returned", variant: "warning", dotClass: "bg-amber-400" },
  Returned: { label: "Returned", variant: "success", dotClass: "bg-emerald-400" },
  Forfeited: { label: "Forfeited", variant: "outline", dotClass: "bg-zinc-600" },
};

export const MOVE_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Complete: { label: "Complete", variant: "success", dotClass: "bg-emerald-400" },
};

export const MOVE_KIND_OPTIONS = [
  { value: "in", label: "Move-in" },
  { value: "out", label: "Move-out" },
];

export const INSPECTION_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Complete: { label: "Complete", variant: "success", dotClass: "bg-emerald-400" },
  Failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
};

export const INSPECTION_TYPE_OPTIONS = toOptions(["Move-in", "Move-out", "Routine", "Annual", "Drive-by"]);

export const RENEWAL_STATUS_MAP = {
  "Not started": { label: "Not started", variant: "neutral", dotClass: "bg-zinc-500" },
  "Offer sent": { label: "Offer sent", variant: "info", dotClass: "bg-sky-400" },
  Negotiating: { label: "Negotiating", variant: "purple", dotClass: "bg-violet-300" },
  Accepted: { label: "Accepted", variant: "success", dotClass: "bg-emerald-400" },
  Declined: { label: "Declined", variant: "danger", dotClass: "bg-red-400" },
  "Moving out": { label: "Moving out", variant: "warning", dotClass: "bg-amber-400" },
};

export const RENEWAL_OPEN_STATUSES = ["Not started", "Offer sent", "Negotiating"];

export const NOTICE_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Served: { label: "Served", variant: "info", dotClass: "bg-sky-400" },
  Cured: { label: "Cured", variant: "success", dotClass: "bg-emerald-400" },
  Escalated: { label: "Escalated", variant: "danger", dotClass: "bg-red-400" },
  Closed: { label: "Closed", variant: "outline", dotClass: "bg-zinc-600" },
};

export const NOTICE_TYPE_OPTIONS = toOptions([
  "Late rent",
  "Lease violation",
  "Entry notice",
  "Non-renewal",
  "Rent increase",
  "Other",
]);

export const DELIVERY_METHOD_OPTIONS = toOptions([
  "Hand delivered",
  "Posted",
  "Certified mail",
  "Email",
  "Portal",
]);

// A notice is overdue once its cure-by date passes without being cured/closed.
export const isNoticeOverdue = (n) => {
  const d = daysUntil(n?.cureBy);
  return d !== null && d < 0 && n.status !== "Cured" && n.status !== "Closed";
};
