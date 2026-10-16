"use client";

import React, { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AppSidebar } from "@/components/internal/sidebar/sidebar";
import { Topbar } from "@/components/internal/topbar/topbar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { LoadingArea } from "@/components/internal/shared/project_states";
import { ProjectProvider, useProject } from "@/context/project-context";
import { useWorkspaceUrl, DEFAULT_TAB } from "@/lib/hooks/use-workspace-url";
import { enableSandbox } from "@/lib/sandbox/sandbox_mode";
import { PlaygroundWorkspaceUrlProvider } from "@/components/landing/playground_workspace_url";
import { ScreenErrorBoundary } from "@/components/landing/screen_error_boundary";

// The registry statically imports every screen, so it loads on demand rather
// than with the landing page.
const PlaygroundScreenHost = dynamic(
  () => import("@/components/landing/playground_screen_host"),
  { ssr: false, loading: () => <LoadingArea /> },
);

// Resolve a tab title to its nav entry (top-level or sub-item), like the shell.
function findNavItem(title) {
  for (const item of workspaceNav) {
    if (item.title === title) return item;
    const sub = item.subItems?.find((s) => s.title === title);
    if (sub) return sub;
  }
  return workspaceNav[0] || { title: DEFAULT_TAB };
}

// Turn the in-memory sandbox on before any screen fetches. It's pinned to this
// page's path, so leaving for the real workspace switches it off by itself.
function useSandbox() {
  useState(enableSandbox);
}

// Waits for the sample project to resolve (so the data layer is scoped to it),
// then renders the active tab's real screen — mirrors ScreenArea in the shell.
function PlaygroundScreen({ activeItem }) {
  const { project } = useProject();
  if (!project) return <LoadingArea />;
  return (
    <ScreenErrorBoundary key={activeItem.title} title={activeItem.title}>
      <PlaygroundScreenHost activeItem={activeItem} />
    </ScreenErrorBoundary>
  );
}

// Live, embeddable copy of the Property dashboard used on the landing page. Same
// sidebar, topbar and screen registry as /project/<id>, but it fills its
// container, navigates in memory (PlaygroundWorkspaceUrlProvider) and reads and
// writes a sample portfolio held in the tab (lib/sandbox) — nothing touches the
// database.
function PlaygroundContent() {
  const { tab: currentTab, setTab } = useWorkspaceUrl();
  const activeItem = useMemo(() => findNavItem(currentTab), [currentTab]);

  return (
    <div className="flex-col h-full w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong flex">
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <Topbar />
        <div className="flex flex-1 overflow-hidden relative">
          <AppSidebar activeTab={currentTab} onTabChange={setTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full"></div>
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full min-w-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <PlaygroundScreen activeItem={activeItem} />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export function PropertyPlayground() {
  useSandbox();
  return (
    <Suspense fallback={<div className="h-full w-full bg-background" />}>
      <PlaygroundWorkspaceUrlProvider>
        <ProjectProvider>
          <PlaygroundContent />
        </ProjectProvider>
      </PlaygroundWorkspaceUrlProvider>
    </Suspense>
  );
}

export default PropertyPlayground;
