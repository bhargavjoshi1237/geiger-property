"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";

// Active-project context for the Property workspace. The whole dashboard is
// scoped to one project at a time: every data-layer call is filtered by the
// active project's id and RLS enforces org membership on top (see
// supabase/sqls/zz_project_access.sql).
//
// The active project lives in the URL (?project=<uuid>, via useWorkspaceUrl) so
// a refresh or shared link stays on it; localStorage only remembers the last
// choice to pre-select it on a fresh visit. Projects themselves are the shared
// suite entity public.projects — read through a public-schema client (the base
// client is pinned to the `property` schema), narrowed to the caller's orgs by
// that table's own RLS.

const ProjectContext = createContext(undefined);

const LAST_PROJECT_KEY = "geiger-property:last-project";

// The project to open when none is in the URL: the last-used one (if still
// valid), else the first. Returns null for an empty list.
export function pickDefaultProjectId(projects) {
  if (!projects || projects.length === 0) return null;
  try {
    const remembered = window.localStorage.getItem(LAST_PROJECT_KEY);
    if (remembered && projects.some((p) => p.id === remembered)) {
      return remembered;
    }
  } catch {
    // ignore storage failures
  }
  return projects[0].id;
}

// A public-schema view of the base client. public.projects / the org bootstrap
// RPC live outside this app's `property` schema.
function publicClient() {
  return createClient().schema("public");
}

export function ProjectProvider({ children }) {
  const { projectId, setProject } = useWorkspaceUrl();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pure fetch of the caller's projects (RLS returns only orgs they belong to).
  // Returns rows; never sets state — the caller decides what to do with them.
  const fetchProjects = useCallback(async () => {
    if (!isSupabaseConfigured()) return [];
    try {
      const sb = publicClient();
      const { data, error } = await sb
        .from("projects")
        .select("id, name, slug, organization_id, created_by")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[project-context] load", error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error("[project-context] load", e);
      return [];
    }
  }, []);

  // Re-load and publish into state (exposed so callers can refresh after a
  // mutation elsewhere).
  const refresh = useCallback(async () => {
    const rows = await fetchProjects();
    setProjects(rows);
    setLoading(false);
    return rows;
  }, [fetchProjects]);

  // Load once on mount (setState happens in the async continuation, not
  // synchronously in the effect body).
  useEffect(() => {
    let alive = true;
    fetchProjects().then((rows) => {
      if (!alive) return;
      setProjects(rows);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchProjects]);

  // Remember the last valid active project so /project (and a fresh visit) can
  // reopen it. The active project id itself comes from the path
  // (/project/<id>/…); route components handle redirecting a missing/stale id.
  useEffect(() => {
    if (loading || !projectId) return;
    if (!projects.some((p) => p.id === projectId)) return;
    try {
      window.localStorage.setItem(LAST_PROJECT_KEY, projectId);
    } catch {
      // ignore storage failures (private mode etc.)
    }
  }, [loading, projects, projectId]);

  const project = useMemo(
    () => projects.find((p) => p.id === projectId) || null,
    [projects, projectId],
  );

  const value = useMemo(
    () => ({
      project,
      projectId: project?.id || null,
      projects,
      loading,
      setActiveProject: setProject,
      refresh,
    }),
    [project, projects, loading, setProject, refresh],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (ctx === undefined) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return ctx;
}
