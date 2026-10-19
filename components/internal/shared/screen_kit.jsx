"use client";

import React, { useMemo, useState } from "react";
import {
  DataTable,
  EditorSectionHeader,
  EmptyState,
  ExpandableSearch,
  Field,
  InlineTitleInput,
  LoadingArea,
  RollingNumber as BaseRollingNumber,
  ScreenHeader,
  SectionCard,
  SettingRow,
  SettingsList,
  StatusPill,
  Toolbar,
} from "@geiger/ui";
import { Card, CardContent } from "@geiger/ui/card";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared screen primitives come from @geiger/ui so every Geiger product renders the same kit (mirrors geiger-events).
export {
  DataTable,
  EditorSectionHeader,
  EmptyState,
  Field,
  InlineTitleInput,
  LoadingArea,
  ScreenHeader,
  SectionCard,
  SettingRow,
  SettingsList,
  StatusPill,
  Toolbar,
};

// --- Search ------------------------------------------------------------------

// The suite collapsible search (@geiger/ui SearchInput), held open while it has a value so a remounted list never hides an active filter.
export function SearchInput({ value, onChange, placeholder = "Search…", expanded = false, className, "aria-label": ariaLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <ExpandableSearch
      value={value ?? ""}
      onChange={onChange}
      placeholder={placeholder}
      label={ariaLabel || placeholder}
      open={expanded || open || Boolean(value)}
      onOpenChange={setOpen}
      autoFocus={!expanded && open}
      expandedWidth={expanded ? "100%" : "16rem"}
      className={cn(expanded ? "w-full" : "ml-auto", className)}
      inputClassName="[&::-webkit-search-cancel-button]:appearance-none"
    />
  );
}

// --- Status dots -------------------------------------------------------------

// Status dots for places that show a dot without its badge (calendars, timelines), one per Badge variant so they stay on the palette.
export const VARIANT_DOT = {
  success: "bg-emerald-500 dark:bg-emerald-400",
  info: "bg-sky-500 dark:bg-sky-400",
  warning: "bg-amber-500 dark:bg-amber-400",
  danger: "bg-red-500 dark:bg-red-400",
  purple: "bg-violet-500 dark:bg-violet-300",
  neutral: "bg-text-tertiary",
  outline: "bg-border-strong",
};

export function statusDotClass(meta) {
  return meta?.dotClass || VARIANT_DOT[meta?.variant] || VARIANT_DOT.neutral;
}

// --- Loading state -----------------------------------------------------------

// In-place panel loader for a list/section slot while the rest of the frame stays rendered.
export function ListLoading({ label = "Loading", className }) {
  return <LoadingArea panel label={label} className={className} />;
}

// --- Rolling numbers (compact on mobile) -------------------------------------

// Values at or above this magnitude collapse to K/M/B on mobile so 2xl figures fit half-width cells.
export const COMPACT_THRESHOLD_DEFAULT = 10000;

// " $24,860 " -> { prefix: "$", numeric: 24860, suffix: "" }; mirrors @geiger/ui's RollingNumber parser.
function splitAffixes(value) {
  const str = String(value ?? "");
  const match = str.match(/^([^\d]*)([\d,]*\.?\d*)([^\d]*)$/);
  if (!match || match[2] === "") return null;
  const [, prefix, numPart, suffix] = match;
  const numeric = parseFloat(numPart.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return { prefix, suffix, numeric, str };
}

function toCompactNumber(abs) {
  const [scaled, unit] = abs >= 1e9 ? [abs / 1e9, "B"] : abs >= 1e6 ? [abs / 1e6, "M"] : [abs / 1e3, "K"];
  const out = scaled >= 100 ? String(Math.round(scaled)) : String(Math.round(scaled * 10) / 10).replace(/\.0$/, "");
  return `${out}${unit}`;
}

// "$24,860" -> "$24.9K"; passes through small values, non-numeric labels and percentages.
export function formatCompactValue(value, threshold = COMPACT_THRESHOLD_DEFAULT) {
  const parsed = splitAffixes(value);
  if (!parsed) return String(value ?? "");
  const { prefix, suffix, numeric, str } = parsed;
  if (/%/.test(suffix)) return str;
  if (Math.abs(numeric) < threshold) return str;
  return `${prefix}${toCompactNumber(Math.abs(numeric))}${suffix}`;
}

// Full figure on md+, K/M form below — two copies toggled by CSS so SSR and first paint agree.
export function RollingNumber({
  value,
  className,
  duration = 1100,
  compactOnMobile = true,
  compactThreshold = COMPACT_THRESHOLD_DEFAULT,
  compactValue,
}) {
  const compact = useMemo(
    () => (compactValue !== undefined ? String(compactValue) : formatCompactValue(value, compactThreshold)),
    [value, compactValue, compactThreshold],
  );
  const fullStr = value === null || value === undefined ? "" : String(value);

  if (!compactOnMobile || !compact || compact === fullStr) {
    return <BaseRollingNumber value={value} className={className} duration={duration} />;
  }

  return (
    <>
      <span className="hidden min-w-0 md:inline-flex">
        <BaseRollingNumber value={value} className={className} duration={duration} />
      </span>
      <span className="inline-flex min-w-0 md:hidden" title={fullStr} aria-label={fullStr}>
        <BaseRollingNumber value={compact} className={className} duration={duration} />
      </span>
    </>
  );
}

// --- KPI tiles ---------------------------------------------------------------

export function StatGrid({
  stats,
  columns = 4,
  className,
  compactOnMobile = true,
  compactThreshold = COMPACT_THRESHOLD_DEFAULT,
}) {
  const colClass =
    {
      2: "sm:grid-cols-2",
      3: "sm:grid-cols-3",
      4: "grid-cols-2 lg:grid-cols-4",
      5: "grid-cols-2 lg:grid-cols-5",
    }[columns] || "grid-cols-2 lg:grid-cols-4";

  return (
    <div className={cn("grid gap-4", colClass, className)}>
      {stats.map((stat) => (
        <StatTile
          key={stat.label}
          {...stat}
          compactOnMobile={stat.compactOnMobile ?? compactOnMobile}
          compactThreshold={stat.compactThreshold ?? compactThreshold}
        />
      ))}
    </div>
  );
}

// `tone` tints a figure that carries meaning on its own (e.g. a balance due).
const TONE_CLASS = {
  danger: "text-red-600 dark:text-red-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
};

export function StatTile({
  label,
  value,
  delta,
  trend,
  hint,
  icon: Icon,
  tone,
  onClick,
  compactOnMobile = true,
  compactThreshold = COMPACT_THRESHOLD_DEFAULT,
  compactValue,
}) {
  const trendClass =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-text-secondary";

  return (
    <Card
      className={cn(
        "rounded-xl border-border bg-surface-subtle py-0 text-foreground",
        onClick && "cursor-pointer transition-colors hover:border-border-strong hover:bg-surface-card",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{label}</span>
          {Icon ? <Icon className="h-4 w-4 text-text-tertiary" /> : null}
        </div>
        <div className="mt-2 flex flex-col items-start gap-1 sm:flex-row sm:items-end sm:gap-2">
          <RollingNumber
            value={value}
            className={cn("text-2xl font-bold leading-none tabular-nums", TONE_CLASS[tone] || "text-foreground dark:text-white")}
            compactOnMobile={compactOnMobile}
            compactThreshold={compactThreshold}
            compactValue={compactValue}
          />
          {delta ? <span className={cn("text-xs font-medium sm:mb-0.5", trendClass)}>{delta}</span> : null}
        </div>
        {hint ? <span className="mt-1.5 block truncate text-[11px] text-text-tertiary">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}

// --- Stats bar (unified KPI row) ---------------------------------------------

const STATS_BAR_COLS = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
};

// Single-card KPI row with divider-separated cells. Each stat: { label, value, delta?, trend?, footer? }.
export function StatsBar({
  stats,
  columns = 4,
  className,
  compactOnMobile = true,
  compactThreshold = COMPACT_THRESHOLD_DEFAULT,
}) {
  const colCount = [2, 3, 4].includes(columns) ? columns : 4;
  const cols = STATS_BAR_COLS[colCount];

  return (
    <Card className={cn("gap-0 overflow-hidden rounded-xl border-border bg-surface-subtle py-0 text-foreground", className)}>
      <CardContent className="p-0">
        <div className={cn("grid", cols)}>
          {stats.map((stat, i) => {
            const up = stat.trend === "up";
            const TrendIcon = up ? ArrowUpRight : ArrowDownRight;
            return (
              <div
                key={stat.label}
                className={cn(
                  "border-border p-4",
                  i % 2 !== 0 && "border-l",
                  i >= 2 && "border-t",
                  "md:border-l-0 md:border-t-0",
                  i % colCount !== 0 && "md:border-l",
                  i >= colCount && "md:border-t",
                )}
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{stat.label}</span>
                <div className="mt-1 flex flex-col items-start gap-1 sm:flex-row sm:items-end sm:gap-2">
                  <RollingNumber
                    value={stat.value}
                    className="text-2xl font-bold leading-none text-foreground dark:text-white"
                    compactOnMobile={stat.compactOnMobile ?? compactOnMobile}
                    compactThreshold={stat.compactThreshold ?? compactThreshold}
                    compactValue={stat.compactValue}
                  />
                  {stat.delta ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-xs font-medium sm:mb-0.5",
                        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                      )}
                    >
                      <TrendIcon className="h-3 w-3" />
                      {stat.delta}
                    </span>
                  ) : null}
                </div>
                {stat.footer ? <span className="mt-1 block text-[11px] text-text-tertiary">{stat.footer}</span> : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
