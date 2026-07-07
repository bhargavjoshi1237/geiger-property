"use client";

import { SectionPlaceholder } from "@/components/internal/screens/entity/section_placeholder";

// Leasing · Overview section — scaffold. Renders the shared placeholder for
// now; real fields and controls land when we design this area's features.
export function OverviewSection({ headerItem }) {
  return (
    <SectionPlaceholder title={headerItem.label} description={headerItem.desc} />
  );
}

export default OverviewSection;
