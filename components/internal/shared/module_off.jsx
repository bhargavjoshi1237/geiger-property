"use client";

import { Blocks } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { getModule } from "@/lib/modules";

// Shown in place of a page whose module is switched off in Settings → Modules (a deep link or bookmark).
export function ModuleOffState({ moduleKey, onOpenModules }) {
  const label = getModule(moduleKey)?.label || "This module";
  return (
    <EmptyState
      icon={Blocks}
      title={`${label} is off`}
      description="Turn it on in Settings → Modules."
      action={
        onOpenModules ? (
          <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={onOpenModules}>
            Open Modules
          </Button>
        ) : null
      }
    />
  );
}

export default ModuleOffState;
