// Shared lookups, formatters, and status maps for the Maintenance area. Plain
// data (no JSX) so every maintenance screen imports the same config.

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
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

export const REQUEST_STATUS_MAP = {
  Submitted: { label: "Submitted", variant: "info", dotClass: "bg-sky-400" },
  "In review": { label: "In review", variant: "purple", dotClass: "bg-violet-300" },
  Approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  Rejected: { label: "Rejected", variant: "warning", dotClass: "bg-red-400" },
  Converted: { label: "Converted", variant: "outline", dotClass: "bg-[#525252]" },
};

// Union covering both lenses + the field lens, for the All Maintenance screen.
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
  Inactive: { label: "Inactive", variant: "outline", dotClass: "bg-[#525252]" },
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

export const ATTACHMENT_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-[#525252]" },
};

export const ATTACHMENT_CATEGORY_MAP = {
  Photo: { variant: "info" },
  Video: { variant: "purple" },
  Invoice: { variant: "warning" },
  Manual: { variant: "neutral" },
  Document: { variant: "neutral" },
};

export const ATTACHMENT_CATEGORY_OPTIONS = [
  { value: "Photo", label: "Photo" },
  { value: "Video", label: "Video" },
  { value: "Invoice", label: "Invoice" },
  { value: "Manual", label: "Manual" },
  { value: "Document", label: "Document" },
];
