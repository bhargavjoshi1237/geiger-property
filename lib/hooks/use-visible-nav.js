"use client";

import React from "react";
import { applyNavVisibility } from "@geiger/ui";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { filterNavByAccess } from "@/lib/nav-access";
import { useRbac } from "@/context/rbac-context";
import { useModules } from "@/context/modules-context";

// The nav the signed-in user may see: modules switched off, then RBAC view access; shared by the sidebar and ⌘K.
export function useVisibleNav() {
  const { canView } = useRbac();
  const { hidden: moduleHidden } = useModules();

  return React.useMemo(
    () => filterNavByAccess(applyNavVisibility(workspaceNav, moduleHidden), (title) => canView(title)),
    [canView, moduleHidden],
  );
}
