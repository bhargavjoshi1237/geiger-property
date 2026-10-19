"use client";

import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

// Overview building blocks in the geiger-events event-overview style: icon glance rows, linked status rows and a "needs attention" list.

// Two-column icon + text facts ("At a glance"). rows: [{ key, icon, value, prefix?, empty? }] — falsy rows drop out.
export function GlanceGrid({ rows, className }) {
  const shown = (rows || []).filter(Boolean);
  return (
    <div className={cn("grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2", className)}>
      {shown.map((r) => (
        <GlanceRow key={r.key} {...r} />
      ))}
    </div>
  );
}

// One fact: icon + value; `prefix` names the value when it would be ambiguous, `empty` is shown muted when unset.
export function GlanceRow({ icon: Icon, value, prefix, empty = "—" }) {
  const unset = value === undefined || value === null || value === "";
  return (
    <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-text-secondary" /> : null}
      {unset ? (
        <span className="min-w-0 truncate text-text-tertiary">{empty}</span>
      ) : (
        <span className="min-w-0 truncate" title={typeof value === "string" ? value : undefined}>
          {prefix ? <span className="text-text-tertiary">{prefix} </span> : null}
          <span className="text-foreground">{value}</span>
        </span>
      )}
    </p>
  );
}

// Label → value rows in two columns, for facts without a natural icon. facts: [{ key?, label, value }].
export function FactList({ facts, className }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-8 sm:grid-cols-2", className)}>
      {(facts || []).filter(Boolean).map((f) => {
        const unset = f.value === undefined || f.value === null || f.value === "";
        return (
          <div key={f.key || f.label} className="flex min-w-0 items-center justify-between gap-4 border-b border-border py-2.5 text-sm">
            <dt className="shrink-0 text-text-secondary">{f.label}</dt>
            <dd className={cn("min-w-0 truncate text-right", unset ? "text-text-tertiary" : "text-foreground")}>
              {unset ? "—" : f.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

// Clickable status rows (portal, insurance, enrollment…) that jump to their section. rows: [{ key, icon, title, description?, control, section? }].
export function LinkRows({ rows, onNavigate, className }) {
  return (
    <div className={cn("-mx-2 space-y-0.5 lg:-mx-3", className)}>
      {(rows || []).filter(Boolean).map((r) => {
        const Icon = r.icon;
        const clickable = Boolean(r.section && onNavigate);
        return (
          <button
            key={r.key}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onNavigate(r.section)}
            className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-active lg:px-3 disabled:cursor-default disabled:hover:bg-transparent"
          >
            {Icon ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
              {r.description ? <span className="block truncate text-xs text-text-secondary">{r.description}</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {r.control}
              {clickable ? (
                <ChevronRight className="h-4 w-4 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Follow-ups list: [{ key, label, detail?, tone: "warning" | "danger", section? }]; an empty list reads as all clear.
export function AttentionList({ items, onNavigate, emptyText = "All clear — nothing needs follow-up right now.", className }) {
  if (!items?.length) {
    return (
      <p className={cn("flex items-center gap-2 text-sm text-text-secondary", className)}>
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {emptyText}
      </p>
    );
  }
  return (
    <ul className={cn("-mx-2 space-y-0.5 lg:-mx-3", className)}>
      {items.map((a) => {
        const clickable = Boolean(a.section && onNavigate);
        return (
          <li key={a.key}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onNavigate(a.section)}
              className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-active lg:px-3 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <AlertTriangle
                className={cn(
                  "h-4 w-4 shrink-0",
                  a.tone === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{a.label}</span>
                {a.detail ? <span className="block truncate text-xs text-text-secondary">{a.detail}</span> : null}
              </span>
              {clickable ? (
                <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// "2 items need attention" / "Nothing open" summary line for a section description.
export function attentionSummary(items) {
  const n = items?.length || 0;
  if (!n) return "Nothing open on this file.";
  return `${n} item${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} follow-up.`;
}
