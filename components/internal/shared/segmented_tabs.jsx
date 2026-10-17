"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SegmentedTabs({
  tabs,
  value,
  onChange,
  className,
  buttonClassName,
  fullWidth = false,
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface-subtle p-1",
        // Hug the tabs by default (w-auto still stretches a block/flex child); scroll inside when they outgrow the row.
        fullWidth ? "w-full" : "w-fit max-w-full",
        className,
      )}
    >
      {tabs.map((tab) => {
        const item = typeof tab === "string" ? { label: tab, value: tab } : tab;
        const isActive = value === item.value;
        const Icon = item.icon;

        return (
          <Button
            key={item.value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex h-8 min-w-max items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all",
              fullWidth ? "flex-1" : "flex-none",
              isActive
                ? "bg-surface-active text-foreground shadow-sm dark:bg-surface-hover"
                : "text-text-secondary hover:bg-surface-hover hover:text-foreground dark:hover:bg-surface-card",
              buttonClassName,
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
