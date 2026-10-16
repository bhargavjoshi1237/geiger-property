"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ScreenHeader,
  StatsBar,
  Toolbar,
  SectionCard,
  DataTable,
  EmptyState,
  ListLoading,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";

// Shared frame + helpers for the read-only, computed report screens.

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

// --- CSV export -----------------------------------------------------------------

function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Neutralize spreadsheet formula injection for text cells.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BOM = "\uFEFF"; // so Excel reads the file as UTF-8

// Client-side CSV download. columns: [{ header, value(row) | key }].
export function downloadCsv(filename, columns, rows) {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(","),
    ...rows.map((r) =>
      columns.map((c) => csvCell(c.value ? c.value(r) : r[c.key])).join(","),
    ),
  ];
  const blob = new Blob([BOM + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Download + toast, with a dated filename ("rent-roll-2026-10-10.csv").
export function exportCsv(name, columns, rows) {
  if (!rows?.length) {
    toast.error("Nothing to export yet.");
    return;
  }
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  downloadCsv(`${slug}-${stamp}`, columns, rows);
  toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
}

export function ExportButton({ onClick, disabled, label = "Export CSV" }) {
  return (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={onClick}
      disabled={disabled}
    >
      <Download className="h-4 w-4" /> {label}
    </Button>
  );
}

// Small secondary export for a section card header.
export function SectionExportButton({ onClick }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-8 text-text-secondary hover:bg-surface-hover hover:text-foreground"
    >
      <Download className="h-3.5 w-3.5" /> Export
    </Button>
  );
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

export const matchesProperty = (filter, propertyId) =>
  filter === "all" || propertyId === filter;

// --- Frame ----------------------------------------------------------------------

// MainScreenWrapper → ScreenHeader (export + actions) → StatsBar → Toolbar → body.
export function ReportScreen({
  title,
  description,
  loading,
  stats,
  onExport,
  exportDisabled,
  actions,
  filters,
  toolbarRight,
  children,
}) {
  // Frame + zeroed stats stay up while loading; only the body swaps to a loader.
  if (loading) {
    return (
      <MainScreenWrapper>
        <ScreenHeader title={title} description={description} />
        {stats?.length ? <StatsBar stats={stats} /> : null}
        <ListLoading label={`Loading ${String(title).toLowerCase()}`} />
      </MainScreenWrapper>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={title}
        description={description}
        actions={
          actions || onExport ? (
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              {onExport ? (
                <ExportButton onClick={onExport} disabled={exportDisabled} />
              ) : null}
            </div>
          ) : null
        }
      />
      {stats?.length ? <StatsBar stats={stats} /> : null}
      {filters || toolbarRight ? (
        <Toolbar>
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
          {toolbarRight ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {toolbarRight}
            </div>
          ) : null}
        </Toolbar>
      ) : null}
      {children}
    </MainScreenWrapper>
  );
}

// A titled card holding a table (or an empty state when there are no rows).
export function ReportTable({
  title,
  description,
  action,
  columns,
  rows,
  getRowKey = (r, i) => r.id ?? r.key ?? i,
  onRowClick,
  emptyIcon,
  emptyTitle = "No data yet",
  emptyDescription,
  emptyAction,
  className,
}) {
  return (
    <SectionCard
      title={title}
      description={description}
      action={action}
      bodyPadding={false}
      className={className}
    >
      {rows?.length ? (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={rows}
            getRowKey={getRowKey}
            onRowClick={onRowClick}
            className="rounded-none border-0"
          />
        </div>
      ) : (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          className="py-12"
        />
      )}
    </SectionCard>
  );
}

// A full-width empty state for a report with no source data at all.
export function ReportEmpty({ icon, title, description, action }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle">
      <EmptyState icon={icon} title={title} description={description} action={action} />
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
