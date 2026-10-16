"use client";

import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

import { SectionCard } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";

// Building blocks shared by the Property / Building / Portfolio overviews.

// Thin occupancy meter (list cells + rollup tables).
export function OccupancyBar({ value, className }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const tone = v >= 93 ? "bg-emerald-400" : v >= 80 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-strong">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-secondary">{Math.round(v)}%</span>
    </div>
  );
}

// "Needs attention" list: [{ key, label, detail?, tone: "warning" | "danger", section? }].
export function AttentionCard({ items, onNavigate, title = "Needs attention" }) {
  return (
    <SectionCard title={title} bodyPadding={false}>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-text-secondary">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          All clear — nothing needs follow-up right now.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((a) => (
            <li key={a.key}>
              <button
                type="button"
                disabled={!a.section}
                onClick={() => a.section && onNavigate?.(a.section)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover disabled:cursor-default disabled:hover:bg-transparent"
              >
                <AlertTriangle
                  className={cn(
                    "h-4 w-4 shrink-0",
                    a.tone === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.label}</p>
                  {a.detail ? <p className="truncate text-xs text-text-secondary">{a.detail}</p> : null}
                </div>
                {a.section ? <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// Two-column definition list: [{ label, value }].
export function FactsCard({ title = "At a glance", facts, action }) {
  return (
    <SectionCard title={title} action={action}>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{f.label}</dt>
            <dd className="truncate text-sm text-foreground">{f.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

// Unit mix by bedroom count: count, occupancy and average rent per bucket.
export function UnitMixCard({ units }) {
  const buckets = {};
  for (const u of units) {
    const beds = Number(u.bedrooms) || 0;
    const key = beds === 0 ? "Studio" : `${beds} bed`;
    const b = (buckets[key] ||= { key, beds, count: 0, occupied: 0, rent: 0 });
    b.count += 1;
    b.rent += Number(u.rent) || 0;
    if (["Occupied", "Notice"].includes(u.status)) b.occupied += 1;
  }
  const rows = Object.values(buckets).sort((a, b) => a.beds - b.beds);
  return (
    <SectionCard title="Unit mix" bodyPadding={false}>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-text-secondary">No units yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3 text-sm">
              <span className="font-medium text-foreground">
                {r.key} <span className="font-normal text-text-tertiary">· {r.count} units</span>
              </span>
              <OccupancyBar value={(r.occupied / r.count) * 100} />
              <span className="w-24 text-right tabular-nums text-text-secondary">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
                  r.rent / r.count,
                )}
                <span className="text-text-tertiary"> avg</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
