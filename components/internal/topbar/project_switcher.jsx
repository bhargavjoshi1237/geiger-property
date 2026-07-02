"use client";

import React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";

// Active-project selector for the topbar. Lists the projects the signed-in
// user can reach (org membership, enforced by RLS) and switches the whole
// workspace to the one they pick. Projects themselves are created outside
// geiger-property (elsewhere in the suite) — users always arrive here via a
// direct /project/<uuid> link, so this never offers project creation.
export function ProjectSwitcher() {
  const { project, projects, loading, setActiveProject } = useProject();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 gap-1.5 px-2 text-sm font-medium text-foreground hover:bg-surface-hover"
        >
          <span className="truncate max-w-[140px] md:max-w-[200px]">
            {loading ? "Loading…" : project?.name || "Select project"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-60 border-border bg-surface-subtle shadow-xl"
      >
        <DropdownMenuLabel className="text-text-tertiary">
          Projects
        </DropdownMenuLabel>
        {projects.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No projects yet.
          </div>
        ) : (
          projects.map((p) => (
            <DropdownMenuItem
              key={p.id}
              className="cursor-pointer gap-2 text-muted-foreground focus:bg-surface-hover focus:text-foreground"
              onClick={() => setActiveProject(p.id)}
            >
              <Check
                className={`h-4 w-4 ${
                  p.id === project?.id ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className="truncate">{p.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ProjectSwitcher;
