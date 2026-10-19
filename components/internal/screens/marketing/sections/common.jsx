"use client";

import { useEffect, useState } from "react";
import { Info, PlugZap } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { listShowingsForListing, listShowingsForProspect } from "@/lib/supabase/showings";
import { listApplicationsForListing, listApplicationsForProspect } from "@/lib/supabase/applications";
import { listProspectsForListing } from "@/lib/supabase/prospects";
import { cn } from "@/lib/utils";
import {
  APPLICATION_STATUS_MAP,
  PROSPECT_STATUS_MAP,
  SHOWING_STATUS_MAP,
  currency,
  formatDate,
} from "../shared";

// Shared building blocks for the Marketing & Leads editors.

export function Note({ children, icon: Icon = Info, className }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary",
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// "Provider not connected" banner for screening, syndication and smart-lock surfaces.
export function ProviderNotice({ what, children }) {
  return (
    <Note icon={PlugZap}>
      <p>
        <span className="font-medium text-foreground">{what} provider not connected.</span>{" "}
        {children}
      </p>
    </Note>
  );
}

// Read-only label/value grid inside a card.
export function KeyValues({ items, columns = 2, title, description, action }) {
  return (
    <SectionCard title={title} description={description} action={action}>
      <dl className={cn("grid gap-x-6 gap-y-5", columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{it.label}</dt>
            <dd className={cn("mt-1 truncate text-sm text-foreground", it.className)}>{it.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

// Horizontal funnel of counts with step conversion.
export function FunnelStrip({ steps }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const rate = prev ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.label} className="bg-surface-subtle px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{s.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{s.value}</p>
            <p className="text-[11px] text-text-tertiary">{rate === null ? "Top of funnel" : `${rate}% of previous`}</p>
          </div>
        );
      })}
    </div>
  );
}

// Loads async data keyed on the record id; returns null while loading.
export function useLoad(loader, deps) {
  const [state, setState] = useState({ key: null, value: null });
  const key = JSON.stringify(deps);
  useEffect(() => {
    let alive = true;
    Promise.resolve(loader())
      .then((v) => alive && setState({ key, value: v }))
      .catch(() => alive && setState({ key, value: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.value : undefined;
}

// Fields section whose `optionsFrom` selects load their options first — for
// metadata-backed pickers (relation fields only persist real columns).
export function makeAsyncFieldsSection(fields, loaders) {
  function AsyncFieldsSection({ item, onPatch, onCommit, onCommitMeta }) {
    const options = useLoad(async () => {
      const keys = Object.keys(loaders);
      const lists = await Promise.all(keys.map((k) => loaders[k]()));
      return Object.fromEntries(keys.map((k, i) => [k, lists[i] || []]));
    }, ["options"]);
    const resolved = fields.map((f) =>
      f.optionsFrom ? { ...f, type: "select", options: options?.[f.optionsFrom] || [], placeholder: options ? f.placeholder : "Loading…" } : f,
    );
    return <FieldsForm item={item} fields={resolved} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />;
  }
  return AsyncFieldsSection;
}

// --- related-record columns ----------------------------------------------------

const twoLine = (top, bottom) => (
  <div className="flex flex-col gap-0.5">
    <span className="font-medium text-foreground">{top}</span>
    {bottom ? <span className="text-xs text-text-secondary">{bottom}</span> : null}
  </div>
);

export const SHOWING_COLUMNS = [
  { key: "name", header: "Showing", render: (r) => twoLine(r.name || "Showing", [r.prospectName, r.unit].filter(Boolean).join(" · ")) },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={SHOWING_STATUS_MAP} /> },
  { key: "type", header: "Type", render: (r) => (r.showingType ? <Badge variant="neutral">{r.showingType}</Badge> : "—") },
  {
    key: "when",
    header: "When",
    align: "right",
    className: "text-right text-sm text-muted-foreground",
    render: (r) => [formatDate(r.showingDate), r.showingTime].filter(Boolean).join(" · "),
  },
];

export const APPLICATION_COLUMNS = [
  { key: "name", header: "Applicant", render: (r) => twoLine(r.name || "Applicant", r.unit) },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={APPLICATION_STATUS_MAP} /> },
  {
    key: "income",
    header: "Income",
    align: "right",
    className: "text-right tabular-nums",
    render: (r) => (r.monthlyIncome ? `${currency(r.monthlyIncome)}/mo` : "—"),
  },
  {
    key: "applied",
    header: "Applied",
    align: "right",
    className: "text-right text-sm text-muted-foreground",
    render: (r) => formatDate(r.appliedOn || r.createdAt),
  },
];

export const PROSPECT_COLUMNS = [
  { key: "name", header: "Prospect", render: (r) => twoLine(r.name || "Prospect", [r.email, r.phone].filter(Boolean).join(" · ")) },
  { key: "status", header: "Stage", render: (r) => <StatusPill status={r.status} map={PROSPECT_STATUS_MAP} /> },
  { key: "source", header: "Source", render: (r) => (r.source ? <Badge variant="neutral">{r.source}</Badge> : "—") },
  {
    key: "added",
    header: "Added",
    align: "right",
    className: "text-right text-sm text-muted-foreground",
    render: (r) => formatDate(r.createdAt),
  },
];

// Related sections reused by several editors.
export const ProspectShowingsSection = makeRelatedSection({
  load: (item) => listShowingsForProspect(item.id),
  columns: SHOWING_COLUMNS,
  tab: "Showings",
  plural: "Showings",
  emptyDescription: "Use Actions → Schedule showing to book a tour.",
});

export const ProspectApplicationsSection = makeRelatedSection({
  load: (item) => listApplicationsForProspect(item.id),
  columns: APPLICATION_COLUMNS,
  tab: "Applications",
  plural: "Applications",
  emptyDescription: "Use Actions → Convert to application when they're ready to apply.",
});

export const ListingProspectsSection = makeRelatedSection({
  load: (item) => listProspectsForListing(item.id),
  columns: PROSPECT_COLUMNS,
  tab: "Prospects",
  plural: "Prospects",
  emptyDescription: "Prospects who name this listing show up here.",
});

export const ListingShowingsSection = makeRelatedSection({
  load: (item) => listShowingsForListing(item.id),
  columns: SHOWING_COLUMNS,
  tab: "Showings",
  plural: "Showings",
  emptyDescription: "Showings booked for this listing show up here.",
});

export const ListingApplicationsSection = makeRelatedSection({
  load: (item) => listApplicationsForListing(item.id),
  columns: APPLICATION_COLUMNS,
  tab: "Applications",
  plural: "Applications",
  emptyDescription: "Applications for this listing show up here.",
});
