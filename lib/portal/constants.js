// Self-service portal config shared by the server routes and the portal UI
// (isomorphic, plain data): roles, the party each role maps to, the settings
// toggle that switches a role's portal on, and the status maps the portal shows.

export const PORTAL_SETTINGS_KEY = "branding_portals";

export const PORTAL_ROLES = {
  resident: {
    label: "Resident",
    title: "Resident portal",
    toggle: "residentPortal",
    partyType: "tenant",
    partyTable: "tenants",
    partyColumn: "tenant_id",
  },
  owner: {
    label: "Owner",
    title: "Owner portal",
    toggle: "ownerPortal",
    partyType: "owner",
    partyTable: "owners",
    partyColumn: "owner_id",
  },
  vendor: {
    label: "Vendor",
    title: "Vendor portal",
    toggle: "vendorPortal",
    partyType: "vendor",
    partyTable: "vendors",
    partyColumn: "vendor_id",
  },
};

// Staff record type → portal role.
export const ROLE_FOR_PARTY = { tenant: "resident", owner: "owner", vendor: "vendor" };

export const isPortalRole = (role) => Object.prototype.hasOwnProperty.call(PORTAL_ROLES, role);

// Public bucket + prefix every portal upload lands under (one folder per member).
export const PORTAL_BUCKET = "products";
export const portalUploadPrefix = (memberId) => `property/portal/${memberId}`;

export const MEMBER_STATUS_MAP = {
  invited: { label: "Invited", variant: "info", dotClass: "bg-sky-400" },
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  disabled: { label: "Disabled", variant: "neutral", dotClass: "bg-neutral-500" },
};

// Request / work-order statuses the portals show (shared column vocabulary).
export const REQUEST_STATUS_MAP = {
  Submitted: { label: "Submitted", variant: "info", dotClass: "bg-sky-400" },
  "In review": { label: "In review", variant: "purple", dotClass: "bg-violet-300" },
  Approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  Rejected: { label: "Declined", variant: "warning", dotClass: "bg-red-400" },
  Converted: { label: "Work scheduled", variant: "info", dotClass: "bg-cyan-400" },
  Open: { label: "Open", variant: "info", dotClass: "bg-sky-400" },
  Scheduled: { label: "Scheduled", variant: "info", dotClass: "bg-cyan-400" },
  "In progress": { label: "In progress", variant: "purple", dotClass: "bg-violet-300" },
  "On hold": { label: "On hold", variant: "warning", dotClass: "bg-amber-400" },
  Completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  Cancelled: { label: "Cancelled", variant: "outline", dotClass: "bg-neutral-600" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
};

export const CLOSED_REQUEST_STATUSES = ["Completed", "Cancelled", "Rejected", "Converted"];

export const APPROVAL_STATUS_MAP = {
  Pending: { label: "Awaiting your decision", variant: "warning", dotClass: "bg-amber-400" },
  Approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  Rejected: { label: "Rejected", variant: "danger", dotClass: "bg-red-400" },
};

export const BILL_APPROVAL_MAP = {
  "Not required": { label: "Received", variant: "info", dotClass: "bg-sky-400" },
  Pending: { label: "In review", variant: "warning", dotClass: "bg-amber-400" },
  Approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  Rejected: { label: "Rejected", variant: "danger", dotClass: "bg-red-400" },
};

export const BILL_STATUS_MAP = {
  Open: { label: "Unpaid", variant: "info", dotClass: "bg-sky-400" },
  "Partially paid": { label: "Partially paid", variant: "warning", dotClass: "bg-amber-400" },
  Paid: { label: "Paid", variant: "success", dotClass: "bg-emerald-400" },
  Void: { label: "Void", variant: "outline", dotClass: "bg-neutral-600" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
};

export const COMPLIANCE_STATUS_MAP = {
  Active: { label: "Verified", variant: "success", dotClass: "bg-emerald-400" },
  Pending: { label: "In review", variant: "warning", dotClass: "bg-amber-400" },
  Cancelled: { label: "Cancelled", variant: "neutral", dotClass: "bg-neutral-500" },
  Expired: { label: "Expired", variant: "danger", dotClass: "bg-red-400" },
};

// Statuses a vendor may move an assigned work order to.
export const VENDOR_STATUS_OPTIONS = ["Scheduled", "In progress", "On hold", "Completed"];

export const CATEGORY_OPTIONS = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Appliance",
  "General",
  "Landscaping",
  "Pest control",
  "Cleaning",
];

export const AREA_OPTIONS = [
  "Kitchen",
  "Bathroom",
  "Bedroom",
  "Living room",
  "Laundry",
  "Garage",
  "Exterior",
  "Common area",
  "Parking",
  "Whole unit",
  "Other",
];

export const ENTRY_PERMISSION_OPTIONS = [
  { value: "allowed", label: "You may enter if I'm not home" },
  { value: "call_first", label: "Call me first" },
  { value: "present", label: "I need to be present" },
];

export const TIME_WINDOW_OPTIONS = ["Early morning", "Morning", "Midday", "Afternoon", "Evening", "Any time"];

export const CONTACT_CHANNEL_OPTIONS = ["Email", "Phone", "SMS", "Mail", "Portal"];

export const LANGUAGE_OPTIONS = ["English", "Spanish", "French", "Chinese", "Vietnamese", "Korean", "Arabic", "Portuguese", "Other"];
