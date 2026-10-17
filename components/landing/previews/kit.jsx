"use client";

import { Input } from "@geiger/ui/input";
import { Label } from "@geiger/ui/label";
import { cn } from "@/lib/utils";

// Shared building blocks for the auto-play scenes: theme-aware, compact, and addressable by the cursor via data-part.

// Builds an auto-play script: each step patches the previous state, and captions/chapters carry forward until changed.
export function flow(start, steps) {
  let state = start;
  let caption = "";
  let chapter = null;
  return steps.map((step, index) => {
    state = { ...state, ...step.set };
    caption = step.caption ?? caption;
    chapter = step.chapter ?? chapter ?? `step-${index}`;
    return { ...step, state, caption, chapter };
  });
}

export const money = (value) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Highlight is a soft, borderless wash that bleeds slightly past the region and sits behind its content.
const WASH = "isolate before:pointer-events-none before:absolute before:-inset-1.5 before:-z-10 before:rounded-xl before:bg-foreground/[0.06] before:opacity-0 before:transition-opacity before:duration-300";
const WASH_ON = "before:opacity-100";

// One meaningful region the player can highlight or aim the cursor at.
export function Part({ id, view, className, children }) {
  return (
    <div data-part={id} className={cn("relative rounded-lg", WASH, view.highlight === id && WASH_ON, className)}>
      {children}
    </div>
  );
}

// Scenes are display-only; the player drives every change.
export function SceneCard({ title, meta, aside, className, children }) {
  return (
    <div inert className={cn("w-full overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          {meta ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</div> : null}
        </div>
        {aside}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// A bordered list row; pass `part` + `view` to make it a highlight/cursor target.
export function Row({ part, view, className, children }) {
  return <div data-part={part} className={cn("relative flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5", part && WASH, part && view?.highlight === part && WASH_ON, className)}>{children}</div>;
}

export function RowText({ title, meta }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{title}</div>
      {meta ? <div className="truncate text-xs text-muted-foreground">{meta}</div> : null}
    </div>
  );
}

const TONES = {
  neutral: "border-border text-muted-foreground",
  strong: "border-foreground bg-foreground text-background",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export function Pill({ tone = "neutral", className, children }) {
  return <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", TONES[tone], className)}>{children}</span>;
}

export function Field({ id, label, view, placeholder, className }) {
  return (
    <div data-part={id} className={className}>
      {label ? <Label htmlFor={`scene-${id}`} className="mb-1.5 text-xs text-muted-foreground">{label}</Label> : null}
      <Input id={`scene-${id}`} readOnly value={view.state[id]} placeholder={placeholder} className={cn(view.highlight === id && "border-ring ring-[3px] ring-ring/50")} />
    </div>
  );
}

export function Bar({ value, className }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-foreground transition-[width] duration-500" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

// An inline status line that appears when something happens (a payment, a block, a result).
export function Notice({ tone = "neutral", icon: Icon, show = true, className, children }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs transition-all duration-300", TONES[tone], show ? "opacity-100" : "pointer-events-none opacity-0", className)}>
      {Icon ? <Icon className="mt-px size-3.5 shrink-0" /> : null}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function Avatar({ name, className }) {
  const initials = name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border border-card bg-muted text-[10px] font-semibold", className)}>{initials}</span>;
}
