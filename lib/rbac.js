// Control permissions. Per-page `view.*` keys derive from sidebar titles via
// tabPermissionKey(), so they aren't listed here. `inherits` names the key a
// role falls back to when it was saved before this permission existed.
export const WORKSPACE_PERMISSIONS = [
  { key: "team.invite", label: "Invite members", group: "Team control" },
  { key: "team.assign_roles", label: "Assign roles", group: "Team control" },
  { key: "roles.manage", label: "Create and edit roles", group: "Team control" },
  { key: "billing.manage", label: "Manage billing", group: "Administration" },
  { key: "settings.manage", label: "Manage settings", group: "Administration" },
  { key: "records.delete", label: "Delete records", group: "Records" },
  { key: "accounting.post", label: "Post charges, payments, bills & journal entries", group: "Accounting controls", inherits: "view.accounting" },
  { key: "accounting.void", label: "Void ledger entries", group: "Accounting controls", inherits: "view.accounting" },
  { key: "reports.export", label: "Export reports (CSV / PDF)", group: "Report controls", inherits: "view.reports" },
  { key: "reports.schedule", label: "Schedule report emails", group: "Report controls", inherits: "view.reports" },
];

// Keys gated before per-page/action permissions existed; anything else a legacy
// role (saved without `known`) never decided on inherits from its parent.
export const LEGACY_CONTROL_KEYS = ["team.invite", "team.assign_roles", "roles.manage", "billing.manage", "settings.manage"];

export const ROLE_STORAGE_KEY = "flow.workspace.roles";

export function normalizeRoleId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function mergeWorkspaceRoles(customRoles = []) {
  const byId = new Map();

  customRoles.forEach((role) => {
    if (!role?.id) return;
    byId.set(role.id, {
      ...role,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
      system: Boolean(role.system),
    });
  });

  return Array.from(byId.values());
}

export function getRoleById(roles, roleId) {
  return (
    roles.find((role) => role.id === roleId) ||
    roles.find((role) => role.id === "manager") ||
    roles[0]
  );
}

// Does one role grant a key? Explicit grants (or "*") win; a key the role has
// explicitly decided on (in `known`) is denied; an undecided key inherits from
// resolver.parentOf(key) (page → section, action → its `inherits`), else allowed.
export function roleAllows(role, key, resolver = {}, depth = 0) {
  if (!role) return false;
  const perms = Array.isArray(role.permissions) ? role.permissions : [];
  if (perms.includes("*") || perms.includes(key)) return true;
  const known = Array.isArray(role.known) ? new Set(role.known) : resolver.legacyKnown;
  // Without a record of what was decided, a missing key is a denial.
  if (!known || known.has(key)) return false;
  const parent = resolver.parentOf?.(key);
  return parent && depth < 4 ? roleAllows(role, parent, resolver, depth + 1) : !parent;
}

export function roleHasPermission(roles, roleId, permissionKey, resolver) {
  if (!roles?.length) {
    return true;
  }

  const role = getRoleById(roles, roleId);
  return roleAllows(role, permissionKey, resolver);
}

export function tabPermissionKey(title) {
  const normalized = normalizeRoleId(title);
  return `view.${normalized}`;
}
