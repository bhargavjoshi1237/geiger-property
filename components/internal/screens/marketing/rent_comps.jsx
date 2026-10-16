"use client";

import { LayoutDashboard, SquarePen, Sparkles, Clock, Scale } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { rentCompsLayer } from "@/lib/supabase/rent_comps";
import { listUnits } from "@/lib/supabase/units";
import { propertyOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  COMP_STATUS_MAP,
  currency,
  filterOptions,
  formatDate,
  selectOptions,
} from "./shared";

// Rent Comparables — nearby market rents (owns `property.rent_comps`), compared
// against your own units' average rent (overall and by bedroom count).

// Your portfolio's rents, refreshed by rowsLoader on every fetch.
const market = { ourAvg: 0, byBeds: new Map() };

const avg = (list) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : 0);

function setOurRents(units) {
  const priced = (units ?? []).filter((u) => Number(u.rent) > 0);
  const groups = new Map();
  for (const u of priced) {
    const beds = Number(u.bedrooms) || 0;
    groups.set(beds, [...(groups.get(beds) || []), Number(u.rent)]);
  }
  market.ourAvg = avg(priced.map((u) => Number(u.rent)));
  market.byBeds = new Map([...groups].map(([beds, rents]) => [beds, avg(rents)]));
}

// Like-for-like baseline: your average rent for the same bedroom count, else overall.
const baselineFor = (r) => market.byBeds.get(Number(r.bedrooms) || 0) || market.ourAvg;

const perSqft = (r) => (Number(r.sqft) > 0 && Number(r.rent) > 0 ? Number(r.rent) / Number(r.sqft) : 0);

const signedCurrency = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${currency(Math.abs(n))}`;

const rentCompsConfig = {
  key: "comp",
  singular: "Comparable",
  plural: "Comparables",
  title: "Rent Comparables",
  description:
    "Track nearby market rents and see how your units stack up — average comp rent, price per square foot, and the gap to your own rents.",
  icon: Scale,
  titleField: "name",
  searchFields: ["name", "propertyName", "source"],
  data: rentCompsLayer.data,
  rowsLoader: async () => {
    const [comps, units] = await Promise.all([rentCompsLayer.list(), listUnits()]);
    setOurRents(units);
    return comps ?? [];
  },

  statusMap: COMP_STATUS_MAP,
  statusFilterOptions: filterOptions(COMP_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Comparable",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[
              r.distanceMi ? `${Number(r.distanceMi).toFixed(1)} mi` : null,
              r.propertyName ? `vs ${r.propertyName}` : null,
              r.source,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={COMP_STATUS_MAP} />,
    },
    {
      key: "layout",
      header: "Layout",
      className: "text-sm text-text-secondary",
      render: (r) =>
        [`${Number(r.bedrooms) || 0} bd · ${Number(r.bathrooms) || 0} ba`, r.sqft ? `${r.sqft} sqft` : null]
          .filter(Boolean)
          .join(" · "),
    },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => (r.rent ? currency(r.rent) : "—"),
    },
    {
      key: "perSqft",
      header: "$/sqft",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => (perSqft(r) ? `$${perSqft(r).toFixed(2)}` : "—"),
    },
    {
      key: "gap",
      header: "vs. yours",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => {
        const base = baselineFor(r);
        return base && r.rent ? signedCurrency(Number(r.rent) - base) : "—";
      },
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status !== "Archived");
    const rents = active.map((r) => Number(r.rent)).filter((n) => n > 0);
    const compAvg = avg(rents);
    const sqftAvg = avg(active.map(perSqft).filter(Boolean));
    const gap = compAvg && market.ourAvg ? ((market.ourAvg - compAvg) / compAvg) * 100 : null;
    return [
      { label: "Comparables", value: String(active.length), footer: `${rows.length - active.length} archived` },
      { label: "Avg comp rent", value: compAvg ? currency(compAvg) : "—", footer: "Active comparables" },
      { label: "Avg $/sqft", value: sqftAvg ? `$${sqftAvg.toFixed(2)}` : "—", footer: "Where sqft is known" },
      {
        label: "Your avg rent",
        value: market.ourAvg ? currency(market.ourAvg) : "—",
        footer:
          gap === null
            ? "Across your priced units"
            : `${Math.abs(gap).toFixed(1)}% ${gap < 0 ? "below" : "above"} market`,
      },
    ];
  },

  createDraft: { name: "", propertyId: "", rent: "", bedrooms: "", sqft: "" },
  createFields: [
    { key: "name", label: "Comparable", type: "text", placeholder: "e.g. The Linden · 2BR" },
    {
      key: "propertyId",
      label: "Compared to",
      type: "select",
      optionsFrom: "properties",
      placeholder: "Select your property…",
      emptyLabel: "No properties yet",
    },
    { key: "rent", label: "Monthly rent", type: "number", placeholder: "e.g. 1850" },
    { key: "bedrooms", label: "Bedrooms", type: "number", placeholder: "e.g. 2" },
    { key: "sqft", label: "Square feet", type: "number", placeholder: "e.g. 900" },
  ],
  loadCreateOptions: async () => ({ properties: await propertyOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    rent: Number(draft.rent) || 0,
    bedrooms: Number(draft.bedrooms) || 0,
    sqft: Number(draft.sqft) || 0,
    status: "Active",
  }),

  headerMeta: (r) =>
    [r.rent ? `${currency(r.rent)}/mo` : null, r.propertyName ? `vs ${r.propertyName}` : null, r.source]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this comparable." },
      ],
    },
    {
      group: "Comparable",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Rent, layout, and where it came from." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "What's included at this comparable." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Notes on this comparable." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "rent", label: "Rent", format: (v) => (v ? `${currency(v)}/mo` : "—") },
        { key: "sqft", label: "Price per sqft", format: (v, item) => (perSqft(item) ? `$${perSqft(item).toFixed(2)}` : "—") },
        {
          key: "bedrooms",
          label: "Layout",
          format: (v, item) => `${Number(v) || 0} bd · ${Number(item.bathrooms) || 0} ba${item.sqft ? ` · ${item.sqft} sqft` : ""}`,
        },
        {
          key: "propertyName",
          label: "Vs. your avg rent",
          format: (v, item) => {
            const base = baselineFor(item);
            return base && item.rent ? `${signedCurrency(Number(item.rent) - base)} (yours ${currency(base)})` : "—";
          },
        },
        { key: "distanceMi", label: "Distance", format: (v) => (v ? `${Number(v).toFixed(1)} mi` : "—") },
        { key: "source", label: "Source" },
        { key: "observedDate", label: "Observed", format: (v) => formatDate(v) },
        { key: "status", label: "Status" },
      ],
      note: "Your average rent is compared like-for-like by bedroom count when you have units with the same layout.",
    }),
    details: makeFieldsSection([
      { key: "name", label: "Comparable", type: "text", full: true },
      { key: "propertyId", label: "Compared to", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "address", label: "Address", type: "text", meta: true },
      { key: "rent", label: "Monthly rent", type: "number" },
      { key: "sqft", label: "Square feet", type: "number" },
      { key: "bedrooms", label: "Bedrooms", type: "number" },
      { key: "bathrooms", label: "Bathrooms", type: "number" },
      { key: "distanceMi", label: "Distance (mi)", type: "number" },
      { key: "source", label: "Source", type: "text", placeholder: "e.g. Zillow, site visit" },
      { key: "observedDate", label: "Observed on", type: "date" },
      { key: "status", label: "Status", type: "select", options: selectOptions(COMP_STATUS_MAP) },
    ]),
    amenities: makeMetaListSection({
      field: "amenities",
      singular: "feature",
      icon: Sparkles,
      primaryPlaceholder: "e.g. In-unit laundry",
    }),
    activity: makeNotesSection({ field: "notes", placeholder: "Notes on this comparable…" }),
  },
};

export function RentComparablesScreen() {
  return <EntityListScreen config={rentCompsConfig} />;
}

export default RentComparablesScreen;
