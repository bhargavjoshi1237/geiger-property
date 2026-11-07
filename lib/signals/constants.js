import { normalizeRoleId } from "@/lib/rbac";

// Signal vocabulary (isomorphic, plain data): areas, categories, urgency, statuses and which areas
// each role sees. Roles resolve by id or name (team_members.role holds the role's name).

export const AREAS = {
  collections: { label: "Collections", tab: "Rent Collection", view: "view.rent_collection" },
  leasing: { label: "Leasing", tab: "Leases", view: "view.leasing" },
  maintenance: { label: "Maintenance", tab: "Work Orders", view: "view.maintenance" },
  accounting: { label: "Accounting", tab: "Bills & Payables", view: "view.accounting" },
  compliance: { label: "Compliance", tab: "Vendors", view: "view.vendors" },
  automation: { label: "Automation", tab: "Run History", view: "view.automations" },
};
export const ALL_AREAS = Object.keys(AREAS);

export const CATEGORIES = {
  risk: { label: "Risk", variant: "danger" },
  trend: { label: "Trend", variant: "info" },
  watch: { label: "Watch", variant: "warning" },
  opportunity: { label: "Opportunity", variant: "success" },
};

export const URGENCY = {
  urgent: { label: "Urgent", variant: "danger" },
  soon: { label: "Soon", variant: "warning" },
  routine: { label: "Routine", variant: "neutral" },
};

export const SIGNAL_STATUS_MAP = {
  open: { label: "Open", variant: "info" },
  acknowledged: { label: "Acknowledged", variant: "neutral" },
  actioned: { label: "Actioned", variant: "purple" },
  resolved: { label: "Resolved", variant: "success" },
  expired: { label: "Expired", variant: "outline" },
};

export const LIVE_SIGNAL_STATUSES = ["open", "acknowledged", "actioned"];

// Areas a role sees by default; unknown and custom roles see every area unless Notifications says otherwise.
export const ROLE_AREA_PRESETS = {
  owner: ALL_AREAS,
  manager: ALL_AREAS,
  regional_manager: ALL_AREAS,
  property_manager: ALL_AREAS,
  admin: ALL_AREAS,
  leasing_agent: ["leasing"],
  leasing_manager: ["leasing", "collections"],
  accountant: ["accounting"],
  bookkeeper: ["accounting"],
  maintenance_tech: ["maintenance", "compliance"],
  maintenance_manager: ["maintenance", "compliance"],
};

// Roles whose members get the briefing email by default (in-app goes to everyone).
export const BRIEFING_EMAIL_ROLES = ["owner", "manager", "regional_manager", "property_manager"];

export const roleKeyOf = (role) => normalizeRoleId(role?.id || role?.name || role);

// overrides: { [roleKey]: [areas] } from the notifications setting (briefing.roleAreas).
export function areasForRole(role, overrides = {}) {
  const key = roleKeyOf(role);
  const custom = overrides?.[key];
  if (Array.isArray(custom)) return custom.filter((a) => AREAS[a]);
  return ROLE_AREA_PRESETS[key] || ALL_AREAS;
}

export const signalVisibleTo = (signal, areas) => !areas || areas.includes(signal.area);
