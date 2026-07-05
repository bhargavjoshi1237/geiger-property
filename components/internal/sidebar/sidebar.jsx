"use client";

import React from "react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ChevronDown, Search, MoreVertical, PanelLeft, Bell, HelpCircle, X } from "lucide-react";
import { SidebarOption } from "./sidebar_option";
import { workspaceNav } from "./sidebar_nav";
import { NotificationsDropdown } from "../topbar/dialogue/notifications_dropdown";
import { roleHasPermission, tabPermissionKey } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

function MobileSidebarHeader() {
  const { isMobile, toggleSidebar } = useSidebar();

  if (!isMobile) {
    return null;
  }

  return (
    <SidebarHeader className="p-0 border-b border-sidebar-border">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded flex items-center justify-center shrink-0">
            <img
              src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/logo1.svg`}
              alt=""
              className="w-5 h-5"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.parentElement.innerHTML =
                  '<div class="w-2 h-2 bg-foreground rounded-full"></div>';
              }}
            />
          </div>
          <span className="text-foreground font-semibold text-sm">Property</span>
        </div>
      </div>
    </SidebarHeader>
  );
}

export function AppSidebar({
  activeTab = "Overview (P0)",
  onTabChange = () => {},
  roleId = "workspace_owner",
  roles = [],
}) {
  const { toggleSidebar } = useSidebar();
  const [expandedItems, setExpandedItems] = React.useState({});

  const visibleNav = workspaceNav.filter((item) =>
    roleHasPermission(roles, roleId, tabPermissionKey(item.title)),
  );

  const toggleExpand = (title) => {
    setExpandedItems((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <Sidebar
      collapsible="icon"
      className="bg-sidebar border-r border-sidebar-border text-sidebar-foreground"
    >
      <MobileSidebarHeader />
      <SidebarContent className="py-1 space-y-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map((item) => (
                <SidebarOption
                  key={item.title}
                  title={item.title}
                  icon={item.icon}
                  isActive={activeTab === item.title}
                  badge={item.badge}
                  subItems={item.subItems || null}
                  isExpanded={
                    expandedItems[item.title] !== undefined
                      ? expandedItems[item.title]
                      : !!item.subItems?.some((sub) => sub.title === activeTab)
                  }
                  onToggle={() => toggleExpand(item.title)}
                  activeSubTab={activeTab}
                  onClick={(subTitle) =>
                    onTabChange(
                      typeof subTitle === "string" ? subTitle : item.title,
                    )
                  }
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t border-sidebar-border mt-auto">
        <Button
          type="button"
          variant="ghost"
          onClick={toggleSidebar}
          className="flex items-center gap-3 p-2 w-full rounded-lg hover:bg-sidebar-accent transition-all text-sidebar-foreground hover:text-foreground group-data-[collapsible=icon]:justify-center"
        >
          <PanelLeft className="w-5 h-5 shrink-0" />
        </Button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
