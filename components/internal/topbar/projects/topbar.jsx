"use client";

import React from "react";
import { Topbar } from "@geiger/ui";
import { NotificationsBell } from "../dialogue/notifications_bell";
import { ProfileDropdown } from "../dialogue/profile_dropdown";
import { SupabaseActivityLine } from "../supabase_activity_line";
import { useVisibleNav } from "@/lib/hooks/use-visible-nav";
import { useRecordSearch } from "@/lib/hooks/use-record-search";

const SEARCH_RECENTS_KEY = "geiger:property:search-recents";

// Thin wrapper over the shared @geiger/ui Topbar; app-wired pieces (notifications, profile, activity) go in as slots.
// ⌘K searches the viewer's nav pages plus project records (PLAT-05); a record hit opens its editor.
export function ProjectTopbar({ homeHref, onTabChange } = {}) {
  const visibleNav = useVisibleNav();
  const records = useRecordSearch(visibleNav, { recentsKey: SEARCH_RECENTS_KEY });
  return (
    <Topbar
      // Product name, as Events and Forms pass; a project name here showed suite-shared projects like "Geiger Notes".
      label="Property"
      homeHref={homeHref}
      searchPlaceholder="Search project..."
      searchNav={visibleNav}
      searchItems={records.items}
      searchRecentsKey={SEARCH_RECENTS_KEY}
      onSearchClick={records.reset}
      onSearchSelect={(item) => onTabChange?.(item.title)}
      notifications={<NotificationsBell />}
      profile={<ProfileDropdown />}
      activity={<SupabaseActivityLine />}
    />
  );
}
