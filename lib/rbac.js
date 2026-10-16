// Control permissions. Per-page `view.*` keys derive from sidebar titles via
// tabPermissionKey(), so they aren't listed here.
export const WORKSPACE_PERMISSIONS = [
  { key: "team.invite", label: "Invite members", group: "Team control" },
  { key: "team.assign_roles", label: "Assign roles", group: "Team control" },
  { key: "roles.manage", label: "Create and edit roles", group: "Team control" },
  { key: "billing.manage", label: "Manage billing", group: "Administration" },
  { key: "settings.manage", label: "Manage settings", group: "Administration" },
];

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

export function roleHasPermission(roles, roleId, permissionKey) {
  if (!roles?.length) {
    return true;
  }

  const role = getRoleById(roles, roleId);
  return Boolean(role?.permissions?.includes(permissionKey));
}

export function tabPermissionKey(title) {
  const normalized = normalizeRoleId(title);
  return `view.${normalized}`;
}
