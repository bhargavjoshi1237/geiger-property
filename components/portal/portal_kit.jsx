"use client";
/* eslint-disable @next/next/no-img-element -- portal renders remote Supabase storage URLs */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, ImagePlus, Loader2, Paperclip, X } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusPill, statusDotClass } from "@/components/internal/shared/screen_kit";
import { portalApi, portalUpload } from "@/lib/portal/portal_fetch";

// Shared portal primitives: formatters, the fetch hook, loading / empty / error
// states, upload controls, photo strips, document lists and status timelines.

// --- formatters ------------------------------------------------------------------

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (n) => usd.format(Number(n) || 0);
export const money0 = (n) => usd0.format(Number(n) || 0);

// Date-only strings ("YYYY-MM-DD") are read as local dates.
export function parseDate(v) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const fmtDate = (v) => {
  const d = parseDate(v);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
};

export const fmtDateTime = (v) => {
  const d = parseDate(v);
  return d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
};

export const monthLabel = (ym) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : ym;
};

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function firstName(name, email) {
  const n = String(name || "").trim();
  if (n) return n.split(/\s+/)[0];
  const e = String(email || "").trim();
  return e ? e.split("@")[0] : "there";
}

export function initials(name, email) {
  const src = String(name || "").trim() || String(email || "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : src.slice(0, 2).toUpperCase();
}

export const fileSize = (b) => {
  const n = Number(b) || 0;
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

// --- data hook -------------------------------------------------------------------

// GET `path` on mount (and on reload) → { data, loading, error, reload }.
export function usePortalData(path) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    portalApi(path).then((res) => {
      if (!alive) return;
      setState({ data: res.ok ? res : null, loading: false, error: res.ok ? "" : res.error });
    });
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

// --- states ----------------------------------------------------------------------

export function PortalLoading({ size = 48, className }) {
  return (
    <div className={cn("flex items-center justify-center rounded-xl border border-border bg-surface-subtle py-20", className)}>
      <LogoLoading size={size} aria-label="Loading" />
    </div>
  );
}

export function PortalEmpty({ icon, title, description, action, className }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface-subtle", className)}>
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  );
}

export function PortalError({ error, onRetry }) {
  return (
    <PortalEmpty
      title="Something went wrong"
      description={error || "We couldn't load this page."}
      action={
        onRetry ? (
          <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={onRetry}>
            Try Again
          </Button>
        ) : null
      }
    />
  );
}

// Loading → error → children(data) for a usePortalData result.
export function DataGate({ state, children, size }) {
  if (state.loading && !state.data) return <PortalLoading size={size} />;
  if (!state.data) return <PortalError error={state.error} onRetry={state.reload} />;
  return children(state.data);
}

// Bordered card with an optional titled header (portal flavour of SectionCard).
export function Panel({ title, description, action, children, className, bodyClassName, flush = false }) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-surface-subtle", className)}>
      {title || action ? (
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-text-secondary">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(flush ? "" : "p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

// Label / value pair used in summary grids.
export function Stat({ label, children, className }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

// Divided list rows inside a Panel (flush).
export function Rows({ children }) {
  return <div className="divide-y divide-border">{children}</div>;
}

export function Row({ title, meta, aside, onClick, className }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5",
        onClick && "transition-colors hover:bg-surface-hover",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        {meta ? <div className="mt-0.5 truncate text-xs text-text-tertiary">{meta}</div> : null}
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
    </Comp>
  );
}

// Inline notice strip (not-configured / turned-off states).
export function Notice({ icon: Icon, children, tone = "neutral", className }) {
  const tones = {
    neutral: "border-border bg-surface-subtle text-text-secondary",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  };
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// --- uploads -----------------------------------------------------------------------

// Pick + upload files; calls onUploaded([{ url, name, size, type }]).
export function UploadButton({ purpose, onUploaded, multiple = false, accept = "image/*,application/pdf", label = "Add photos", icon: Icon = ImagePlus, className, disabled }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const done = [];
    for (const f of files) {
      const res = await portalUpload(f, purpose);
      if (res.ok) done.push(res.file);
      else toast.error(res.error || `Couldn't upload ${f.name}.`);
    }
    setBusy(false);
    if (done.length) onUploaded(done);
  };
  return (
    <>
      <input ref={ref} type="file" className="hidden" accept={accept} multiple={multiple} onChange={pick} />
      <Button
        type="button"
        variant="outline"
        disabled={busy || disabled}
        onClick={() => ref.current?.click()}
        className={cn("border-border bg-surface-card hover:bg-surface-hover", className)}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {busy ? "Uploading…" : label}
      </Button>
    </>
  );
}

// Single attachment picker for forms (shows the chosen file with a remove control).
export function AttachmentField({ value, onChange, purpose, label = "Attach file" }) {
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-card px-3 py-2 text-sm">
        <a href={value.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-foreground hover:underline">
          <Paperclip className="h-4 w-4 shrink-0 text-text-tertiary" />
          <span className="truncate">{value.name}</span>
        </a>
        <button type="button" onClick={() => onChange(null)} aria-label="Remove attachment" className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return <UploadButton purpose={purpose} label={label} icon={Paperclip} onUploaded={(files) => onChange(files[0])} className="w-full sm:w-auto" />;
}

// Thumbnails for [{ url, label|name }], optionally removable.
export function PhotoStrip({ photos, onRemove, className }) {
  if (!photos?.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {photos.map((p, i) => {
        const isPdf = /\.pdf($|\?)/i.test(p.url || "") || p.type === "application/pdf";
        return (
          <div key={p.id || p.url || i} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-surface-card">
            <a href={p.url} target="_blank" rel="noreferrer" className="block h-full w-full">
              {isPdf ? (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-text-secondary">
                  <FileText className="h-5 w-5" /> PDF
                </span>
              ) : (
                <img src={p.url} alt={p.label || p.name || "Photo"} className="h-full w-full object-cover" loading="lazy" />
              )}
            </a>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 rounded-md bg-background/80 p-0.5 text-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// Vertical status timeline [{ id, status, at, note }] in display order.
export function Timeline({ items, map }) {
  if (!items?.length) return <p className="text-sm text-text-secondary">No updates yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((h, i) => (
        <li key={h.id || i} className="relative">
          <span
            className={cn(
              "absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface-subtle",
              statusDotClass(map?.[h.status]),
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={h.status} map={map} />
            <span className="text-xs text-text-tertiary">{fmtDateTime(h.at)}</span>
          </div>
          {h.note ? <p className="mt-1 text-sm text-text-secondary">{h.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

// --- documents -----------------------------------------------------------------------

export function DocumentRows({ documents }) {
  return (
    <Rows>
      {documents.map((d) => (
        <a
          key={d.id}
          href={d.url || undefined}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-hover sm:px-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-text-secondary">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
              <p className="mt-0.5 truncate text-xs text-text-tertiary">
                {[d.source, d.kind && d.kind !== "other" ? d.kind : null, fmtDate(d.createdAt), fileSize(d.sizeBytes)].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-xs text-text-secondary">Open</span>
        </a>
      ))}
    </Rows>
  );
}
