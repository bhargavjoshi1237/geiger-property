"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { getActiveProjectId } from "./project_scope";
import rbacConfig, { parentKeyOf, sectionKeyOf } from "@/geiger-rbac.config";
import { normalizeRoleId, planRoleSync } from "@/lib/rbac";

// Authorization data layer (ported from geiger-events): roles in the suite-shared public.roles, grants in
// property.role_grants. Pure: null / false / [] on failure. Role models keep shared `metadata` raw instead of spreading it.

const ROLES_TABLE = "roles";
const GRANTS_TABLE = "role_grants";

// public.roles sits outside this app's schema; the base client is pinned to `property`.
const publicClient = () => createClient().schema("public");

export function normalizeRole(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    key: row.key ?? metadata.key ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    color: row.color ?? "slate",
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    isSystem: row.is_system ?? false,
    sort: row.sort ?? 0,
    metadata,
    propertyKnown: Array.isArray(metadata.propertyKnown) ? metadata.propertyKnown : null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function normalizeGrant(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    roleId: row.role_id ?? null,
    scope: row.scope && typeof row.scope === "object" ? row.scope : {},
    status: row.status ?? "active",
    grantedBy: row.granted_by ?? null,
    createdAt: row.created_at ?? null,
    deletedAt: row.deleted_at ?? null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

function roleToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    key: "key",
    name: "name",
    description: "description",
    color: "color",
    isSystem: "is_system",
    sort: "sort",
    createdBy: "created_by",
    metadata: "metadata",
  };
  for (const [key, col] of Object.entries(map)) if (key in input) row[col] = input[key];
  if ("permissions" in input) row.permissions = Array.isArray(input.permissions) ? input.permissions : [];
  return row;
}

// The role a stored id refers to: pre-01a ids (assignee/approver roles) are role keys; names also resolve.
export const roleRef = (role) => role?.key || normalizeRoleId(role?.name) || role?.id || "";

// --- Roles -----------------------------------------------------------------

export async function listRoles(projectId = getActiveProjectId()) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await publicClient()
      .from(ROLES_TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[rbac.listRoles]", error.message);
      return null;
    }
    return (data || []).map(normalizeRole);
  } catch (e) {
    console.error("[rbac.listRoles]", e);
    return null;
  }
}

// Role pickers that store a role reference (review assignee, workflow approver): [{ id: roleRef, name }].
export async function listRoleChoices(projectId = getActiveProjectId()) {
  const roles = await listRoles(projectId);
  return roles ? roles.map((r) => ({ id: roleRef(r), name: r.name || roleRef(r) })) : null;
}

export async function createRole(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const payload = roleToRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await publicClient().from(ROLES_TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[rbac.createRole]", error.message);
      return null;
    }
    return normalizeRole(data);
  } catch (e) {
    console.error("[rbac.createRole]", e);
    return null;
  }
}

export async function updateRole(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await publicClient()
      .from(ROLES_TABLE)
      .update(roleToRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[rbac.updateRole]", error.message);
      return null;
    }
    return normalizeRole(data);
  } catch (e) {
    console.error("[rbac.updateRole]", e);
    return null;
  }
}

export async function softDeleteRole(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { data, error } = await publicClient()
      .from(ROLES_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error || !data?.length) {
      console.error("[rbac.softDeleteRole]", error?.message || "not allowed");
      return false;
    }
    return true;
  } catch (e) {
    console.error("[rbac.softDeleteRole]", e);
    return false;
  }
}

// Seed the system roles (merging into shared roles of the same key) and top up roles after catalog growth; idempotent.
// public.roles RLS needs a project role administrator. Returns true when any write landed.
export async function syncSystemRoles(projectId = getActiveProjectId(), roles = null, createdBy = null) {
  if (!projectId || !isSupabaseConfigured()) return false;
  const current = roles ?? (await listRoles(projectId));
  if (!current) return false;
  const { inserts, updates } = planRoleSync(current, rbacConfig, parentKeyOf, sectionKeyOf);
  let changed = false;
  try {
    const sb = publicClient();
    if (inserts.length) {
      const rows = inserts.map(({ propertyKnown, ...role }) =>
        roleToRow({ ...role, projectId, createdBy, metadata: { key: role.key, propertyKnown } }),
      );
      const { error } = await sb.from(ROLES_TABLE).insert(rows);
      if (error) console.error("[rbac.syncSystemRoles] insert", error.message);
      else changed = true;
    }
    for (const u of updates) {
      const role = current.find((r) => r.id === u.id);
      // RLS filters an update it refuses down to zero rows, so count what came back.
      const { data, error } = await sb
        .from(ROLES_TABLE)
        .update({ permissions: u.permissions, metadata: { ...(role?.metadata || {}), propertyKnown: u.propertyKnown } })
        .eq("id", u.id)
        .select("id");
      if (error) console.error("[rbac.syncSystemRoles] update", error.message);
      else if (data?.length) changed = true;
    }
  } catch (e) {
    console.error("[rbac.syncSystemRoles]", e);
  }
  return changed;
}

// --- Grants ----------------------------------------------------------------

async function selectGrants(projectId, userId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    let q = createClient().from(GRANTS_TABLE).select("*").eq("project_id", projectId).is("deleted_at", null);
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (error) {
      console.error("[rbac.listGrants]", error.message);
      return null;
    }
    return (data || []).map(normalizeGrant);
  } catch (e) {
    console.error("[rbac.listGrants]", e);
    return null;
  }
}

// Every live grant in the project (the Team screen's view).
export const listGrants = (projectId = getActiveProjectId()) => selectGrants(projectId, null);

// One user's live grants: what the provider decides against.
export const listUserGrants = (projectId, userId) => (userId ? selectGrants(projectId, userId) : Promise.resolve(null));

// Mint the signed-in user's grant if they never held one (property.rbac_ensure_membership). Returns their role id or null.
export async function ensureMembership(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await createClient().rpc("rbac_ensure_membership", { p_project: projectId });
    if (error) {
      console.error("[rbac.ensureMembership]", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[rbac.ensureMembership]", e);
    return null;
  }
}

// Assign (or revive) a role; look-then-write because PostgREST can't target the partial unique index with ON CONFLICT.
export async function grantRole({ projectId, userId, roleId, scope = {}, grantedBy = null }) {
  if (!projectId || !userId || !roleId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data: existing, error: readError } = await sb
      .from(GRANTS_TABLE)
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("role_id", roleId)
      .order("deleted_at", { ascending: false, nullsFirst: true })
      .limit(1)
      .maybeSingle();
    if (readError) {
      console.error("[rbac.grantRole]", readError.message);
      return null;
    }
    const payload = {
      project_id: projectId,
      user_id: userId,
      role_id: roleId,
      scope: scope || {},
      status: "active",
      granted_by: grantedBy,
      deleted_at: null,
    };
    const query = existing?.id
      ? sb.from(GRANTS_TABLE).update(payload).eq("id", existing.id)
      : sb.from(GRANTS_TABLE).insert(payload);
    const { data, error } = await query.select("*").single();
    if (error) {
      console.error("[rbac.grantRole]", error.message);
      return null;
    }
    return normalizeGrant(data);
  } catch (e) {
    console.error("[rbac.grantRole]", e);
    return null;
  }
}

async function patchGrants(ids, patch, tag) {
  if (!ids.length) return true;
  if (!isSupabaseConfigured()) return false;
  try {
    // RLS filters an update it refuses down to zero rows, so check every row came back.
    const { data, error } = await createClient().from(GRANTS_TABLE).update(patch).in("id", ids).select("id");
    if (error || (data?.length ?? 0) < ids.length) {
      console.error(`[rbac.${tag}]`, error?.message || "not allowed");
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[rbac.${tag}]`, e);
    return false;
  }
}

export const revokeGrants = (ids) => patchGrants(ids, { deleted_at: new Date().toISOString() }, "revokeGrants");

// Give a linked member exactly one active role (granted before others are revoked), or deactivate all when !active.
export async function setMemberAccess({ projectId, userId, roleName, active = true, grantedBy = null }) {
  if (!projectId || !userId) return false;
  const [roles, grants] = await Promise.all([listRoles(projectId), listUserGrants(projectId, userId)]);
  if (!roles || !grants) return false;
  if (!active) {
    return patchGrants(grants.filter((g) => g.status === "active").map((g) => g.id), { status: "inactive" }, "setMemberAccess");
  }
  const wanted = normalizeRoleId(roleName);
  const role = roles.find((r) => r.name === roleName) || roles.find((r) => r.key === wanted || normalizeRoleId(r.name) === wanted);
  if (!role) return false;
  const others = grants.filter((g) => g.roleId !== role.id);
  const current = grants.find((g) => g.roleId === role.id && g.status === "active");
  if (current && !others.length) return true;
  if (!current && !(await grantRole({ projectId, userId, roleId: role.id, grantedBy }))) return false;
  return revokeGrants(others.map((g) => g.id));
}
