// Shared lookups, formatters, and status maps for the Leasing area. Plain data
// (no JSX) so every leasing screen imports the same config.

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

export const money2 = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

export const formatDate = (v) =>
  v
    ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v).toLocaleDateString("en-US", {
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

export const optionLabel = (options, v) => options.find((o) => o.value === v)?.label || v || "—";

export const todayISO = () => new Date().toISOString().slice(0, 10);

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

// Shift a yyyy-mm-dd date by days/months/years; returns "" for an unset date.
export function shiftDate(date, { days = 0, months = 0, years = 0 } = {}) {
  if (!date) return "";
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + years);
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Whole months between two yyyy-mm-dd dates (0 when unset).
export function monthsBetween(start, end) {
  if (!start || !end) return 0;
  const a = new Date(`${String(start).slice(0, 10)}T00:00:00`);
  const b = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() - 1 ? 1 : 0);
  return Math.max(0, m);
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

// A metadata list on a record (falls back to the spread first-class key).
export const metaList = (r, key) =>
  Array.isArray(r?.metadata?.[key]) ? r.metadata[key] : Array.isArray(r?.[key]) ? r[key] : [];

export const sumBy = (rows, key = "amount") => rows.reduce((s, r) => s + (Number(r?.[key]) || 0), 0);

// --- Leases ----------------------------------------------------------------

export const LEASE_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Pending: { label: "Pending", variant: "info", dotClass: "bg-sky-400" },
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  "Expiring soon": { label: "Expiring soon", variant: "warning", dotClass: "bg-amber-400" },
  "Month-to-month": { label: "Month-to-month", variant: "purple", dotClass: "bg-violet-300" },
  "Notice given": { label: "Notice given", variant: "warning", dotClass: "bg-orange-400" },
  Eviction: { label: "Eviction", variant: "danger", dotClass: "bg-red-400" },
  Renewed: { label: "Renewed", variant: "outline", dotClass: "bg-teal-400" },
  Terminated: { label: "Terminated", variant: "outline", dotClass: "bg-red-300" },
  Ended: { label: "Ended", variant: "outline", dotClass: "bg-zinc-600" },
};

// Statuses where the lease is in force (rent is owed, the unit is occupied).
export const LIVE_LEASE_STATUSES = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction"];
export const isLiveLease = (r) => LIVE_LEASE_STATUSES.includes(r?.status);
export const CLOSED_LEASE_STATUSES = ["Renewed", "Terminated", "Ended"];

export const LEASE_TYPE_OPTIONS = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
];

export const TERM_TYPE_OPTIONS = [
  { value: "fixed", label: "Fixed term" },
  { value: "mtm", label: "Month-to-month" },
];

export const PARTY_ROLE_OPTIONS = [
  { value: "tenant", label: "Tenant" },
  { value: "cosigner", label: "Co-signer" },
  { value: "guarantor", label: "Guarantor" },
  { value: "occupant", label: "Occupant" },
];

export const partyRoleLabel = (v) => optionLabel(PARTY_ROLE_OPTIONS, v || "tenant");

export const TEMPLATE_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Published: { label: "Published", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-zinc-600" },
};

export const ESIGN_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Sent: { label: "Sent", variant: "info", dotClass: "bg-sky-400" },
  Viewed: { label: "Viewed", variant: "purple", dotClass: "bg-violet-300" },
  "Partially signed": { label: "Partially signed", variant: "warning", dotClass: "bg-amber-400" },
  Signed: { label: "Signed", variant: "success", dotClass: "bg-emerald-400" },
  Declined: { label: "Declined", variant: "danger", dotClass: "bg-red-400" },
  Voided: { label: "Voided", variant: "outline", dotClass: "bg-zinc-600" },
};

export const ADDENDA_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Attached: { label: "Attached", variant: "info", dotClass: "bg-sky-400" },
  Signed: { label: "Signed", variant: "success", dotClass: "bg-emerald-400" },
};

// --- Deposits ----------------------------------------------------------------

export const DEPOSIT_STATUS_MAP = {
  Pending: { label: "Pending", variant: "neutral", dotClass: "bg-zinc-500" },
  Held: { label: "Held", variant: "info", dotClass: "bg-sky-400" },
  "Awaiting disposition": { label: "Awaiting disposition", variant: "warning", dotClass: "bg-amber-400" },
  "Partially returned": { label: "Partially returned", variant: "warning", dotClass: "bg-orange-400" },
  Returned: { label: "Returned", variant: "success", dotClass: "bg-emerald-400" },
  Forfeited: { label: "Forfeited", variant: "outline", dotClass: "bg-zinc-600" },
};

export const DEPOSIT_OPEN_STATUSES = ["Pending", "Held", "Awaiting disposition"];

export const DEPOSIT_KIND_OPTIONS = toOptions(["Security deposit", "Pet deposit", "Key deposit", "Last month's rent", "Other"]);

export const DEDUCTION_CATEGORY_OPTIONS = toOptions([
  "Cleaning",
  "Damage repair",
  "Painting",
  "Carpet / flooring",
  "Unpaid rent",
  "Unpaid utilities",
  "Key / lock replacement",
  "Trash removal",
  "Other",
]);

export const REFUND_METHOD_OPTIONS = [
  { value: "Check", label: "Check" },
  { value: "ACH", label: "Bank (ACH)" },
  { value: "Card", label: "Card refund" },
  { value: "Applied to balance", label: "Applied to balance" },
];

// --- Moves & inspections -----------------------------------------------------

export const MOVE_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-sky-400" },
  "In progress": { label: "In progress", variant: "warning", dotClass: "bg-amber-400" },
  Complete: { label: "Complete", variant: "success", dotClass: "bg-emerald-400" },
  Cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-zinc-600" },
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

export const INSPECTION_TYPE_OPTIONS = [
  { value: "move_in", label: "Move-in" },
  { value: "move_out", label: "Move-out" },
  { value: "routine", label: "Routine" },
  { value: "annual", label: "Annual" },
  { value: "drive_by", label: "Drive-by" },
];

// Tolerant reader: older rows stored labels ("Move-in") or metadata.inspectionType.
export function inspectionKindOf(r) {
  const raw = String(r?.kind || r?.metadata?.inspectionType || "").trim().toLowerCase();
  const hit = INSPECTION_TYPE_OPTIONS.find((o) => o.value === raw || o.label.toLowerCase() === raw);
  return hit?.value || "";
}
export const inspectionKindLabel = (r) => optionLabel(INSPECTION_TYPE_OPTIONS, inspectionKindOf(r));

// Condition scale for inspection items (score 5 = best).
export const CONDITION_SCALE = [
  { value: "new", label: "New", score: 5, variant: "success" },
  { value: "good", label: "Good", score: 4, variant: "info" },
  { value: "fair", label: "Fair", score: 3, variant: "neutral" },
  { value: "poor", label: "Poor", score: 2, variant: "warning" },
  { value: "damaged", label: "Damaged", score: 1, variant: "danger" },
];
export const conditionOf = (v) => CONDITION_SCALE.find((c) => c.value === v) || null;

// --- Renewals ----------------------------------------------------------------

export const RENEWAL_STATUS_MAP = {
  "Not started": { label: "Not started", variant: "neutral", dotClass: "bg-zinc-500" },
  "Offer sent": { label: "Offer sent", variant: "info", dotClass: "bg-sky-400" },
  Negotiating: { label: "Negotiating", variant: "purple", dotClass: "bg-violet-300" },
  Accepted: { label: "Accepted", variant: "success", dotClass: "bg-emerald-400" },
  Declined: { label: "Declined", variant: "danger", dotClass: "bg-red-400" },
  "Moving out": { label: "Moving out", variant: "warning", dotClass: "bg-amber-400" },
};

export const RENEWAL_OPEN_STATUSES = ["Not started", "Offer sent", "Negotiating"];

// --- Notices -----------------------------------------------------------------

export const NOTICE_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-zinc-500" },
  Served: { label: "Served", variant: "info", dotClass: "bg-sky-400" },
  Received: { label: "Received", variant: "purple", dotClass: "bg-violet-300" },
  Cured: { label: "Cured", variant: "success", dotClass: "bg-emerald-400" },
  Escalated: { label: "Escalated", variant: "danger", dotClass: "bg-red-400" },
  Closed: { label: "Closed", variant: "outline", dotClass: "bg-zinc-600" },
};

export const NOTICE_TYPE_OPTIONS = toOptions([
  "Late rent",
  "Pay or quit",
  "Cure or quit",
  "Unconditional quit",
  "Lease violation",
  "Entry notice",
  "Notice to vacate",
  "Non-renewal",
  "Rent increase",
  "Eviction notice",
  "Other",
]);

export const DELIVERY_METHOD_OPTIONS = toOptions([
  "Hand delivered",
  "Posted",
  "Certified mail",
  "First-class mail",
  "Email",
  "Portal",
]);

export const NOTICE_DIRECTION_OPTIONS = [
  { value: "outgoing", label: "Served to tenant" },
  { value: "incoming", label: "Received from tenant" },
];

// A notice is overdue once its cure-by date passes without being cured/closed.
export const isNoticeOverdue = (n) => {
  const d = daysUntil(n?.cureBy);
  return d !== null && d < 0 && n.status !== "Cured" && n.status !== "Closed";
};

// --- Lifecycle lookups -------------------------------------------------------

export const MOVE_OUT_REASON_OPTIONS = toOptions([
  "End of term",
  "Bought a home",
  "Relocating for work",
  "Rent too high",
  "Needs more space",
  "Unhappy with property",
  "Early termination",
  "Eviction",
  "Other",
]);

export const TERMINATION_REASON_OPTIONS = toOptions([
  "Tenant request",
  "Job relocation",
  "Military orders (SCRA)",
  "Domestic violence protection",
  "Landlord buyout",
  "Mutual agreement",
  "Other",
]);

export const EVICTION_STAGE_OPTIONS = toOptions([
  "Notice served",
  "Cure period",
  "Filed with court",
  "Hearing scheduled",
  "Judgment entered",
  "Writ issued",
  "Possession recovered",
  "Settled",
  "Dismissed",
]);

export const EVICTION_REASON_OPTIONS = toOptions([
  "Nonpayment of rent",
  "Lease violation",
  "Criminal activity",
  "Property damage",
  "Holdover after term",
  "Other",
]);

// --- Money on the lease ------------------------------------------------------

export const UTILITIES = [
  { key: "electric", label: "Electric" },
  { key: "gas", label: "Gas" },
  { key: "water", label: "Water" },
  { key: "sewer", label: "Sewer" },
  { key: "trash", label: "Trash" },
  { key: "internet", label: "Internet" },
  { key: "cable", label: "Cable / TV" },
  { key: "pest", label: "Pest control" },
  { key: "landscaping", label: "Landscaping" },
  { key: "snow", label: "Snow removal" },
];

export const UTILITY_RESPONSIBILITY_OPTIONS = [
  { value: "tenant", label: "Tenant" },
  { value: "landlord", label: "Landlord" },
  { value: "split", label: "Shared" },
  { value: "na", label: "Not provided" },
];

export const UTILITY_BILLING_OPTIONS = [
  { value: "direct", label: "Tenant pays provider" },
  { value: "included", label: "Included in rent" },
  { value: "rubs", label: "Billed back (RUBS)" },
  { value: "submeter", label: "Submetered" },
  { value: "flat", label: "Flat monthly fee" },
];

export const CHARGE_TYPE_OPTIONS = toOptions([
  "Pet rent",
  "Parking",
  "Storage",
  "Utilities",
  "Trash",
  "Internet",
  "Amenity fee",
  "Furniture",
  "Resident benefits package",
  "Other",
]);

export const FREQUENCY_OPTIONS = toOptions(["Monthly", "Quarterly", "Semi-annually", "Annually", "Weekly"]);

// Resident benefits package building blocks (billed as one recurring charge).
export const BENEFIT_CATALOG = [
  { key: "insurance", label: "Renters insurance (master policy)", price: 12 },
  { key: "credit", label: "Rent payment credit reporting", price: 5 },
  { key: "filters", label: "HVAC filter delivery", price: 6 },
  { key: "identity", label: "Identity protection", price: 4 },
  { key: "concierge", label: "Move-in utility concierge", price: 3 },
  { key: "maintenance", label: "24/7 maintenance hotline", price: 5 },
  { key: "pest", label: "On-demand pest control", price: 6 },
  { key: "rewards", label: "Resident rewards program", price: 2 },
];

export const CONCESSION_TYPE_OPTIONS = [
  { value: "free_month", label: "Free month(s)" },
  { value: "amount_off", label: "Amount off monthly rent" },
  { value: "percent_off", label: "Percent off monthly rent" },
  { value: "one_time", label: "One-time credit" },
  { value: "waived_fee", label: "Waived fee" },
];

export const MOVE_IN_CHARGE_OPTIONS = toOptions([
  "Admin fee",
  "Move-in fee",
  "Key / fob fee",
  "Pet fee (non-refundable)",
  "Amenity fee",
  "Last month's rent",
  "Other",
]);

export const DEPOSIT_ALTERNATIVE_OPTIONS = [
  { value: "surety", label: "Surety bond" },
  { value: "insurance", label: "Deposit insurance" },
  { value: "installments", label: "Deposit in installments" },
];

export const ACCESS_TYPE_OPTIONS = toOptions([
  "Door keypad",
  "Smart lock",
  "Gate code",
  "Garage",
  "Mailbox",
  "Amenity",
  "Physical key",
  "Fob",
]);

export const ACCESS_STATUS_OPTIONS = toOptions(["Active", "Scheduled", "Expired", "Revoked"]);
export const ACCESS_STATUS_VARIANT = { Active: "success", Scheduled: "info", Expired: "neutral", Revoked: "danger" };

// Random numeric access code (crypto-backed).
export function generateAccessCode(length = 6) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}
