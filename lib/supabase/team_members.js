import { makeEntityData } from "./entity_factory";
import { getActiveProjectId } from "./project_scope";
import { listGrants, listRoles, revokeGrants, setMemberAccess } from "./rbac";
import { getUser } from "./user";
import { accessChangeBlock } from "@/lib/rbac";

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

// The project's roles and grants plus the signed-in user, for the lockout guard (null when unreadable).
async function accessState(projectId) {
  const [roles, grants, user] = await Promise.all([listRoles(projectId), listGrants(projectId), getUser()]);
  return roles && grants ? { roles, grants, actorId: user?.id ?? null } : null;
}

const UNREADABLE = "Couldn't check who holds which role. Try again.";
const logBlocked = (reason) => console.error("[teamMembers]", reason);

// The Team data layer; `onBlocked(reason)` hears why a change that would lock people out was refused.
export function makeTeamMembersData({ onBlocked = logBlocked } = {}) {
  async function update(id, patch) {
    if ("role" in patch || "status" in patch) {
      const current = await teamMembersLayer.get(id);
      if (current?.userId) {
        const projectId = projectOf(current);
        const state = await accessState(projectId);
        const next = { role: "role" in patch ? patch.role : undefined, status: patch.status ?? current.status };
        const blocked = state ? accessChangeBlock({ userId: current.userId, next, ...state }) : UNREADABLE;
        if (blocked) {
          onBlocked(blocked);
          return null;
        }
        // Without a role in the patch keep the role their grant names (the roster text can lag behind it).
        const held = state.roles.find((r) => state.grants.some((g) => g.userId === current.userId && g.roleId === r.id));
        const ok = await setMemberAccess({
          projectId,
          userId: current.userId,
          roleName: next.role ?? held?.name ?? current.role,
          active: next.status !== "Disabled",
          grantedBy: state.actorId,
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
      const state = await accessState(projectOf(current));
      const blocked = state ? accessChangeBlock({ userId: current.userId, next: null, ...state }) : UNREADABLE;
      if (blocked) {
        onBlocked(blocked);
        return false;
      }
      const grants = state.grants.filter((g) => g.userId === current.userId);
      if (!(await revokeGrants(grants.map((g) => g.id)))) return false;
    }
    return teamMembersLayer.softDelete(id);
  }

  return {
    ...teamMembersLayer.data,
    list,
    create: (input) => teamMembersLayer.create(unlinked(input)),
    update,
    softDelete,
  };
}

export const teamMembersData = makeTeamMembersData();
