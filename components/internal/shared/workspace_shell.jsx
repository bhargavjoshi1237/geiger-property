"use client";

import React from "react";
import { AppSidebar } from "@/components/internal/sidebar/sidebar";
import { ProjectTopbar } from "@/components/internal/topbar/projects/topbar";
import { SidebarProvider, SidebarInset } from "@geiger/ui/sidebar";

// The workspace chrome (topbar, sidebar, scrolling screen area), shared by the project route and the landing playground so the two can't drift.
// `fullBleed` hands the whole pane to screens that manage their own layout and scrolling (Communications).
export function WorkspaceShell({ activeTab, onTabChange, homeHref, className = "h-full", fullBleed = false, children }) {
  return (
    <div className={`flex flex-col w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong ${className}`}>
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <ProjectTopbar homeHref={homeHref} />
        <div className="flex flex-1 overflow-hidden relative">
          <AppSidebar activeTab={activeTab} onTabChange={onTabChange} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full"></div>
            <main className={`flex-1 relative z-10 w-full min-w-0 ${fullBleed ? "overflow-hidden" : "overflow-y-auto p-4 md:p-8"}`}>
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export default WorkspaceShell;
