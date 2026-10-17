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
  invited: { label: "Invited", variant: "info" },
  active: { label: "Active", variant: "success" },
  disabled: { label: "Disabled", variant: "neutral" },
};

// Request / work-order statuses the portals show (shared column vocabulary).
export const REQUEST_STATUS_MAP = {
  Submitted: { label: "Submitted", variant: "info" },
  "In review": { label: "In review", variant: "purple" },
  Approved: { label: "Approved", variant: "success" },
  Rejected: { label: "Declined", variant: "warning" },
  Converted: { label: "Work scheduled", variant: "info" },
  Open: { label: "Open", variant: "info" },
  Scheduled: { label: "Scheduled", variant: "info" },
  "In progress": { label: "In progress", variant: "purple" },
  "On hold": { label: "On hold", variant: "warning" },
  Completed: { label: "Completed", variant: "success" },
  Cancelled: { label: "Cancelled", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

export const CLOSED_REQUEST_STATUSES = ["Completed", "Cancelled", "Rejected", "Converted"];

export const APPROVAL_STATUS_MAP = {
  Pending: { label: "Awaiting your decision", variant: "warning" },
  Approved: { label: "Approved", variant: "success" },
  Rejected: { label: "Rejected", variant: "danger" },
};

export const BILL_APPROVAL_MAP = {
  "Not required": { label: "Received", variant: "info" },
  Pending: { label: "In review", variant: "warning" },
  Approved: { label: "Approved", variant: "success" },
  Rejected: { label: "Rejected", variant: "danger" },
};

export const BILL_STATUS_MAP = {
  Open: { label: "Unpaid", variant: "info" },
  "Partially paid": { label: "Partially paid", variant: "warning" },
  Paid: { label: "Paid", variant: "success" },
  Void: { label: "Void", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

export const COMPLIANCE_STATUS_MAP = {
  Active: { label: "Verified", variant: "success" },
  Pending: { label: "In review", variant: "warning" },
  Cancelled: { label: "Cancelled", variant: "neutral" },
  Expired: { label: "Expired", variant: "danger" },
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
