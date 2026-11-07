"use client";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";

// Automation Settings — placeholder until its build item lands.
export function AutomationSettingsScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader title="Automation Settings" description="Guardrails, autonomy and intake rules." />
    </MainScreenWrapper>
  );
}

export default AutomationSettingsScreen;
