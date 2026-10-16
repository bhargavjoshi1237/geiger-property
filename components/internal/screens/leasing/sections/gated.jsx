"use client";

import { Info } from "lucide-react";

import { EmptyState } from "@/components/internal/shared/screen_kit";

// Small section helpers shared by the Leasing screens (record-dependent tabs).

// Render `section` only when `when(item)` holds; otherwise an explanatory empty state.
export function makeGatedSection({ when, section: Section, icon = Info, title, description }) {
  function GatedSection(props) {
    if (when(props.item)) return <Section {...props} />;
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={icon} title={title} description={description} />
      </div>
    );
  }
  return GatedSection;
}

// Pick between two sections by a predicate on the record (e.g. move-in vs move-out).
export function makeEitherSection({ when, then: Then, otherwise: Otherwise }) {
  function EitherSection(props) {
    return when(props.item) ? <Then {...props} /> : <Otherwise {...props} />;
  }
  return EitherSection;
}
