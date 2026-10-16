"use client";

import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  Sparkles,
  Clock,
  Scale,
  MapPin,
  BedDouble,
  Wallet,
  LineChart,
  FileText,
  StickyNote,
  CirclePlus,
  Archive,
  RotateCcw,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { DocumentsSection, ActivitySection } from "@/components/internal/screens/entity/shared_sections";
import { makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { rentCompsLayer } from "@/lib/supabase/rent_comps";
import { recordItemsLayer } from "@/lib/supabase/record_items";
import { listUnits } from "@/lib/supabase/units";
import { propertyOptions } from "@/lib/supabase/options";
import { ComparisonSection, CompTrendSummary, effectiveCompRent, perSqft } from "./sections/comp_sections";
import { KeyValues } from "./sections/common";
import { OWNER } from "./flows";
import {
  COMMUNITY_AMENITY_OPTIONS,
  COMP_STATUS_MAP,
  LAUNDRY_OPTIONS,
  LISTING_FEATURE_OPTIONS,
  PARKING_OPTIONS,
  UTILITY_OPTIONS,
  currency,
  filterOptions,
  formatDate,
  selectOptions,
  todayISO,
  toOptions,
} from "./shared";

// Rent Comparables — nearby market rents (owns `property.rent_comps`): location,
// unit, pricing net of concessions, amenities, rent observations over time, and a
// like-for-like comparison against your own units.

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

const signedCurrency = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${currency(Math.abs(n))}`;

const SOURCE_OPTIONS = toOptions(["Zillow", "Apartments.com", "Rent.com", "Craigslist", "Site visit", "Phone survey", "Broker", "Other"]);

const DETAILS_FIELDS = [
  { key: "name", label: "Comparable", type: "text", full: true, required: true },
  { key: "propertyId", label: "Compared to", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  { key: "source", label: "Source", type: "select", options: SOURCE_OPTIONS },
  { key: "observedDate", label: "Observed on", type: "date" },
  { key: "listingUrl", label: "Listing URL", type: "url", meta: true },
  { key: "contactName", label: "Leasing contact", type: "text", meta: true },
  { key: "contactPhone", label: "Contact phone", type: "phone", meta: true },
  { key: "status", label: "Status", type: "select", options: selectOptions(COMP_STATUS_MAP) },
];

const LOCATION_FIELDS = [
  { key: "address", label: "Address", type: "text", full: true },
  { key: "neighborhood", label: "Neighborhood", type: "text", meta: true },
  { key: "distanceMi", label: "Distance (mi)", type: "number", min: 0, step: 0.1 },
  { key: "propertyType", label: "Property type", type: "select", meta: true, options: toOptions(["Apartment", "House", "Townhome", "Condo", "Duplex"]) },
  { key: "yearBuilt", label: "Year built", type: "number", meta: true },
  { key: "totalUnits", label: "Units in building", type: "number", meta: true, min: 0 },
  { key: "classRating", label: "Class", type: "select", meta: true, options: toOptions(["A", "B", "C", "D"]) },
  { key: "occupancyPct", label: "Reported occupancy", type: "percent", meta: true },
];

const UNIT_FIELDS = [
  { key: "bedrooms", label: "Bedrooms", type: "number", min: 0 },
  { key: "bathrooms", label: "Bathrooms", type: "number", min: 0, step: 0.5 },
  { key: "sqft", label: "Square feet", type: "number", min: 0 },
  { key: "floor", label: "Floor", type: "text", meta: true },
  { key: "laundry", label: "Laundry", type: "select", meta: true, options: LAUNDRY_OPTIONS },
  { key: "parking", label: "Parking", type: "select", meta: true, options: PARKING_OPTIONS },
  { key: "furnished", label: "Furnished", type: "switch", meta: true },
  { key: "renovated", label: "Recently renovated", type: "switch", meta: true },
];

const PRICING_FIELDS = [
  { key: "rent", label: "Asking rent (monthly)", type: "currency" },
  { key: "deposit", label: "Deposit", type: "currency", meta: true },
  { key: "concessions", label: "Concessions", type: "text", meta: true, placeholder: "e.g. 6 weeks free" },
  { key: "concessionValue", label: "Concession value (monthly equivalent)", type: "currency", meta: true },
  { key: "effectiveRent", label: "Effective rent", type: "readonly", format: (_v, i) => (i.rent ? `${currency(effectiveCompRent(i))}/mo` : "—") },
  { key: "pricePerSqft", label: "Effective $/sqft", type: "readonly", format: (_v, i) => (perSqft(effectiveCompRent(i), i.sqft) ? `$${perSqft(effectiveCompRent(i), i.sqft).toFixed(2)}` : "—") },
  { key: "applicationFee", label: "Application fee", type: "currency", meta: true },
  { key: "petRent", label: "Pet rent", type: "currency", meta: true },
  { key: "parkingFee", label: "Parking fee", type: "currency", meta: true },
  { key: "utilitiesIncluded", label: "Utilities included", type: "multiselect", meta: true, options: UTILITY_OPTIONS },
];

const AMENITY_FIELDS = [
  { key: "features", label: "Unit features", type: "multiselect", meta: true, options: LISTING_FEATURE_OPTIONS },
  { key: "communityAmenities", label: "Community amenities", type: "multiselect", meta: true, options: COMMUNITY_AMENITY_OPTIONS },
  { key: "otherAmenities", label: "Other", type: "textarea", meta: true },
];

const OBSERVATION_FIELDS = [
  { key: "startsOn", label: "Observed on", type: "date", required: true },
  { key: "amount", label: "Asking rent", type: "currency", required: true },
  { key: "name", label: "Source", type: "select", options: SOURCE_OPTIONS },
  { key: "concessions", label: "Concessions", type: "text" },
  { key: "daysOnMarket", label: "Days on market", type: "number", min: 0 },
  { key: "observationNotes", label: "Notes", type: "textarea" },
];

function CompOverviewSection(props) {
  const { item } = props;
  const base = baselineFor(item);
  return (
    <div className="space-y-5">
      <KeyValues
        items={[
          { label: "Asking rent", value: item.rent ? `${currency(item.rent)}/mo` : "—" },
          { label: "Effective rent", value: item.rent ? `${currency(effectiveCompRent(item))}/mo` : "—" },
          { label: "Layout", value: `${Number(item.bedrooms) || 0} bd · ${Number(item.bathrooms) || 0} ba${item.sqft ? ` · ${item.sqft} sqft` : ""}` },
          { label: "$/sqft", value: perSqft(effectiveCompRent(item), item.sqft) ? `$${perSqft(effectiveCompRent(item), item.sqft).toFixed(2)}` : "—" },
          { label: "Vs. your avg rent", value: base && item.rent ? `${signedCurrency(effectiveCompRent(item) - base)} (yours ${currency(base)})` : "—" },
          { label: "Distance", value: item.distanceMi ? `${Number(item.distanceMi).toFixed(1)} mi` : "—" },
          { label: "Compared to", value: item.propertyName || "Whole portfolio" },
          { label: "Source", value: [item.source, formatDate(item.observedDate)].filter((x) => x && x !== "—").join(" · ") || "—" },
        ]}
      />
      <CompTrendSummary {...props} />
    </div>
  );
}

const rentCompsConfig = {
  key: OWNER.comp,
  singular: "Comparable",
  plural: "Comparables",
  title: "Rent Comparables",
  description:
    "Track nearby market rents and see how your units stack up — effective rent after concessions, price per square foot, and the gap to your own rents.",
  icon: Scale,
  titleField: "name",
  searchFields: ["name", "address", "propertyName", "source"],
  data: rentCompsLayer.data,
  rowsLoader: async () => {
    const [comps, units] = await Promise.all([rentCompsLayer.list(), listUnits()]);
    setOurRents(units);
    return comps ?? [];
  },

  statusMap: COMP_STATUS_MAP,
  statusFilterOptions: filterOptions(COMP_STATUS_MAP),

  views: [
    { value: "active", label: "Active", filter: (r) => r.status !== "Archived" },
    { value: "studio1", label: "Studio / 1 BR", filter: (r) => r.status !== "Archived" && (Number(r.bedrooms) || 0) <= 1 },
    { value: "two", label: "2 BR", filter: (r) => r.status !== "Archived" && Number(r.bedrooms) === 2 },
    { value: "three", label: "3+ BR", filter: (r) => r.status !== "Archived" && Number(r.bedrooms) >= 3 },
    { value: "all", label: "All", filter: () => true },
  ],

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
      header: "Effective rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => (r.rent ? currency(effectiveCompRent(r)) : "—"),
    },
    {
      key: "perSqft",
      header: "$/sqft",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => (perSqft(effectiveCompRent(r), r.sqft) ? `$${perSqft(effectiveCompRent(r), r.sqft).toFixed(2)}` : "—"),
    },
    {
      key: "gap",
      header: "vs. yours",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => {
        const base = baselineFor(r);
        return base && r.rent ? signedCurrency(effectiveCompRent(r) - base) : "—";
      },
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status !== "Archived");
    const rents = active.map(effectiveCompRent).filter((n) => n > 0);
    const compAvg = avg(rents);
    const sqftAvg = avg(active.map((r) => perSqft(effectiveCompRent(r), r.sqft)).filter(Boolean));
    const gap = compAvg && market.ourAvg ? ((market.ourAvg - compAvg) / compAvg) * 100 : null;
    return [
      { label: "Comparables", value: String(active.length), footer: `${rows.length - active.length} archived` },
      { label: "Avg effective rent", value: compAvg ? currency(compAvg) : "—", footer: "After concessions" },
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
    observedDate: todayISO(),
    status: "Active",
  }),

  headerMeta: (r) =>
    [r.rent ? `${currency(r.rent)}/mo` : null, r.propertyName ? `vs ${r.propertyName}` : null, r.source]
      .filter(Boolean)
      .join(" · "),

  actions: [
    {
      key: "observe",
      label: "Record new rent",
      icon: CirclePlus,
      wizard: {
        title: "Record a rent observation",
        description: "Logs the rent to this comparable's history and updates its current asking rent.",
        initial: (i) => ({ startsOn: todayISO(), amount: i.rent || "", name: i.source || "", concessions: i.metadata?.concessions || "" }),
        steps: [{ key: "obs", title: "Observation", fields: OBSERVATION_FIELDS }],
        finishLabel: "Record",
        logSummary: "Recorded a rent observation",
        finish: async (v, ctx) => {
          const row = await recordItemsLayer.create({
            id: crypto.randomUUID(),
            ownerType: OWNER.comp,
            ownerId: ctx.item.id,
            kind: "observation",
            name: v.name || "",
            startsOn: v.startsOn,
            amount: Number(v.amount) || 0,
            metadata: { concessions: v.concessions || "", daysOnMarket: v.daysOnMarket || "", observationNotes: v.observationNotes || "" },
          });
          if (!row) {
            toast.error("Couldn't record the observation.");
            return false;
          }
          const ok = await ctx.commit({ rent: Number(v.amount) || 0, observedDate: v.startsOn, ...(v.name ? { source: v.name } : {}) });
          if (ok && v.concessions !== undefined) await ctx.commitMeta({ concessions: v.concessions || "" });
          toast.success("Rent recorded.");
          return ok;
        },
      },
    },
    {
      key: "archive",
      label: "Archive",
      icon: Archive,
      separatorBefore: true,
      showIf: (i) => i.status !== "Archived",
      run: async (ctx) => {
        if (await ctx.commit({ status: "Archived" })) toast.success("Comparable archived.");
      },
    },
    {
      key: "restore",
      label: "Restore",
      icon: RotateCcw,
      showIf: (i) => i.status === "Archived",
      run: async (ctx) => {
        if (await ctx.commit({ status: "Active" })) toast.success("Comparable restored.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Rent, layout and how it compares." }],
    },
    {
      group: "Comparable",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "What it's compared to and where the data came from." },
        { key: "location", label: "Location & building", icon: MapPin, desc: "Address, distance and building facts." },
        { key: "unit", label: "Unit", icon: BedDouble, desc: "Layout and in-unit features." },
        { key: "pricing", label: "Pricing", icon: Wallet, desc: "Asking rent, concessions and fees." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "What's included at this comparable." },
      ],
    },
    {
      group: "Analysis",
      items: [
        { key: "comparison", label: "Vs. your units", icon: Scale, desc: "Like-for-like comparison with your own rents." },
        { key: "observations", label: "Rent history", icon: LineChart, desc: "Rent observed over time." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Screenshots, brochures and surveys." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Notes on this comparable." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes." },
      ],
    },
  ],
  sections: {
    overview: CompOverviewSection,
    details: makeFieldsSection(DETAILS_FIELDS),
    location: makeFieldsSection(LOCATION_FIELDS),
    unit: makeFieldsSection(UNIT_FIELDS),
    pricing: makeFieldsSection(PRICING_FIELDS),
    amenities: makeFieldsSection(AMENITY_FIELDS),
    comparison: ComparisonSection,
    observations: makeRecordItemsSection({
      kind: "observation",
      fields: OBSERVATION_FIELDS,
      singular: "Observation",
      plural: "Observations",
      icon: LineChart,
      defaults: (i) => ({ startsOn: todayISO(), amount: i.rent || "", name: i.source || "" }),
      emptyDescription: "Record the asking rent each time you check this comparable to build a trend.",
      summary: (o) => ({
        title: formatDate(o.startsOn),
        meta: [o.name, o.concessions, o.daysOnMarket ? `${o.daysOnMarket} days on market` : null].filter(Boolean).join(" · "),
        aside: o.amount ? `${currency(o.amount)}/mo` : null,
      }),
    }),
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "notes", placeholder: "Notes on this comparable…" }),
    activity: ActivitySection,
  },
};

export function RentComparablesScreen() {
  return <EntityListScreen config={rentCompsConfig} />;
}

export default RentComparablesScreen;
