"use client";

import React from "react";
import { PanelLeft } from "lucide-react";

import { Button } from "@geiger/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@geiger/ui/sidebar";
import { PORTAL_NAV } from "./portal_nav";
import { BrandMark } from "./portal_topbar";

// Role-aware portal navigation (collapses to icons; a sheet on mobile).
export function PortalSidebar({ member, tab, onTab }) {
  const { toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const groups = PORTAL_NAV[member.role] || [];

  const go = (key) => {
    onTab(key);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3 md:hidden">
        <BrandMark member={member} />
      </SidebarHeader>

      <SidebarContent className="gap-0 py-1">
        {groups.map((group, i) => (
          <SidebarGroup key={group.label || i} className="mt-2 py-1">
            {group.label ? (
              <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-text-tertiary">{group.label}</SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton isActive={tab === item.key} tooltip={item.label} onClick={() => go(item.key)}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="justify-start text-muted-foreground hover:bg-sidebar-accent hover:text-foreground group-data-[collapsible=icon]:justify-center"
        >
          <PanelLeft className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Collapse</span>
        </Button>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export default PortalSidebar;
