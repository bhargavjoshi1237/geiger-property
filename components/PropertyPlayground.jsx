"use client";

import React, { Suspense, useState } from "react";
import { AppSidebar } from "@/components/internal/sidebar/sidebar";
import { Topbar } from "@/components/internal/topbar/topbar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ComingSoonScreen } from "@/components/internal/screens/coming_soon";
import { PropertyOverviewScreen } from "@/components/internal/screens/overview/property_overview";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { ProjectProvider } from "@/context/project-context";

// Live, embeddable copy of the Property dashboard used on the landing page.
// Mirrors app/project/[projectId]/[[...rest]]/page.js but fills its container
// (h-full) instead of the viewport, and keeps the active tab in local state
// instead of the URL, so it can be mounted inside the playground showcase. No
// save, no load — it's a throwaway, fully interactive instance of the real
// interface. Wrapped in its own ProjectProvider (+ Suspense, required by the
// URL-reading hooks underneath) since it mounts outside the real /project
// route tree but the Topbar's ProjectSwitcher still expects that context.
function PlaygroundContent() {
  const [currentTab, setCurrentTab] = useState("Overview");

  const findActiveItem = () => {
    for (const item of workspaceNav) {
      if (item.title === currentTab) return item;
      const sub = item.subItems?.find((s) => s.title === currentTab);
      if (sub) return sub;
    }
    return workspaceNav[0] || { title: "Overview" };
  };

  const activeItem = findActiveItem();

  return (
    <div className="flex-col h-full w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong flex">
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <Topbar />
        <div className="flex flex-1 overflow-hidden relative">
          <AppSidebar activeTab={currentTab} onTabChange={setCurrentTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full"></div>
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full min-w-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {currentTab === "Overview" ? (
                <PropertyOverviewScreen />
              ) : (
                <ComingSoonScreen title={activeItem.title} icon={activeItem.icon} />
              )}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export function PropertyPlayground() {
  return (
    <Suspense fallback={<div className="h-full w-full bg-background" />}>
      <ProjectProvider>
        <PlaygroundContent />
      </ProjectProvider>
    </Suspense>
  );
}

export default PropertyPlayground;
