// Shared lookups, formatters, and status maps for the Maintenance area. Plain
// data (no JSX) so every maintenance screen imports the same config.

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Parse a date column; date-only strings ("YYYY-MM-DD") are read as local dates.
export const parseDate = (v) => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDate = (v) => {
  const d = parseDate(v);
  return d
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
};

// Local date → "YYYY-MM-DD" (what date columns store).
export const toDateString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayString = () => toDateString(new Date());

// Whole days from today to `v` (negative when past); null when unset.
export const daysUntil = (v) => {
  const d = parseDate(v);
  if (!d) return null;
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((d - today) / 86400000);
};

// Build FilterDropdown options ([{ all }, …statuses]) from a status map.
export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

// Turn a status/select map into shadcn Select options (no "all" sentinel).
export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

// Work orders share one `status` column across lenses, so this map covers both
// the work-order and request vocabularies; StatusPill renders whichever applies.
export const WORK_ORDER_STATUS_MAP = {
  Open: { label: "Open", variant: "info", dotClass: "bg-sky-400" },
  "In progress": { label: "In progress", variant: "purple", dotClass: "bg-violet-300" },
  "On hold": { label: "On hold", variant: "warning", dotClass: "bg-amber-400" },
  Completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
};

export const REQUEST_STATUS_MAP = {
  Submitted: { label: "Submitted", variant: "info", dotClass: "bg-sky-400" },
  "In review": { label: "In review", variant: "purple", dotClass: "bg-violet-300" },
  Approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  Rejected: { label: "Rejected", variant: "warning", dotClass: "bg-red-400" },
  Converted: { label: "Converted", variant: "outline", dotClass: "bg-neutral-600" },
};

// Union of both vocabularies, used by the merged Work Orders screen.
export const MAINTENANCE_STATUS_MAP = {
  ...WORK_ORDER_STATUS_MAP,
  ...REQUEST_STATUS_MAP,
};

export const PRIORITY_MAP = {
  Low: { variant: "neutral" },
  Medium: { variant: "info" },
  High: { variant: "warning" },
  Urgent: { variant: "danger" },
};

export const PRIORITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Urgent", label: "Urgent" },
];

export const CATEGORY_OPTIONS = [
  { value: "Plumbing", label: "Plumbing" },
  { value: "Electrical", label: "Electrical" },
  { value: "HVAC", label: "HVAC" },
  { value: "Appliance", label: "Appliance" },
  { value: "General", label: "General" },
  { value: "Landscaping", label: "Landscaping" },
  { value: "Pest control", label: "Pest control" },
  { value: "Cleaning", label: "Cleaning" },
];

export const VENDOR_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Preferred: { label: "Preferred", variant: "purple", dotClass: "bg-violet-300" },
  Inactive: { label: "Inactive", variant: "outline", dotClass: "bg-neutral-600" },
};

export const SPECIALTY_OPTIONS = [
  { value: "Plumbing", label: "Plumbing" },
  { value: "Electrical", label: "Electrical" },
  { value: "HVAC", label: "HVAC" },
  { value: "Appliance repair", label: "Appliance repair" },
  { value: "General contractor", label: "General contractor" },
  { value: "Landscaping", label: "Landscaping" },
  { value: "Pest control", label: "Pest control" },
  { value: "Cleaning", label: "Cleaning" },
  { value: "Roofing", label: "Roofing" },
];

export const ASSIGNMENT_STATUS_MAP = {
  Assigned: { label: "Assigned", variant: "info", dotClass: "bg-sky-400" },
  Accepted: { label: "Accepted", variant: "purple", dotClass: "bg-violet-300" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  Declined: { label: "Declined", variant: "outline", dotClass: "bg-red-400" },
};

// Closed work-order / request statuses (everything else counts as open).
export const CLOSED_WORK_STATUSES = ["Completed", "Rejected", "Converted"];

export const WORK_KIND_MAP = {
  work_order: { label: "Work order", variant: "info" },
  request: { label: "Request", variant: "purple" },
};

export const WORK_KIND_OPTIONS = [
  { value: "work_order", label: "Work order" },
  { value: "request", label: "Request" },
];

// Preventive & Recurring schedules.
export const PM_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "outline", dotClass: "bg-neutral-500" },
};

export const PM_FREQUENCY_OPTIONS = [
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "Semi-annually", label: "Semi-annually" },
  { value: "Annually", label: "Annually" },
];

// Advance a "YYYY-MM-DD" date by one schedule interval (from today when unset).
export const advanceByFrequency = (v, frequency) => {
  const d = parseDate(v) || new Date();
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const months = { Monthly: 1, Quarterly: 3, "Semi-annually": 6, Annually: 12 }[frequency];
  if (frequency === "Weekly") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + (months || 1));
  return toDateString(next);
};

// Unit turns (make-ready).
export const TURN_STATUS_MAP = {
  "Not started": { label: "Not started", variant: "neutral", dotClass: "bg-neutral-500" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Ready: { label: "Ready", variant: "success", dotClass: "bg-emerald-400" },
  Leased: { label: "Leased", variant: "info", dotClass: "bg-sky-400" },
};

// Standard make-ready tasks seeded onto a new turn's checklist.
export const TURN_CHECKLIST_TEMPLATE = [
  "Move-out inspection",
  "Repairs & punch list",
  "Paint & touch-ups",
  "Flooring / carpet clean",
  "Deep clean",
  "Replace locks / re-key",
  "Final walkthrough",
];

// Inventory & Parts — status is derived from quantity vs reorder level.
export const STOCK_STATUS_MAP = {
  "In stock": { label: "In stock", variant: "success", dotClass: "bg-emerald-400" },
  Low: { label: "Low", variant: "warning", dotClass: "bg-amber-400" },
  "Out of stock": { label: "Out of stock", variant: "danger", dotClass: "bg-red-400" },
};

export const stockStatus = (row) => {
  const qty = Number(row?.quantity) || 0;
  if (qty <= 0) return "Out of stock";
  if (qty <= (Number(row?.reorderLevel) || 0)) return "Low";
  return "In stock";
};

export const INVENTORY_CATEGORY_OPTIONS = [
  { value: "Plumbing", label: "Plumbing" },
  { value: "Electrical", label: "Electrical" },
  { value: "HVAC", label: "HVAC" },
  { value: "Appliance", label: "Appliance" },
  { value: "Hardware", label: "Hardware" },
  { value: "Paint", label: "Paint" },
  { value: "Cleaning", label: "Cleaning" },
  { value: "Safety", label: "Safety" },
  { value: "Other", label: "Other" },
];
