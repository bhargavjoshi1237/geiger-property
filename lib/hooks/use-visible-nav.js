"use client";

import React from "react";
import { applyNavVisibility } from "@geiger/ui";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";
import { roleHasPermission, tabPermissionKey } from "@/lib/rbac";
import { filterNavByAccess } from "@/lib/nav-access";
import { useRbac } from "@/context/rbac-context";
import { useModules } from "@/context/modules-context";

// The nav the signed-in user may see: modules switched off, then RBAC view access, then any explicit role narrowing; shared by the sidebar and ⌘K.
export function useVisibleNav({ roles = [], roleId = "workspace_owner" } = {}) {
  const { canView } = useRbac();
  const { hidden: moduleHidden } = useModules();

  return React.useMemo(
    () =>
      filterNavByAccess(applyNavVisibility(workspaceNav, moduleHidden), (title, top) =>
        canView(title) && (!top || roleHasPermission(roles, roleId, tabPermissionKey(title))),
      ),
    [canView, moduleHidden, roles, roleId],
  );
}
