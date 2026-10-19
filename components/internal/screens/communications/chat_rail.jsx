"use client";

import React from "react";
import { PanelLeft } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@geiger/ui";
import { cn } from "@/lib/utils";
import { CHAT_NAV } from "./nav";

// Secondary navigation for the Communications screen. Not built on the Sidebar
// primitive — the workspace already renders inside a SidebarProvider and a nested
// one would fight over collapse state — but styled on the same sidebar tokens so
// the two read as one navigation system.
export function ChatRail({ activeTab, onTabChange, collapsed, onToggleCollapsed, badges = {} }) {
  return (
    <nav
      aria-label="Communications"
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear",
        collapsed ? "w-12" : "w-52",
      )}
    >
      <ul className="flex min-w-0 flex-1 flex-col gap-1 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CHAT_NAV.map(({ title, icon: Icon }) => {
          const active = activeTab === title;
          const badge = badges[title] > 0 ? badges[title] : null;
          const button = (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onTabChange(title)}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? title : undefined}
              className={cn(
                "relative flex h-9 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm transition-all",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center",
                active ? "bg-sidebar-accent font-medium text-foreground" : "text-sidebar-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-foreground" : "text-sidebar-foreground/70")} />
              {!collapsed ? <span className="min-w-0 flex-1 truncate">{title}</span> : null}
              {!collapsed && badge ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
              {collapsed && badge ? <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" /> : null}
            </Button>
          );
          return (
            <li key={title}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right">{title}</TooltipContent>
                </Tooltip>
              ) : (
                button
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-sidebar-border p-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand communications navigation" : "Collapse communications navigation"}
          className={cn(
            "flex w-full items-center gap-3 rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center",
          )}
        >
          <PanelLeft className="h-4 w-4 shrink-0" />
        </Button>
      </div>
    </nav>
  );
}
