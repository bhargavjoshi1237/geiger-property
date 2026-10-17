"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/internal/shared/workspace_shell";
import { ComingSoonScreen } from "@/components/internal/screens/coming_soon";
import { getScreen } from "@/components/internal/screens/registry";
import { findNavItem } from "@/components/internal/sidebar/sidebar_nav";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  ProjectProvider,
  useProject,
  pickDefaultProjectId,
} from "@/context/project-context";
import {
  LoadingArea,
  NoProjectState,
} from "@/components/internal/shared/project_states";
import { NoAccessState } from "@/components/internal/shared/no_access";
import { RbacProvider, useRbac } from "@/context/rbac-context";

// The active screen for the current tab, gated on the path's project resolving
// to one the user can reach. Keyed by project id so switching projects remounts
// the screen and it re-fetches its (now project-scoped) data from a clean slate.
function ScreenArea({ activeItem, Screen, onHome }) {
  const router = useRouter();
  const { project, projects, loading } = useProject();
  const rbac = useRbac();

  // A stale/invalid project id in the path → send the user to a valid project.
  useEffect(() => {
    if (loading || project || projects.length === 0) return;
    const fallback = pickDefaultProjectId(projects);
    if (fallback) router.replace(`/project/${fallback}`);
  }, [loading, project, projects, router]);

  if (loading) return <LoadingArea />;
  if (projects.length === 0) return <NoProjectState />;
  if (!project || rbac.loading) return <LoadingArea />;
  // A deep link to a tab the user's role doesn't grant.
  if (!rbac.canView(activeItem.title)) {
    return <NoAccessState title={activeItem.title} onHome={activeItem.title === "Overview" ? null : onHome} />;
  }

  return (
    <div key={project.id} className="h-full">
      {Screen ? (
        <Screen />
      ) : (
        <ComingSoonScreen title={activeItem.title} icon={activeItem.icon} />
      )}
    </div>
  );
}

function WorkspaceContent() {
  // The active tab lives in the URL (path) so a refresh keeps the user in place.
  const { tab: currentTab, setTab: setCurrentTab } = useWorkspaceUrl();

  const activeItem = findNavItem(currentTab);
  const Screen = getScreen(currentTab);

  return (
    <WorkspaceShell activeTab={currentTab} onTabChange={setCurrentTab} className="h-[100dvh]">
      <ScreenArea activeItem={activeItem} Screen={Screen} onHome={() => setCurrentTab("Overview")} />
    </WorkspaceShell>
  );
}

export default function ProjectWorkspacePage() {
  // useSearchParams / useParams (via useWorkspaceUrl, used by ProjectProvider)
  // need a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] w-full items-center justify-center bg-background" />
      }
    >
      <ProjectProvider>
        <RbacProvider>
          <WorkspaceContent />
        </RbacProvider>
      </ProjectProvider>
    </Suspense>
  );
}
