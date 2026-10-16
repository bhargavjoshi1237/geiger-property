"use client";

import {
  LayoutDashboard,
  SquarePen,
  AlignLeft,
  ImagePlus,
  Share2,
  Tag,
  Clock,
  Megaphone,
  Info,
} from "lucide-react";

import {
  SectionCard,
  SettingsList,
  SettingRow,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { listingsLayer } from "@/lib/supabase/listings";
import { listUnits } from "@/lib/supabase/units";
import { propertyOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
  makeUploadSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  LISTING_STATUS_MAP,
  SYNDICATION_CHANNELS,
  currency,
  filterOptions,
  formatDate,
  selectOptions,
} from "./shared";

// Listings — vacancy marketing listings (owns `property.listings`). Details,
// description, photos, syndication tracking, and promotions.

// Unit options for the create dialog, with the unit's rent and layout prefilled.
async function listingUnitOptions() {
  const [options, units] = await Promise.all([unitOptions(), listUnits()]);
  const byId = new Map((units ?? []).map((u) => [u.id, u]));
  return options.map((o) => {
    const u = byId.get(o.value);
    return {
      ...o,
      patch: {
        ...o.patch,
        rent: u?.rent || 0,
        bedrooms: u?.bedrooms || 0,
        bathrooms: u?.bathrooms || 0,
      },
    };
  });
}

// Channel checklist stored as metadata.syndication = { [channel]: true }.
function SyndicationSection({ item, onCommit }) {
  const state = item?.metadata?.syndication || {};
  const toggle = (channel, on) =>
    onCommit({
      metadata: { ...(item?.metadata || {}), syndication: { ...state, [channel]: on } },
    });
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p>
          Syndication is tracked here — publishing to listing sites isn&apos;t connected
          yet. Mark the channels where you&apos;ve posted this listing manually.
        </p>
      </div>
      <SectionCard>
        <SettingsList>
          {SYNDICATION_CHANNELS.map((channel) => (
            <SettingRow
              key={channel}
              title={channel}
              description={state[channel] ? "Posted" : "Not posted"}
              checked={Boolean(state[channel])}
              onCheckedChange={(on) => toggle(channel, on)}
            />
          ))}
        </SettingsList>
      </SectionCard>
    </div>
  );
}

const listingsConfig = {
  key: "listing",
  singular: "Listing",
  plural: "Listings",
  title: "Listings",
  description:
    "Market your vacant units. Set asking rent and availability, add photos and a description, and track where each listing is posted.",
  icon: Megaphone,
  titleField: "name",
  searchFields: ["name", "unit", "propertyName"],
  data: listingsLayer.data,

  statusMap: LISTING_STATUS_MAP,
  statusFilterOptions: filterOptions(LISTING_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "active", label: "Active", filter: (r) => r.status === "Active" },
    { value: "draft", label: "Draft", filter: (r) => r.status === "Draft" },
  ],

  columns: [
    {
      key: "name",
      header: "Listing",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.unit || "No unit linked"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={LISTING_STATUS_MAP} />,
    },
    {
      key: "rent",
      header: "Asking rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => (r.rent ? `${currency(r.rent)}/mo` : "—"),
    },
    {
      key: "availableDate",
      header: "Available",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.availableDate),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active");
    const priced = active.filter((r) => Number(r.rent) > 0);
    const avg = priced.length
      ? priced.reduce((s, r) => s + Number(r.rent), 0) / priced.length
      : 0;
    return [
      { label: "Listings", value: String(rows.length), footer: `${active.length} active` },
      {
        label: "Drafts",
        value: String(rows.filter((r) => r.status === "Draft").length),
        footer: "Not yet live",
      },
      { label: "Avg asking rent", value: avg ? currency(avg) : "—", footer: "Across active listings" },
      {
        label: "Leased",
        value: String(rows.filter((r) => r.status === "Leased").length),
        footer: "Filled from a listing",
      },
    ];
  },

  createDraft: { name: "", unitId: "" },
  createFields: [
    { key: "name", label: "Listing title", type: "text", placeholder: "e.g. Sunny 2BR at Maple Court" },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet",
    },
  ],
  loadCreateOptions: async () => ({ units: await listingUnitOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    rent: Number(draft.rent) || 0,
    bedrooms: Number(draft.bedrooms) || 0,
    bathrooms: Number(draft.bathrooms) || 0,
    status: "Draft",
  }),

  headerMeta: (r) =>
    [r.unit || r.propertyName, r.rent ? `${currency(r.rent)}/mo` : null].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this listing." },
      ],
    },
    {
      group: "Listing",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Unit, rent, and availability." },
        { key: "description", label: "Description", icon: AlignLeft, desc: "The marketing copy for this listing." },
        { key: "photos", label: "Photos", icon: ImagePlus, desc: "Photos shown with this listing." },
      ],
    },
    {
      group: "Marketing",
      items: [
        { key: "syndication", label: "Syndication", icon: Share2, desc: "Where this listing is posted." },
        { key: "promotions", label: "Promotions", icon: Tag, desc: "Move-in specials and concessions." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Notes and activity on this listing." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "unit", label: "Unit" },
        { key: "propertyName", label: "Property" },
        { key: "status", label: "Status" },
        { key: "rent", label: "Asking rent", format: (v) => (v ? `${currency(v)}/mo` : "—") },
        { key: "availableDate", label: "Available", format: (v) => formatDate(v) },
        {
          key: "bedrooms",
          label: "Layout",
          format: (v, item) => `${Number(v) || 0} bd · ${Number(item.bathrooms) || 0} ba`,
        },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Listing title", type: "text", full: true },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "rent", label: "Asking rent (monthly)", type: "number" },
      { key: "availableDate", label: "Available date", type: "date" },
      { key: "bedrooms", label: "Bedrooms", type: "number" },
      { key: "bathrooms", label: "Bathrooms", type: "number" },
      { key: "status", label: "Status", type: "select", options: selectOptions(LISTING_STATUS_MAP) },
    ]),
    description: makeNotesSection({
      field: "description",
      placeholder: "Describe the unit — layout, finishes, amenities, neighborhood…",
    }),
    photos: makeUploadSection({ field: "photos", ownerType: "listing", singular: "photo" }),
    syndication: SyndicationSection,
    promotions: makeMetaListSection({
      field: "promotions",
      singular: "promotion",
      icon: Tag,
      primaryPlaceholder: "e.g. Move-in special",
      secondary: { key: "value", label: "Value", placeholder: "e.g. 1 month free" },
    }),
    activity: makeNotesSection({ field: "notes", placeholder: "Notes and activity on this listing…" }),
  },
};

export function ListingsScreen() {
  return <EntityListScreen config={listingsConfig} />;
}

export default ListingsScreen;
