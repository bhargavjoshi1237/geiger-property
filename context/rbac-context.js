"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import rbacConfig, { navPermissionKey, sectionKeyOf } from "@/geiger-rbac.config";
import { makeAuthorizer } from "@/lib/rbac";
import { listRoles, listUserGrants, syncSystemRoles } from "@/lib/supabase/rbac";
import { teamMembersLayer } from "@/lib/supabase/team_members";
import { getUser } from "@/lib/supabase/user";
import { useProject } from "@/context/project-context";

// The signed-in user's permissions: @geiger/rbac evaluate() over their property.role_grants, failing closed (no grant,
// nothing allowed). ProjectProvider mints the grant first; legacy short keys resolve through toPermissionKey().

export const RBAC_CHANGED_EVENT = "geiger:rbac-changed";

// Tell the provider roles or grants changed (e.g. after saving Roles & Permissions).
export const notifyRbacChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RBAC_CHANGED_EVENT));
};

const RbacContext = createContext(null);

// Surfaces rendered without a provider (the landing playground's in-memory sandbox) aren't gated.
const UNGATED = Object.freeze({
  loading: false,
  userId: null,
  isOwner: false,
  role: null,
  roles: [],
  member: null,
  can: () => true,
  canView: () => true,
  decide: () => ({ allowed: true, code: "no_provider", reason: "Authorization isn't loaded on this surface.", via: null }),
  refresh: async () => {},
});

const EMPTY = { user: null, roles: [], grants: [], members: [] };
const norm = (s) => String(s || "").trim().toLowerCase();

async function loadAccess(projectId) {
  const user = await getUser();
  if (!user?.id) return EMPTY;
  const [roles, grants, members] = await Promise.all([
    listRoles(projectId),
    listUserGrants(projectId, user.id),
    teamMembersLayer.list(),
  ]);
  return { user, roles: roles || [], grants: grants || [], members: members || [] };
}

// The signed-in user's roster row (linked by account, else matched by email).
const findMember = (members, user) =>
  members.find((m) => user?.id && m.userId === user.id) ||
  members.find((m) => user?.email && norm(m.email) === norm(user.email)) ||
  null;

export function RbacProvider({ children }) {
  const { projectId, membershipReady } = useProject();
  const [state, setState] = useState({ loadedFor: undefined, ...EMPTY });
  const syncedFor = useRef(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const next = await loadAccess(projectId);
    setState({ loadedFor: projectId, ...next });
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !membershipReady) return undefined;
    let alive = true;
    const load = () => loadAccess(projectId).then((next) => alive && setState({ loadedFor: projectId, ...next }));
    load();
    window.addEventListener(RBAC_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(RBAC_CHANGED_EVENT, load);
    };
  }, [projectId, membershipReady]);

  const loading = Boolean(projectId) && state.loadedFor !== projectId;

  const authz = useMemo(
    () => makeAuthorizer({ config: rbacConfig, roles: state.roles, grants: state.grants, actorId: state.user?.id }),
    [state],
  );

  // Once per project, a role manager brings its roles up to the catalog (seeds the system roles, tops up new keys).
  const canManageRoles = !loading && authz.can("property.role.manage");
  useEffect(() => {
    if (!canManageRoles || syncedFor.current === projectId) return;
    syncedFor.current = projectId;
    syncSystemRoles(projectId, state.roles, state.user?.id).then((changed) => changed && notifyRbacChanged());
  }, [canManageRoles, projectId, state.roles, state.user]);

  const value = useMemo(() => {
    // Allowed while loading so controls don't flicker; the workspace's screen guard waits for `loading`.
    const can = (key, extra) => loading || authz.can(key, extra);
    const canView = (title) => {
      const key = navPermissionKey(title);
      const section = sectionKeyOf(key);
      return can(key) && (!section || can(section));
    };
    return {
      loading,
      userId: state.user?.id ?? null,
      isOwner: authz.isOwner,
      role: authz.roles[0] || null,
      roles: authz.roles,
      member: findMember(state.members, state.user),
      can,
      canView,
      decide: authz.decide,
      refresh,
    };
  }, [authz, loading, state, refresh]);

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

export function useRbac() {
  return useContext(RbacContext) ?? UNGATED;
}

// usePermission("property.record.delete") → boolean (legacy short keys work too; true with no provider).
export function usePermission(key) {
  return useRbac().can(key);
}
