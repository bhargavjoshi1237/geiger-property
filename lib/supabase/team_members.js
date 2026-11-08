import { makeEntityData } from "./entity_factory";
import { getActiveProjectId } from "./project_scope";
import { listGrants, listRoles, listUserGrants, revokeGrants, setMemberAccess } from "./rbac";
import { getUser } from "./user";

// Data-access layer for Team & Members — workspace members and their roles (owns `property.team_members`).
export const teamMembersLayer = makeEntityData({
  table: "team_members",
  tag: "teamMembers",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "email", col: "email", type: "text" },
    { key: "role", col: "role", type: "text" },
    { key: "status", col: "status", type: "text", default: "Invited" },
  ],
});

// Rows linked to an account (metadata.userId) read and write their role through property.role_grants; unlinked rows
// keep the role name as an invitation until rbac_ensure_membership claims it.

const projectOf = (row) => row?.projectId || getActiveProjectId();

async function list() {
  const rows = await teamMembersLayer.list();
  if (!rows?.some((m) => m.userId)) return rows;
  const [roles, grants] = await Promise.all([listRoles(), listGrants()]);
  if (!roles || !grants) return rows;
  return rows.map((m) => {
    const held = m.userId
      ? roles.filter((r) => grants.some((g) => g.userId === m.userId && g.roleId === r.id && g.status === "active"))
      : [];
    return held.length ? { ...m, role: held[0].name } : m;
  });
}

// Only the database links a row to an account, so a duplicated row never inherits someone's access.
function unlinked(input) {
  const out = { ...input };
  delete out.userId;
  if (out.metadata?.userId) {
    out.metadata = { ...out.metadata };
    delete out.metadata.userId;
  }
  return out;
}

async function update(id, patch) {
  if ("role" in patch || "status" in patch) {
    const current = await teamMembersLayer.get(id);
    if (current?.userId) {
      const next = { ...current, ...patch };
      const ok = await setMemberAccess({
        projectId: projectOf(current),
        userId: current.userId,
        roleName: next.role,
        active: next.status !== "Disabled",
        grantedBy: (await getUser())?.id ?? null,
      });
      if (!ok) return null;
    }
  }
  return teamMembersLayer.update(id, patch);
}

// Removing a linked member revokes their grants first; a revoked grant is never handed back on sign-in.
async function softDelete(id) {
  const current = await teamMembersLayer.get(id);
  if (current?.userId) {
    const grants = await listUserGrants(projectOf(current), current.userId);
    if (!grants || !(await revokeGrants(grants.map((g) => g.id)))) return false;
  }
  return teamMembersLayer.softDelete(id);
}

export const teamMembersData = {
  ...teamMembersLayer.data,
  list,
  create: (input) => teamMembersLayer.create(unlinked(input)),
  update,
  softDelete,
};
