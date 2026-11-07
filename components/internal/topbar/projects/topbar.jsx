"use client";

import React from "react";
import { Topbar } from "@geiger/ui";
import { NotificationsBell } from "../dialogue/notifications_bell";
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
      notifications={<NotificationsBell />}
      profile={<ProfileDropdown />}
      activity={<SupabaseActivityLine />}
    />
  );
}
