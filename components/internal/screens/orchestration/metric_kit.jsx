"use client";

import { ArrowDownRight, ArrowUpRight, Sigma } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@geiger/ui/button";
import { Card, CardContent } from "@geiger/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui/sheet";
import { EmptyState, RollingNumber } from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getMetric } from "@/lib/metrics/index";
import { recordTab, recordTypeLabel } from "@/lib/orchestration/records";
import { money } from "@/lib/reports/format";

// Metric surfaces (ORCH-03): a KPI row whose cells open the records behind each number, and the
// drill-down sheet (definition, formula, rows with links).

const COLS = { 2: "grid-cols-2", 3: "grid-cols-2 md:grid-cols-3", 4: "grid-cols-2 md:grid-cols-4" };

// StatsBar look, with clickable cells: { label, value, delta?, trend?, footer?, onClick? }.
export function MetricStatsBar({ stats, columns = 4, className }) {
  const n = [2, 3, 4].includes(columns) ? columns : 4;
  return (
    <Card className={cn("gap-0 overflow-hidden rounded-xl border-border bg-surface-subtle py-0 text-foreground", className)}>
      <CardContent className="p-0">
        <div className={cn("grid", COLS[n])}>
          {stats.map((stat, i) => {
            const up = stat.trend === "up";
            const TrendIcon = up ? ArrowUpRight : ArrowDownRight;
            const Cell = stat.onClick ? "button" : "div";
            return (
              <Cell
                key={stat.label}
                type={stat.onClick ? "button" : undefined}
                onClick={stat.onClick}
                title={stat.onClick ? `See the records behind ${stat.label.toLowerCase()}` : undefined}
                className={cn(
                  "border-border p-4 text-left",
                  i % 2 !== 0 && "border-l",
                  i >= 2 && "border-t",
                  "md:border-l-0 md:border-t-0",
                  i % n !== 0 && "md:border-l",
                  i >= n && "md:border-t",
                  stat.onClick && "cursor-pointer transition-colors hover:bg-surface-card",
                )}
              >
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">{stat.label}</span>
                <div className="mt-1 flex flex-col items-start gap-1 sm:flex-row sm:items-end sm:gap-2">
                  <RollingNumber value={stat.value} className="text-2xl font-bold leading-none text-foreground dark:text-white" />
                  {stat.delta ? (
                    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium sm:mb-0.5", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                      <TrendIcon className="h-3 w-3" />
                      {stat.delta}
                    </span>
                  ) : null}
                </div>
                {stat.footer ? <span className="mt-1 block text-[11px] text-text-tertiary">{stat.footer}</span> : null}
              </Cell>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// The rows behind one metric: { metricKey, result: computeMetric(), records: sourceRecords() }.
export function MetricDrillSheet({ drill, onClose }) {
  const { openItemInTab, setTab } = useWorkspaceUrl();
  const m = drill ? getMetric(drill.metricKey) : null;
  const records = drill?.records || [];
  return (
    <Sheet open={Boolean(drill)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{m?.label || "Metric"}</SheetTitle>
          <SheetDescription>{m?.description}</SheetDescription>
        </SheetHeader>
        {m ? (
          <div className="space-y-5 px-4 pb-8 pt-2">
            <div>
              <p className="text-3xl font-bold tabular-nums text-foreground">{drill.result?.display ?? "—"}</p>
              <p className="mt-1 text-xs text-text-tertiary">{drill.caption || `${records.length} record${records.length === 1 ? "" : "s"} behind this number`}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-card p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">How it&apos;s calculated</p>
              <p className="mt-1 text-sm text-text-secondary">{m.formula}</p>
            </div>
            {records.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface-subtle">
                {records.map((r, i) => {
                  const tab = recordTab(r.type);
                  return (
                    <li key={`${r.type}:${r.id}:${i}`}>
                      <button
                        type="button"
                        disabled={!tab}
                        onClick={() => tab && openItemInTab(r.id, tab)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover disabled:cursor-default"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">{r.label || recordTypeLabel(r.type)}</span>
                          <span className="block truncate text-[11px] text-text-tertiary">{[recordTypeLabel(r.type), r.note].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-text-secondary">
                          {r.amount ? money(r.amount) : null}
                          {tab ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState icon={Sigma} title="No records" description="Nothing counts toward this number right now." />
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() => {
                onClose();
                setTab("Metric Definitions");
              }}
            >
              <Sigma className="h-3.5 w-3.5" /> All metric definitions
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
