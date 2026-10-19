"use client";

import React, { Suspense, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { WorkspaceShell } from "@/components/internal/shared/workspace_shell";
import { FULL_BLEED_TABS, findNavItem } from "@/components/internal/sidebar/sidebar_nav";
import { LoadingArea } from "@/components/internal/shared/project_states";
import { ProjectProvider, useProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { enableSandbox } from "@/lib/sandbox/sandbox_mode";
import { PlaygroundWorkspaceUrlProvider } from "./playground_workspace_url";
import { ScreenErrorBoundary } from "./screen_error_boundary";

// The registry statically imports every screen, so it loads on demand rather
// than with the landing page.
const PlaygroundScreenHost = dynamic(
  () => import("./playground_screen_host"),
  { ssr: false, loading: () => <LoadingArea /> },
);

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

// The live Property workspace on a sample portfolio: the same WorkspaceShell and screen registry as /project/<id>, but it navigates in memory
// (PlaygroundWorkspaceUrlProvider) and reads/writes the in-tab sandbox (lib/sandbox), so nothing touches the database.
function PlaygroundContent() {
  const { tab: currentTab, setTab } = useWorkspaceUrl();
  const activeItem = useMemo(() => findNavItem(currentTab), [currentTab]);

  // homeHref="#": the logo would otherwise navigate the embed away from the playground.
  return (
    <WorkspaceShell activeTab={currentTab} onTabChange={setTab} homeHref="#" fullBleed={FULL_BLEED_TABS.has(currentTab)}>
      <PlaygroundScreen activeItem={activeItem} />
    </WorkspaceShell>
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
