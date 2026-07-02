"use client";

import { useSyncExternalStore } from "react";
import {
  getSupabaseActivityServerSnapshot,
  getSupabaseActivitySnapshot,
  subscribeToSupabaseActivity,
} from "@/lib/supabase/activity";

export function SupabaseActivityLine() {
  const activity = useSyncExternalStore(
    subscribeToSupabaseActivity,
    getSupabaseActivitySnapshot,
    getSupabaseActivityServerSnapshot
  );

  if (!activity.active) {
    return null;
  }

  return (
    <div
      aria-label={activity.saving ? "Saving changes" : "Loading data"}
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 -bottom-px h-px overflow-hidden"
      role="status"
    >
      <div
        className={[
          "supabase-activity-line",
          activity.saving ? "is-saving" : "is-loading",
        ].join(" ")}
      />
    </div>
  );
}
