"use client";

import { ShieldOff } from "lucide-react";

import { Button } from "@geiger/ui/button";

// Shown in place of a screen the signed-in user's role doesn't grant (a deep
// link to a hidden tab). Advisory gating — mirrors NoProjectState's frame.
export function NoAccessState({ title, onHome }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-subtle">
          <ShieldOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">No access{title ? ` to ${title}` : ""}</p>
          <p className="max-w-sm text-sm text-text-secondary">
            Your role doesn&apos;t include this page. Ask a workspace owner to update it in Settings → Roles &amp; Permissions.
          </p>
        </div>
        {onHome ? (
          <Button variant="outline" size="sm" className="mt-1 border-border bg-surface-card" onClick={onHome}>
            Go to Overview
          </Button>
        ) : null}
      </div>
    </div>
  );
}
