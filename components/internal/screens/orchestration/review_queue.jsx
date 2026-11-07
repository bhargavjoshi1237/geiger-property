"use client";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";

// Review Queue — placeholder until its build item lands.
export function ReviewQueueScreen() {
  return (
    <MainScreenWrapper>
      <ScreenHeader title="Review Queue" description="Everything that needs a person." />
    </MainScreenWrapper>
  );
}

export default ReviewQueueScreen;
