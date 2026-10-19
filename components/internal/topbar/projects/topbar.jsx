"use client";

import React from "react";
import { Bell } from "lucide-react";
import { Button, Topbar } from "@geiger/ui";
import { NotificationsDropdown } from "../dialogue/notifications_dropdown";
import { ProfileDropdown } from "../dialogue/profile_dropdown";
import { SupabaseActivityLine } from "../supabase_activity_line";

// Thin wrapper over the shared @geiger/ui Topbar. The presentational chrome
// (logo, search, help) lives in the shared component; the app-wired pieces
// (notifications, profile, activity) are passed in as slots so the topbar
// stays consistent across the suite.
export function ProjectTopbar({ homeHref } = {}) {
  return (
    <Topbar
      // Product name, as Events and Forms pass; a project name here showed suite-shared projects like "Geiger Notes".
      label="Property"
      homeHref={homeHref}
      searchPlaceholder="Search project..."
      notifications={
        <NotificationsDropdown>
          <Button
            variant="ghost"
            size="icon-sm"
            className="w-8 h-8 rounded-full border border-transparent hover:bg-surface-hover hidden items-center justify-center transition-colors text-muted-foreground hover:text-foreground relative sm:flex"
          >
            <Bell className="w-[18px] h-[18px]" strokeWidth={2} />
          </Button>
        </NotificationsDropdown>
      }
      profile={<ProfileDropdown />}
      activity={<SupabaseActivityLine />}
    />
  );
}
