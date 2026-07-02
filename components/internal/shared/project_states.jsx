"use client";

import React from "react";
import { Loader2, FolderX } from "lucide-react";

// Shared gate states for the project-scoped shell. Used by the /project
// resolver and the /project/[projectId] shell.

export function LoadingArea() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-text-secondary">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}

// Shown when the signed-in user has no project to open. Projects are created
// elsewhere in the suite — geiger-property is always reached via a direct
// /project/<uuid> link — so this is a dead-end state, not an onboarding step.
export function NoProjectState() {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-subtle">
          <FolderX className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            No project to open
          </p>
          <p className="max-w-sm text-sm text-text-secondary">
            Check the link, or open Geiger Property from your project&apos;s
            dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
