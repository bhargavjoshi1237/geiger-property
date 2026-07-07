"use client";

import React from "react";
import { Sparkles } from "lucide-react";

import { EmptyState } from "@/components/internal/shared/screen_kit";

// Shared body for a not-yet-built editor section. Every area's starter sections
// render this until real per-entity features are designed and built. Keeping the
// placeholder in one place means all four areas stay visually consistent, and
// swapping in real content later touches only that area's section file.
export function SectionPlaceholder({ title, description, icon: Icon = Sparkles }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-subtle">
      <EmptyState
        icon={Icon}
        title={title ? `${title} — designed next` : "Designed next"}
        description={
          description ||
          "This section is scaffolded. Its fields and controls land when we design this area's features."
        }
      />
    </div>
  );
}

export default SectionPlaceholder;
