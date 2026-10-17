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

// Date + time for ISO timestamps (stage history, publish times).
export const formatDateTime = (v) =>
  v
    ? new Date(v).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

// Today as a local YYYY-MM-DD string, for comparing against date columns.
export const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// YYYY-MM-DD `days` from `from` (default today).
export const addDaysISO = (days, from) => {
  const d = from ? new Date(`${String(from).slice(0, 10)}T00:00:00`) : new Date();
  d.setDate(d.getDate() + Number(days || 0));
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// YYYY-MM-DD `months` after `from`, minus one day (a lease term end).
export const termEndISO = (from, months) => {
  if (!from || !Number(months)) return "";
  const d = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  d.setMonth(d.getMonth() + Number(months));
  d.setDate(d.getDate() - 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Whole days since an ISO timestamp (null when unset).
export const daysSince = (iso) =>
  iso ? Math.max(0, Math.round((new Date().getTime() - new Date(iso).getTime()) / 86400000)) : null;

export const isPast = (iso) => Boolean(iso) && String(iso).slice(0, 10) < todayISO();

export const pct = (num, den) => (den ? `${Math.round((num / den) * 100)}%` : "—");

// Build FilterDropdown options ([{ all }, …statuses]) from a status map.
export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

// Turn a status/select map into shadcn Select options (no "all" sentinel).
export const selectOptions = (map) =>
  Object.keys(map).map((k) => ({ value: k, label: map[k].label || k }));

// Plain string list → Select options.
export const toOptions = (list) => list.map((v) => ({ value: v, label: v }));

// --- status maps ---------------------------------------------------------------

export const LISTING_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral" },
  Active: { label: "Active", variant: "success" },
  Paused: { label: "Paused", variant: "warning" },
  Leased: { label: "Leased", variant: "outline" },
  Archived: { label: "Archived", variant: "outline" },
};

// Prospect pipeline stages, in funnel order (status column).
export const PROSPECT_STAGES = ["New", "Contacted", "Touring", "Toured", "Applied", "Converted", "Lost"];

export const PROSPECT_STATUS_MAP = {
  New: { label: "New", variant: "info" },
  Contacted: { label: "Contacted", variant: "neutral" },
  Touring: { label: "Showing scheduled", variant: "purple" },
  Toured: { label: "Toured", variant: "purple" },
  Applied: { label: "Applied", variant: "warning" },
  Converted: { label: "Converted", variant: "success" },
  Leased: { label: "Leased", variant: "success" },
  Lost: { label: "Lost", variant: "outline" },
};

export const PROSPECT_WON = ["Converted", "Leased"];
export const PROSPECT_CLOSED = [...PROSPECT_WON, "Lost"];

export const SHOWING_STATUS_MAP = {
  Scheduled: { label: "Scheduled", variant: "info" },
  Confirmed: { label: "Confirmed", variant: "purple" },
  Completed: { label: "Completed", variant: "success" },
  "No-show": { label: "No-show", variant: "warning" },
  Cancelled: { label: "Cancelled", variant: "outline" },
};

export const SHOWING_OPEN = ["Scheduled", "Confirmed"];

export const APPLICATION_STATUS_MAP = {
  Submitted: { label: "Submitted", variant: "info" },
  Screening: { label: "Screening", variant: "purple" },
  Approved: { label: "Approved", variant: "success" },
  "Conditionally approved": {
    label: "Conditionally approved",
    variant: "warning",
  },
  Denied: { label: "Denied", variant: "danger" },
  Withdrawn: { label: "Withdrawn", variant: "outline" },
  Converted: { label: "Lease created", variant: "success" },
};

export const APP_IN_REVIEW = ["Submitted", "Screening"];
export const APP_APPROVED = ["Approved", "Conditionally approved", "Converted"];
export const APP_CLOSED = ["Denied", "Withdrawn"];

export const WAITLIST_STATUS_MAP = {
  Waiting: { label: "Waiting", variant: "info" },
  Offered: { label: "Offered", variant: "warning" },
  Placed: { label: "Placed", variant: "success" },
  Converted: { label: "Converted", variant: "success" },
  Declined: { label: "Declined", variant: "neutral" },
  Removed: { label: "Removed", variant: "outline" },
};

export const COMP_STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Archived: { label: "Archived", variant: "outline" },
};

// --- option lists --------------------------------------------------------------

export const SOURCE_OPTIONS = toOptions([
  "Website",
  "Zillow",
  "Apartments.com",
  "Rent.com",
  "Craigslist",
  "Facebook Marketplace",
  "Furnished Finder",
  "Referral",
  "Walk-in",
  "Phone call",
  "Social",
  "Signage",
  "Waitlist",
  "Other",
]);

export const CONTACT_METHOD_OPTIONS = toOptions(["Email", "Phone", "Text"]);
export const FOLLOW_UP_CHANNEL_OPTIONS = toOptions(["Call", "Email", "Text", "In person", "Video"]);

export const SHOWING_TYPE_OPTIONS = toOptions(["In-person", "Self-guided", "Virtual"]);
export const DURATION_OPTIONS = [15, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} min` }));
export const INTEREST_OPTIONS = toOptions(["High", "Medium", "Low", "None"]);
export const SHOWING_OUTCOME_OPTIONS = toOptions([
  "Will apply",
  "Thinking it over",
  "Wants another unit",
  "Not interested",
  "Rescheduled",
]);
export const CANCEL_REASON_OPTIONS = toOptions([
  "Prospect cancelled",
  "Agent unavailable",
  "Unit no longer available",
  "Weather",
  "Other",
]);

export const LOST_REASON_OPTIONS = toOptions([
  "Leased elsewhere",
  "Price too high",
  "Unit not available",
  "Didn't qualify",
  "Stopped responding",
  "Timing",
  "Location",
  "Other",
]);

export const LEASE_TERM_OPTIONS = toOptions([
  "Month-to-month",
  "3 months",
  "6 months",
  "9 months",
  "12 months",
  "18 months",
  "24 months",
]);

export const PET_POLICY_OPTIONS = toOptions([
  "No pets",
  "Cats only",
  "Dogs only",
  "Cats and dogs",
  "Case by case",
]);
export const PET_TYPE_OPTIONS = toOptions(["Cats", "Small dogs", "Large dogs", "Birds", "Fish", "Small animals"]);

export const LISTING_FEATURE_OPTIONS = toOptions([
  "In-unit laundry",
  "Dishwasher",
  "Air conditioning",
  "Hardwood floors",
  "Balcony / patio",
  "Walk-in closet",
  "Fireplace",
  "Stainless appliances",
  "Storage",
  "High ceilings",
  "Updated kitchen",
  "Wheelchair accessible",
]);
export const COMMUNITY_AMENITY_OPTIONS = toOptions([
  "Pool",
  "Fitness center",
  "Elevator",
  "Doorman",
  "Package lockers",
  "Bike storage",
  "Rooftop",
  "Clubhouse",
  "Dog park",
  "EV charging",
  "Gated",
  "On-site management",
]);
export const PARKING_OPTIONS = toOptions(["None", "Street", "Off-street", "Garage", "Covered", "Assigned"]);
export const LAUNDRY_OPTIONS = toOptions(["In unit", "Hookups", "Shared on site", "None"]);
export const UTILITY_OPTIONS = toOptions([
  "Water",
  "Sewer",
  "Trash",
  "Electricity",
  "Gas",
  "Internet",
  "Cable TV",
  "Heat",
]);

export const SPECIAL_TYPE_OPTIONS = toOptions([
  "Weeks free",
  "Months free",
  "Dollars off",
  "Percent off",
  "Waived fee",
  "Reduced deposit",
  "Gift card",
]);

// Listing syndication channels — internal publish tracking only (no ILS provider connected).
export const SYNDICATION_CHANNELS = [
  { key: "website", label: "Company website", kind: "Long-term" },
  { key: "zillow", label: "Zillow", kind: "Long-term" },
  { key: "apartments", label: "Apartments.com", kind: "Long-term" },
  { key: "rentcom", label: "Rent.com", kind: "Long-term" },
  { key: "craigslist", label: "Craigslist feed", kind: "Long-term" },
  { key: "facebook", label: "Facebook Marketplace", kind: "Long-term" },
  { key: "furnishedFinder", label: "Furnished Finder", kind: "Mid-term" },
  { key: "blueground", label: "Mid-term rentals (other)", kind: "Mid-term" },
];

export const CHANNEL_STATUS_MAP = {
  Off: { label: "Off", variant: "outline" },
  Queued: { label: "Queued", variant: "info" },
  Published: { label: "Published", variant: "success" },
  Paused: { label: "Paused", variant: "warning" },
  Error: { label: "Needs attention", variant: "danger" },
};

// --- applications --------------------------------------------------------------

export const SCREENING_CHECKS = [
  { key: "background", label: "Criminal background", results: ["Clear", "Records found", "Review needed"] },
  { key: "credit", label: "Credit report", results: ["Meets criteria", "Below criteria", "Thin file", "No score"], scored: true },
  { key: "eviction", label: "Eviction history", results: ["None found", "Eviction found", "Review needed"] },
  { key: "income", label: "Income verification", results: ["Verified", "Partially verified", "Unverified"] },
];

export const SCREENING_STATUS_MAP = {
  "Not started": { label: "Not started", variant: "outline" },
  Requested: { label: "Requested", variant: "info" },
  "In progress": { label: "In progress", variant: "purple" },
  Complete: { label: "Complete", variant: "success" },
  Failed: { label: "Failed", variant: "danger" },
};

export const FEE_STATUS_OPTIONS = toOptions(["Due", "Paid", "Waived", "Refunded"]);
export const FEE_KIND_OPTIONS = toOptions(["Application fee", "Holding deposit", "Admin fee", "Screening fee", "Other"]);
export const PAYMENT_METHOD_OPTIONS = toOptions(["Card", "ACH", "Check", "Cash", "Money order", "Other"]);

export const ADVERSE_ACTION_REASONS = toOptions([
  "Insufficient income",
  "Credit history",
  "Criminal history",
  "Eviction history",
  "Unverifiable information",
  "Incomplete application",
  "Negative rental reference",
  "Unit no longer available",
  "Other",
]);

export const PARTY_ROLE_OPTIONS = [
  { value: "tenant", label: "Co-applicant (on lease)" },
  { value: "cosigner", label: "Cosigner" },
  { value: "guarantor", label: "Guarantor" },
  { value: "occupant", label: "Occupant (not on lease)" },
];

// Default company screening criteria (settings key `screening_criteria`).
export const SCREENING_CRITERIA_DEFAULTS = {
  incomeMultiple: 3,
  minCreditScore: 620,
  countCoApplicantIncome: true,
  allowCosigner: true,
  evictionLookbackYears: 7,
};

export const WAITLIST_PRIORITY_OPTIONS = toOptions(["Standard", "High", "Transfer", "Accessibility", "Employee"]);
