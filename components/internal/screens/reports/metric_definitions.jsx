"use client";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";

// Metric Definitions — placeholder until its build item lands.
export function MetricDefinitionsScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader title="Metric Definitions" description="How every number is calculated." />
    </MainScreenWrapper>
  );
}

export default MetricDefinitionsScreen;
