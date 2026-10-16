// Shared lookups, formatters, and status maps for the Maintenance area. Plain
// data (no JSX) so every maintenance screen imports the same config.

import { advanceDue, PM_FREQUENCIES } from "@/lib/maintenance/pm";

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Two-decimal currency for line items and bills.
export const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);

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

export const formatDateTime = (v) => {
  const d = parseDate(v);
  return d
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
};

// Local date → "YYYY-MM-DD" (what date columns store).
export const toDateString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const todayString = () => toDateString(new Date());

export const addDays = (days, from = new Date()) => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return toDateString(d);
};

// Whole days from today to `v` (negative when past); null when unset.
export const daysUntil = (v) => {
  const d = parseDate(v);
  if (!d) return null;
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((d - today) / 86400000);
};

// Whole days between two dates/timestamps (null when either is missing).
export const daysBetween = (a, b) => {
  const x = parseDate(a);
  const y = parseDate(b);
  if (!x || !y) return null;
  return Math.max(0, Math.round((y - x) / 86400000));
};

// Build FilterDropdown options ([{ all }, …statuses]) from a status map.
export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

// Turn a status/select map into shadcn Select options (no "all" sentinel).
export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

const opts = (list) => list.map((v) => ({ value: v, label: v }));

// Work orders share one `status` column across lenses, so this map covers both
// the work-order and request vocabularies; StatusPill renders whichever applies.
export const WORK_ORDER_STATUS_MAP = {
  Open: { label: "Open", variant: "info", dotClass: "bg-sky-400" },
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-cyan-400" },
  "In progress": { label: "In progress", variant: "purple", dotClass: "bg-violet-300" },
  "On hold": { label: "On hold", variant: "warning", dotClass: "bg-amber-400" },
  Completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  Cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-neutral-600" },
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

export const PRIORITY_OPTIONS = opts(["Low", "Medium", "High", "Urgent"]);

export const CATEGORY_OPTIONS = opts([
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliance",
  "General",
  "Landscaping",
  "Pest control",
  "Cleaning",
]);

// Subcategories per category (falls back to "Other").
export const SUBCATEGORIES = {
  Plumbing: ["Leak", "Clog / drain", "Toilet", "Water heater", "Faucet / fixture", "Sewer line", "No water"],
  Electrical: ["Outlet / switch", "Lighting", "Breaker / panel", "Smoke / CO detector", "Wiring", "Power outage"],
  HVAC: ["No heat", "No cooling", "Thermostat", "Filter change", "Noise", "Ductwork", "Ventilation"],
  Appliance: ["Refrigerator", "Stove / oven", "Dishwasher", "Washer", "Dryer", "Microwave", "Disposal"],
  General: ["Doors / locks", "Windows", "Walls / ceiling", "Flooring", "Cabinets", "Paint", "Roof"],
  Landscaping: ["Lawn care", "Trees / shrubs", "Irrigation", "Snow removal", "Hardscape"],
  "Pest control": ["Rodents", "Insects", "Bed bugs", "Termites", "Wildlife"],
  Cleaning: ["Common area", "Carpet", "Move-out clean", "Trash / debris", "Windows"],
};

export const subcategoryOptions = (category) => opts([...(SUBCATEGORIES[category] || []), "Other"]);

export const SOURCE_OPTIONS = [
  { value: "tenant", label: "Tenant request" },
  { value: "staff", label: "Staff" },
  { value: "inspection", label: "Inspection" },
  { value: "pm", label: "Preventive schedule" },
  { value: "owner", label: "Owner" },
  { value: "turn", label: "Unit turn" },
  { value: "other", label: "Other" },
];

export const CHANNEL_OPTIONS = opts(["Resident portal", "Phone", "Email", "Text", "In person", "After-hours line"]);

export const AREA_OPTIONS = opts([
  "Kitchen",
  "Bathroom",
  "Bedroom",
  "Living room",
  "Laundry",
  "Garage",
  "Basement",
  "Exterior",
  "Roof",
  "Common area",
  "Parking",
  "Whole unit",
  "Other",
]);

export const ENTRY_PERMISSION_OPTIONS = [
  { value: "allowed", label: "Entry allowed" },
  { value: "call_first", label: "Call first" },
  { value: "present", label: "Resident must be present" },
];

export const entryPermissionLabel = (v) =>
  ENTRY_PERMISSION_OPTIONS.find((o) => o.value === v)?.label || "Not set";

export const WEEKDAY_OPTIONS = opts(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

export const TIME_WINDOW_OPTIONS = opts(["Early morning", "Morning", "Midday", "Afternoon", "Evening", "Any time"]);

export const CONTACT_METHOD_OPTIONS = opts(["Phone call", "Text", "Email", "Portal message"]);

export const DISPATCH_METHOD_OPTIONS = opts(["Phone", "Email", "Vendor portal", "Text", "In person"]);

export const HOLD_REASON_OPTIONS = opts([
  "Waiting on parts",
  "Waiting on approval",
  "Waiting on tenant access",
  "Waiting on vendor",
  "Weather",
  "Other",
]);

export const CANCEL_REASON_OPTIONS = opts([
  "Duplicate request",
  "Resolved by tenant",
  "Not a maintenance issue",
  "Owner declined",
  "Other",
]);

export const ROOT_CAUSE_OPTIONS = opts([
  "Normal wear and tear",
  "Tenant damage",
  "Age of equipment",
  "Weather / environment",
  "Installation defect",
  "Unknown",
]);

export const WORK_KIND_MAP = {
  work_order: { label: "Work order", variant: "info" },
  request: { label: "Request", variant: "purple" },
};

export const WORK_KIND_OPTIONS = [
  { value: "work_order", label: "Work order" },
  { value: "request", label: "Request" },
];

// Approval workflow (metadata.approvalStatus).
export const APPROVAL_STATUS_MAP = {
  "": { label: "Not requested", variant: "neutral" },
  Pending: { label: "Awaiting approval", variant: "warning" },
  Approved: { label: "Approved", variant: "success" },
  Rejected: { label: "Rejected", variant: "danger" },
};

export const APPROVAL_METHOD_OPTIONS = opts(["Owner portal", "Email", "Phone", "Text", "In person"]);

// Estimates (record_items kind "estimate").
export const ESTIMATE_STATUS_OPTIONS = opts(["Requested", "Received", "Accepted", "Declined"]);

export const ESTIMATE_STATUS_VARIANT = {
  Requested: "neutral",
  Received: "info",
  Accepted: "success",
  Declined: "danger",
};

// Cost line items (metadata.lineItems).
export const LINE_ITEM_TYPES = [
  { value: "labor", label: "Labor" },
  { value: "material", label: "Material" },
  { value: "trip", label: "Trip charge" },
  { value: "other", label: "Other" },
];

const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round(n * 100) / 100;

export const lineItemsOf = (wo) => (Array.isArray(wo?.metadata?.lineItems) ? wo.metadata.lineItems : []);

// Line amount = qty × rate, plus markup %.
export const lineAmount = (li) => round2(num(li.qty) * num(li.rate) * (1 + num(li.markupPct) / 100));

// Column totals + tenant chargeback from a line item list.
export function lineItemTotals(list) {
  let labor = 0;
  let material = 0;
  let other = 0;
  let chargeback = 0;
  for (const li of list || []) {
    const amt = lineAmount(li);
    if (li.type === "labor") labor += amt;
    else if (li.type === "material") material += amt;
    else other += amt;
    if (li.billableToTenant) chargeback += amt;
  }
  return {
    laborCost: round2(labor),
    materialCost: round2(material),
    otherCost: round2(other),
    totalCost: round2(labor + material + other),
    tenantChargeback: round2(chargeback),
  };
}

// Closed work-order / request statuses (everything else counts as open).
export const CLOSED_WORK_STATUSES = ["Completed", "Cancelled", "Rejected", "Converted"];

export const isOpenWorkOrder = (r) => !CLOSED_WORK_STATUSES.includes(r?.status);

// Due date (metadata) passed while the work order is still open.
export const isOverdueWorkOrder = (r) => {
  const d = daysUntil(r?.metadata?.dueDate ?? r?.dueDate);
  return isOpenWorkOrder(r) && d !== null && d < 0;
};

// Completed date: metadata.completedDate, else the last Completed status entry.
export const completedDateOf = (r) => {
  const done = r?.metadata?.completedDate ?? r?.completedDate;
  if (done) return done;
  const raw = r?.metadata?.statusHistory ?? r?.statusHistory;
  const hist = Array.isArray(raw) ? raw : [];
  return hist.find((h) => h.status === "Completed")?.at?.slice(0, 10) || "";
};

export const VENDOR_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Preferred: { label: "Preferred", variant: "purple", dotClass: "bg-violet-300" },
  Inactive: { label: "Inactive", variant: "outline", dotClass: "bg-neutral-600" },
};

export const SPECIALTY_OPTIONS = opts([
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliance repair",
  "General contractor",
  "Landscaping",
  "Pest control",
  "Cleaning",
  "Roofing",
]);

export const ASSIGNMENT_STATUS_MAP = {
  Assigned: { label: "Assigned", variant: "info", dotClass: "bg-sky-400" },
  Accepted: { label: "Accepted", variant: "purple", dotClass: "bg-violet-300" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  Declined: { label: "Declined", variant: "outline", dotClass: "bg-red-400" },
};

// Preventive & Recurring schedules.
export const PM_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "outline", dotClass: "bg-neutral-500" },
  Ended: { label: "Ended", variant: "neutral", dotClass: "bg-neutral-600" },
};

export const PM_FREQUENCY_OPTIONS = opts(Object.keys(PM_FREQUENCIES));

export const PM_INTERVAL_UNIT_OPTIONS = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

export const PM_SCOPE_OPTIONS = [
  { value: "property", label: "Property-wide (one work order)" },
  { value: "unit", label: "A specific unit" },
  { value: "all_units", label: "Every unit in the property" },
  { value: "assets", label: "Listed assets / equipment" },
];

export const MONTH_OPTIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(
  (m, i) => ({ value: String(i + 1), label: m }),
);

// Advance a "YYYY-MM-DD" date by one schedule interval (legacy helper).
export const advanceByFrequency = (v, frequency) => advanceDue({ frequency }, v) || v;

// Unit turns (make-ready).
export const TURN_STATUS_MAP = {
  "Not started": { label: "Not started", variant: "neutral", dotClass: "bg-neutral-500" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Ready: { label: "Ready", variant: "success", dotClass: "bg-emerald-400" },
  Leased: { label: "Leased", variant: "info", dotClass: "bg-sky-400" },
};

export const TURN_TASK_STATUS_OPTIONS = opts(["To do", "In progress", "Blocked", "Done"]);

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

export const MOVEMENT_TYPE_MAP = {
  usage: { label: "Used", variant: "warning" },
  restock: { label: "Restock", variant: "success" },
  adjustment: { label: "Adjustment", variant: "neutral" },
};

export const INVENTORY_CATEGORY_OPTIONS = opts([
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliance",
  "Hardware",
  "Paint",
  "Cleaning",
  "Safety",
  "Other",
]);

export const UOM_OPTIONS = opts(["Each", "Box", "Case", "Pack", "Roll", "Gallon", "Foot", "Pound"]);
