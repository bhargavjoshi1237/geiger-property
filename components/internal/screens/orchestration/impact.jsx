"use client";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";

// Impact — placeholder until its build item lands.
export function ImpactScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader title="Impact" description="What your automations saved and delivered." />
    </MainScreenWrapper>
  );
}

export default ImpactScreen;
