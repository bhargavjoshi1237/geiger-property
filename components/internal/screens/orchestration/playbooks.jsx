"use client";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";

// Playbooks — placeholder until its build item lands.
export function PlaybooksScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader title="Playbooks" description="Ready-made automations for the real jobs." />
    </MainScreenWrapper>
  );
}

export default PlaybooksScreen;
