"use client";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";

// Briefing — placeholder until its build item lands.
export function BriefingScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader title="Briefing" description="Today's signals for your role." />
    </MainScreenWrapper>
  );
}

export default BriefingScreen;
