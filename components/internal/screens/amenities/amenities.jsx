"use client";

import { useMemo, useState } from "react";
import { CalendarDays, LayoutList } from "lucide-react";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { amenitiesConfig } from "./config";
import { CommunityCalendar } from "./community_calendar";

const MODES = [
  { value: "library", label: "Library", icon: LayoutList },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
];

// Amenities — the amenity library (Entity engine) with a community-calendar view.
export function AmenitiesScreen() {
  const [mode, setMode] = useState("library");
  const { itemId } = useWorkspaceUrl();

  const modeSwitch = <SegmentedTabs tabs={MODES} value={mode} onChange={setMode} />;

  // Same config, with the view toggle in the list header.
  const config = useMemo(
    () => ({
      ...amenitiesConfig,
      headerActions: () => <SegmentedTabs tabs={MODES} value="library" onChange={setMode} />,
    }),
    [],
  );

  // An open amenity (e.g. from a calendar booking) always shows its editor.
  if (mode === "calendar" && !itemId) return <CommunityCalendar modeSwitch={modeSwitch} />;
  return <EntityListScreen config={config} />;
}

export default AmenitiesScreen;
