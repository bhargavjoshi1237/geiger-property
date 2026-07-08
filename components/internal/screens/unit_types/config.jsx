import {
  BedDouble,
  LayoutDashboard,
  SquarePen,
  Sparkles,
  DoorOpen,
  FileText,
  Clock,
  Settings,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { unitTypesData } from "@/lib/supabase/unit_types";
import {
  OverviewSection,
  DetailsSection,
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  AmenitiesSection,
  RelatedUnitsSection,
} from "@/components/internal/screens/entity/shared_sections";

// Per-area config for Unit Types (row = a reusable unit template).

const STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Inactive: { label: "Inactive", variant: "outline", dotClass: "bg-[#525252]" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);

const specs = (t) =>
  [t.bedrooms ? `${t.bedrooms} bd` : null, t.bathrooms ? `${t.bathrooms} ba` : null, t.sqft ? `${t.sqft} sqft` : null]
    .filter(Boolean)
    .join(" · ");

export const unitTypesConfig = {
  key: "unittype",
  singular: "Unit Type",
  plural: "Unit Types",
  title: "Unit Types",
  description:
    "Reusable unit templates — beds, baths, market rent, and deposit. Assign a type to units to keep pricing and specs consistent.",
  icon: BedDouble,
  titleField: "name",
  searchFields: ["name"],
  data: unitTypesData,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Active", label: "Active" },
    { value: "Inactive", label: "Inactive" },
    { value: "Draft", label: "Draft" },
  ],

  columns: [
    {
      key: "name",
      header: "Unit type",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{specs(r) || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
    },
    {
      key: "specs",
      header: "Layout",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {[r.bedrooms ? `${r.bedrooms} bd` : null, r.bathrooms ? `${r.bathrooms} ba` : null].filter(Boolean).join(" / ") || "—"}
        </span>
      ),
    },
    {
      key: "marketRent",
      header: "Market rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => currency(r.marketRent),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const inactive = rows.filter((r) => r.status === "Inactive").length;
    const withRent = rows.filter((r) => Number(r.marketRent) > 0);
    const avg = withRent.length
      ? Math.round(withRent.reduce((s, r) => s + Number(r.marketRent), 0) / withRent.length)
      : 0;
    return [
      { label: "Unit types", value: String(rows.length), footer: `${active} active` },
      { label: "Active", value: String(active), footer: "In use" },
      { label: "Avg rent", value: currency(avg), footer: "Across types" },
      { label: "Inactive", value: String(inactive), footer: "Retired" },
    ];
  },

  createDraft: { name: "", status: "Active" },
  createFields: [
    { key: "name", label: "Unit type name", type: "text", placeholder: "e.g. 1BR / 1BA Standard" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Active", label: "Active" },
        { value: "Draft", label: "Draft" },
      ],
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    status: draft.status || "Active",
    bedrooms: 0,
    bathrooms: 0,
    marketRent: 0,
  }),

  detailFields: [
    { key: "name", label: "Unit type name", type: "text", span: 2 },
    { key: "bedrooms", label: "Bedrooms", type: "number" },
    { key: "bathrooms", label: "Bathrooms", type: "number" },
    { key: "sqft", label: "Typical sq ft", type: "number" },
    { key: "marketRent", label: "Market rent", type: "number" },
    { key: "deposit", label: "Deposit", type: "number" },
    { key: "floorPlanId", label: "Default floor plan", type: "entity", entity: "floorplan" },
    { key: "description", label: "Description", type: "textarea", span: 2 },
  ],
  overviewStats: (item) => [
    { label: "Market rent", value: currency(item.marketRent) },
    { label: "Beds", value: String(item.bedrooms ?? 0) },
    { label: "Baths", value: String(item.bathrooms ?? 0) },
    { label: "Sq ft", value: item.sqft ? String(item.sqft) : "—" },
  ],

  headerMeta: (r) => [specs(r), currency(r.marketRent)].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this unit type." }] },
    {
      group: "Unit Type",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Core fields for this unit type." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "Default amenities for this type." },
        { key: "units", label: "Units", icon: DoorOpen, desc: "Units of this type." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Files and paperwork." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Recent changes and notes." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: OverviewSection,
    details: DetailsSection,
    amenities: AmenitiesSection,
    units: RelatedUnitsSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
  sectionProps: {
    units: { filterField: "unitTypeId" },
  },
};

export default unitTypesConfig;
