"use client";

import { useState } from "react";
import { ArrowUpRight, Building2, ChevronDown, ChevronUp, ShieldQuestion } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@geiger/ui/tooltip";
import {
  AUDIENCE_TAGS,
  RENT_STATUS_MAP,
  STATE_TILES,
  VERIFICATION_NOTES,
  citeIfNew,
  hostOf,
  rentStatus,
} from "./constants";

export const OUTLINE_BUTTON = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";
export const GHOST_BUTTON = "text-muted-foreground hover:bg-surface-hover hover:text-foreground";
export const FACT_LABEL = "text-[11px] font-medium uppercase tracking-[.06em] text-text-secondary";

// Grayscale ramp for the rent map: stronger fill = more rent regulation; "Not confirmed" is a dashed outline.
const RAMP = {
  cap: "border-transparent bg-[color-mix(in_oklab,var(--foreground)_36%,var(--surface-card))] text-foreground",
  local: "border-transparent bg-[color-mix(in_oklab,var(--foreground)_22%,var(--surface-card))] text-foreground",
  restricted: "border-transparent bg-[color-mix(in_oklab,var(--foreground)_11%,var(--surface-card))] text-foreground",
  preempted: "border-border bg-surface-card text-muted-foreground",
  unconfirmed: "border-dashed border-border-strong bg-transparent text-text-secondary",
};

// Rent-status dot; "Not confirmed" renders as a hollow ring and federal (no status) keeps an empty slot.
export function StatusDot({ status, className }) {
  return (
    <span aria-hidden className={cn("size-2 shrink-0 rounded-full", RENT_STATUS_MAP[status]?.dotClass, className)} />
  );
}

// Rent regulation as a Harvey ball, the same "more fill = more regulation" grammar as the map; unknown is a dashed ring.
const RENT_FILL = { cap: 1, local: 0.5, restricted: 0.25, preempted: 0 };

// Pie wedge of fraction f, clockwise from 12 o'clock, centred on (c, c).
function wedgePath(f, c, r) {
  const a = 2 * Math.PI * f;
  const x = (c + r * Math.sin(a)).toFixed(3);
  const y = (c - r * Math.cos(a)).toFixed(3);
  return `M${c} ${c}L${c} ${c - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y}Z`;
}

export function RentLevelMark({ status, className }) {
  const fill = RENT_FILL[status];
  const unknown = fill === undefined;
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn("size-3.5 shrink-0", unknown || !fill ? "text-text-secondary" : "text-foreground", className)}
    >
      {/* Fill runs to the outline: an inset fill reads as a radio button (full) or a clock (quarter). */}
      <circle
        cx="8"
        cy="8"
        r="7"
        fill={fill === 1 ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray={unknown ? "2.75 2.75" : undefined}
      />
      {fill > 0 && fill < 1 ? <path d={wedgePath(fill, 8, 7)} fill="currentColor" /> : null}
    </svg>
  );
}

// Labelled rent-regulation mark; `hint` adds the plain-English meaning on hover (off inside other buttons).
export function RentLevel({ status, size = "sm", hint = true, className }) {
  const meta = RENT_STATUS_MAP[status];
  if (!meta) return null;
  const body = (
    <span
      tabIndex={hint ? 0 : undefined}
      aria-label={hint ? `${meta.label}. ${meta.desc}` : undefined}
      className={cn(
        "inline-flex items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-border",
        size === "md" ? "gap-2" : "gap-1.5",
        className,
      )}
    >
      <RentLevelMark status={status} className={size === "md" ? "size-4" : "size-3.5"} />
      <span
        className={cn(
          "whitespace-nowrap",
          size === "md" ? "text-sm font-medium" : "text-xs",
          status === "unconfirmed" ? "text-text-secondary" : "text-foreground",
        )}
      >
        {meta.label}
      </span>
    </span>
  );
  if (!hint) return body;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{body}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-64">
          {meta.desc}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// "4 properties" marker for places you operate, quieter than a badge.
export function OwnedMarker({ count, className }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground", className)}>
      <Building2 className="size-3" />
      {count} {count === 1 ? "property" : "properties"}
    </span>
  );
}

export function RampSwatch({ status }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-[3px] border", RAMP[status], status === "preempted" && "border-border-strong")}
    />
  );
}

// Tab label with an optional ramp swatch and a muted count.
export function TabLabel({ text, count, swatch }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch ? <RampSwatch status={swatch} /> : null}
      {text}
      {count == null ? null : <span className="tabular-nums text-text-tertiary">{count}</span>}
    </span>
  );
}

// The one quiet "links, not advice" line each view ends with.
export function LegalFootnote({ children, className }) {
  return <p className={cn("text-xs leading-relaxed text-text-secondary", className)}>{children}</p>;
}

export function GroupHeading({ label, count, desc, compact }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2.5">
      <h3 className={cn("whitespace-nowrap font-semibold text-foreground", compact ? "text-sm" : "text-[15px]")}>{label}</h3>
      <span className="text-xs tabular-nums text-text-tertiary">{count}</span>
      {desc ? <span className="hidden truncate text-xs text-text-secondary sm:inline">{desc}</span> : null}
    </div>
  );
}

// One pinned source as a dense row: title, publisher · citation, tags, source domain. Opens the original.
export function ResourceRow({ resource, tag, compact }) {
  const host = hostOf(resource.url);
  const cite = citeIfNew(resource);
  const audience = AUDIENCE_TAGS[resource.audience];
  const note = VERIFICATION_NOTES[resource.verification];
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex items-center border-t border-border text-inherit no-underline outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover",
        compact ? "gap-3.5 py-[11px] pl-4 pr-3.5" : "gap-4 py-3 pl-5 pr-4",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium leading-snug text-foreground", compact ? "text-[13.5px]" : "text-sm")}>{resource.title}</p>
        <p className="mt-0.5 truncate text-xs text-text-secondary">
          {resource.publisher || host}
          {cite ? (
            <>
              {" · "}
              <span className="font-mono text-[11.5px] text-muted-foreground">{cite}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {tag ? <Badge variant="neutral" className="hidden @md:inline-flex">{tag}</Badge> : null}
        {audience ? <Badge variant="neutral" className="hidden @md:inline-flex">{audience}</Badge> : null}
        {resource.format === "pdf" ? <Badge variant="outline">PDF</Badge> : null}
        {note ? (
          <span title={note} className="inline-flex text-text-secondary">
            <ShieldQuestion className="size-3.5" />
            <span className="sr-only">{note}</span>
          </span>
        ) : null}
        <span
          className={cn(
            "hidden truncate text-right text-xs text-text-secondary @2xl:block",
            compact ? "w-[132px]" : "w-[168px]",
          )}
        >
          {host}
        </span>
        <ArrowUpRight className="size-4 text-text-tertiary transition-colors group-hover:text-foreground" />
      </div>
    </a>
  );
}

// Bordered list of resource rows; past `limit` it collapses behind a "Show N more" toggle unless `expanded`.
export function ResourceList({ rows, tagOf, limit, expanded, compact }) {
  const [open, setOpen] = useState(false);
  const collapsible = Boolean(limit) && !expanded && rows.length > limit;
  const shown = collapsible && !open ? rows.slice(0, limit) : rows;
  return (
    <div className={cn("@container overflow-hidden border border-border bg-surface-subtle", compact ? "rounded-[10px]" : "rounded-xl")}>
      <div className="-mt-px">
        {shown.map((r) => (
          <ResourceRow key={r.id} resource={r} tag={tagOf?.(r)} compact={compact} />
        ))}
      </div>
      {collapsible ? (
        <div className="border-t border-border px-3 py-1.5">
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} className={GHOST_BUTTON}>
            {open ? "Show Fewer" : `Show ${rows.length - limit} More`}
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Geographic tile grid of the 50 states + DC on the grayscale rent ramp; `lens` dims every other status.
export function RentTileMap({ states, portfolio, selected, lens, onSelect }) {
  const byCode = new Map(states.map((j) => [j.code, j]));
  return (
    <div className="mx-auto grid w-full max-w-[680px] grid-cols-12 gap-1 py-2 sm:gap-1.5" role="list" aria-label="US states by rent regulation">
      {Object.entries(STATE_TILES).map(([code, [col, row]]) => {
        const j = byCode.get(code);
        if (!j) return null;
        const status = rentStatus(j);
        const label = RENT_STATUS_MAP[status].label;
        return (
          <button
            key={code}
            type="button"
            role="listitem"
            title={`${j.name}: ${label}`}
            aria-label={`${j.name}: ${label}`}
            aria-current={code === selected ? "true" : undefined}
            onClick={() => onSelect(code)}
            style={{ gridColumnStart: col + 1, gridRowStart: row + 1 }}
            className={cn(
              "relative flex aspect-square items-center justify-center rounded-md border text-[10px] font-semibold tracking-[.02em] outline-none transition-[opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-border-strong sm:text-[11px] lg:text-xs",
              RAMP[status],
              lens !== "all" && lens !== status && "opacity-20",
              code === selected && "ring-[1.5px] ring-foreground ring-offset-2 ring-offset-surface-subtle focus-visible:ring-foreground",
            )}
          >
            {code}
            {portfolio.has(code) ? <span className="absolute right-1 top-1 size-[5px] rounded-full bg-foreground" /> : null}
          </button>
        );
      })}
    </div>
  );
}
