"use client";

import React, { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/internal/sidebar/sidebar";
import { ProjectTopbar } from "@/components/internal/topbar/projects/topbar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ComingSoonScreen } from "@/components/internal/screens/coming_soon";
import { getScreen } from "@/components/internal/screens/registry";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
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

// The active screen for the current tab, gated on the path's project resolving
// to one the user can reach. Keyed by project id so switching projects remounts
// the screen and it re-fetches its (now project-scoped) data from a clean slate.
function ScreenArea({ activeItem, Screen }) {
  const router = useRouter();
  const { project, projects, loading } = useProject();

  // A stale/invalid project id in the path → send the user to a valid project.
  useEffect(() => {
    if (loading || project || projects.length === 0) return;
    const fallback = pickDefaultProjectId(projects);
    if (fallback) router.replace(`/project/${fallback}`);
  }, [loading, project, projects, router]);

  if (loading) return <LoadingArea />;
  if (projects.length === 0) return <NoProjectState />;
  if (!project) return <LoadingArea />;

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

  const findActiveItem = () => {
    for (const item of workspaceNav) {
      if (item.title === currentTab) return item;
      const sub = item.subItems?.find((s) => s.title === currentTab);
      if (sub) return sub;
    }
    return workspaceNav[0] || { title: "Overview" };
  };

  const activeItem = findActiveItem();
  const Screen = getScreen(currentTab);

  return (
    <div className="flex-col h-[100dvh] w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong flex">
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <ProjectTopbar />
        <div className="flex flex-1 overflow-hidden relative">
          <AppSidebar activeTab={currentTab} onTabChange={setCurrentTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full"></div>
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full min-w-0">
              <ScreenArea activeItem={activeItem} Screen={Screen} />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
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
        <WorkspaceContent />
      </ProjectProvider>
    </Suspense>
  );
}
