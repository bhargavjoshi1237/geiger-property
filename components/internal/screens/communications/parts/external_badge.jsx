"use client";

import React from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

// Amber "External" pill for a contact outside this project's team.
export function ExternalBadge({ className, label = "External" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      <Globe className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
