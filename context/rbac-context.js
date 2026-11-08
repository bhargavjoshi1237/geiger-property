"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import rbacConfig, { navPermissionKey, sectionKeyOf } from "@/geiger-rbac.config";
import { makeAuthorizer } from "@/lib/rbac";
import { listRoles, listUserGrants, syncSystemRoles } from "@/lib/supabase/rbac";
import { teamMembersLayer } from "@/lib/supabase/team_members";
import { getUser } from "@/lib/supabase/user";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";
import { useProject } from "@/context/project-context";

// The signed-in user's permissions: @geiger/rbac evaluate() over their property.role_grants, failing closed (no grant,
// nothing allowed). ProjectProvider mints the grant first; legacy short keys resolve through toPermissionKey().

export const RBAC_CHANGED_EVENT = "geiger:rbac-changed";

// Tell the provider roles or grants changed (e.g. after saving Roles & Permissions).
export const notifyRbacChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RBAC_CHANGED_EVENT));
};

const RbacContext = createContext(null);

// Without a provider: the landing playground's in-memory sandbox is ungated; anywhere else nothing is allowed.
const noProvider = (allowed) =>
  Object.freeze({
    loading: false,
    userId: null,
    isOwner: false,
    role: null,
    roles: [],
    member: null,
    can: () => allowed,
    canView: () => allowed,
    decide: () => ({ allowed, code: "no_provider", reason: "Authorization isn't loaded on this surface.", via: null }),
    refresh: async () => {},
  });
const UNGATED = noProvider(true);
const DENIED = noProvider(false);

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

  // Once per project, a role manager (Owner, Admin) tops roles up to the catalog; the server seeds a role it grants.
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
  return useContext(RbacContext) ?? (isSandbox() ? UNGATED : DENIED);
}

// usePermission("property.record.delete") → boolean (legacy short keys work too; no provider: sandbox only).
export function usePermission(key) {
  return useRbac().can(key);
}
