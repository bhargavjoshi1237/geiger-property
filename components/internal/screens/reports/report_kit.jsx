"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@geiger/ui/input";
import { AS_OF_PRESETS, RANGE_PRESETS, resolveRange } from "@/lib/reports/periods";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";

// Shared controls + small visuals for the report screens (report_view.jsx) and
// the Overview dashboard (useReportData).

// Chart series colors (validated categorical pair, dark + light). The swatch
// classes also make Tailwind emit the CSS variables the charts read.
export const SERIES = {
  primary: { color: "var(--color-blue-500)", swatch: "bg-blue-500" },
  secondary: { color: "var(--color-amber-600)", swatch: "bg-amber-600" },
};

// --- Data loading ---------------------------------------------------------------

// Parallel fetch of `{ key: () => layerCall() }` on mount; null results become [].
export function useReportData(loaders) {
  const loadersRef = useRef(loaders);
  const [state, setState] = useState({ loading: true, data: {} });

  const reload = useCallback(async () => {
    const entries = Object.entries(loadersRef.current);
    const results = await Promise.all(
      entries.map(([, fn]) => Promise.resolve().then(fn).catch(() => null)),
    );
    setState({
      loading: false,
      data: Object.fromEntries(entries.map(([k], i) => [k, results[i] ?? []])),
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { loading: state.loading, data: state.data, reload };
}

// --- Filters --------------------------------------------------------------------

export function PropertyFilter({ properties, value, onChange }) {
  return (
    <FilterDropdown
      value={value}
      onValueChange={onChange}
      height="h-9"
      options={[
        { value: "all", label: "All properties" },
        ...(properties || []).map((p) => ({ value: p.id, label: p.name || "Untitled property" })),
      ]}
    />
  );
}

// Date range picker: a preset dropdown, plus from/to inputs for a custom range.
// mode "asOf" offers point-in-time presets and a single date.
export function RangeFilter({ value, onChange, mode = "range" }) {
  const presets = mode === "asOf" ? AS_OF_PRESETS : RANGE_PRESETS;
  const pick = (preset) =>
    onChange(preset === "custom" ? { ...value, preset } : resolveRange({ preset }));
  const setDay = (key) => (e) => {
    const v = e.target.value;
    if (!v) return;
    onChange(mode === "asOf" ? { preset: "custom", from: v, to: v } : resolveRange({ ...value, preset: "custom", [key]: v }));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterDropdown
        value={presets.some((p) => p.value === value.preset) ? value.preset : "custom"}
        onValueChange={pick}
        options={presets}
        height="h-9"
      />
      {value.preset === "custom" ? (
        mode === "asOf" ? (
          <Input type="date" value={value.to} onChange={setDay("to")} aria-label="As of" className="h-9 w-40" />
        ) : (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={value.from} onChange={setDay("from")} aria-label="From" className="h-9 w-40" />
            <span className="text-xs text-text-tertiary">to</span>
            <Input type="date" value={value.to} onChange={setDay("to")} aria-label="To" className="h-9 w-40" />
          </div>
        )
      ) : null}
    </div>
  );
}

// Single-hue horizontal meter for a 0–1 share; the value label stays in text ink.
export function MeterBar({ value, className, colorClass = SERIES.primary.swatch }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0)) * 100;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-sm bg-surface-strong", className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={cn("h-full rounded-sm", colorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Legend row for a multi-series chart (swatch + label in text ink).
export function ChartLegendRow({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", it.swatch)} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// Compact label/value list used for statement lines (P&L, balance sheet).
export function StatementLines({ lines, total }) {
  return (
    <div className="divide-y divide-border">
      {lines.map((l) => (
        <div key={l.label} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
          <span className={cn("min-w-0 truncate", l.muted ? "text-text-tertiary" : "text-text-secondary")}>
            {l.label}
          </span>
          <span className="shrink-0 tabular-nums text-foreground">{l.value}</span>
        </div>
      ))}
      {total ? (
        <div className="flex items-center justify-between gap-4 bg-surface-card px-5 py-3 text-sm font-semibold">
          <span className="text-foreground">{total.label}</span>
          <span className="tabular-nums text-foreground">{total.value}</span>
        </div>
      ) : null}
    </div>
  );
}
