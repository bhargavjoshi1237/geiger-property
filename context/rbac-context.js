"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getRoleById, normalizeRoleId, roleAllows, tabPermissionKey } from "@/lib/rbac";
import { getSetting } from "@/lib/supabase/settings";
import { teamMembersLayer } from "@/lib/supabase/team_members";
import { getUser } from "@/lib/supabase/user";
import { useProject } from "@/context/project-context";
import { PERMISSION_RESOLVER, sectionOfTitle } from "@/components/internal/screens/settings/permissions";

// Workspace permissions for the signed-in user (advisory UI gating — it hides
// nav and disables controls, it doesn't secure data). Role resolution: project
// creator → full access; else the team member matching the user's email / id →
// their role from the `roles` setting; else the default (Manager) role. With no
// roles saved, everything is allowed. Mirrors geiger-events' RbacProvider API.

export const RBAC_CHANGED_EVENT = "geiger:rbac-changed";

// Tell the provider roles / members changed (e.g. after saving Roles & Permissions).
export const notifyRbacChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RBAC_CHANGED_EVENT));
};

const RbacContext = createContext(null);

const PERMISSIVE = Object.freeze({
  loading: false,
  configured: false,
  isOwner: false,
  role: null,
  member: null,
  can: () => true,
  canView: () => true,
  refresh: async () => {},
});

const norm = (s) => String(s || "").trim().toLowerCase();

function resolveRole({ roles, members, user, project }) {
  if (!roles.length) return { configured: false, role: null, member: null, isOwner: false };
  if (user?.id && project?.created_by === user.id) return { configured: true, role: null, member: null, isOwner: true };
  const member = members.find(
    (m) => (user?.email && norm(m.email) === norm(user.email)) || (user?.id && m.metadata?.userId === user.id),
  );
  if (member?.status === "Disabled") return { configured: true, role: { id: "disabled", permissions: [], known: [] }, member, isOwner: false };
  const wanted = normalizeRoleId(member?.role);
  const role = (wanted && roles.find((r) => r.id === wanted || normalizeRoleId(r.name) === wanted)) || getRoleById(roles, "manager");
  return { configured: true, role, member: member || null, isOwner: false };
}

export function RbacProvider({ children }) {
  const { project } = useProject();
  const projectId = project?.id || null;
  const [state, setState] = useState({ loadedFor: undefined, roles: [], members: [], user: null });

  const load = useCallback(async () => {
    const [user, roles, members] = await Promise.all([getUser(), getSetting("roles", []), teamMembersLayer.list()]);
    return { user, roles: Array.isArray(roles) ? roles.filter((r) => r?.id) : [], members: members || [] };
  }, []);

  const refresh = useCallback(async () => {
    const next = await load();
    setState({ loadedFor: projectId, ...next });
  }, [load, projectId]);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    load().then((next) => alive && setState({ loadedFor: projectId, ...next }));
    const onChange = () => load().then((next) => alive && setState({ loadedFor: projectId, ...next }));
    window.addEventListener(RBAC_CHANGED_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(RBAC_CHANGED_EVENT, onChange);
    };
  }, [projectId, load]);

  const loading = Boolean(projectId) && state.loadedFor !== projectId;

  const value = useMemo(() => {
    const r = resolveRole({ ...state, project });
    // Allowed while loading so controls don't flicker; the screen guard waits.
    const can = (key) => loading || !r.configured || r.isOwner || roleAllows(r.role, key, PERMISSION_RESOLVER);
    const canView = (title) => {
      const section = sectionOfTitle(title);
      return (!section || can(tabPermissionKey(section))) && can(tabPermissionKey(title));
    };
    return { loading, ...r, can, canView, refresh };
  }, [state, project, loading, refresh]);

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

export function useRbac() {
  return useContext(RbacContext) ?? PERMISSIVE;
}

// usePermission("records.delete") → boolean (true with no provider / no roles).
export function usePermission(key) {
  return useRbac().can(key);
}
