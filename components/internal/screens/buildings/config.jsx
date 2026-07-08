import {
  Warehouse,
  LayoutDashboard,
  SquarePen,
  DoorOpen,
  Ruler,
  Sparkles,
  Image as ImageIcon,
  FileText,
  Clock,
  Settings,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { buildingsData } from "@/lib/supabase/buildings";
import {
  OverviewSection,
  DetailsSection,
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  AmenitiesSection,
  MediaSection,
  FloorPlansSection,
  RelatedUnitsSection,
} from "@/components/internal/screens/entity/shared_sections";

// Per-area config for Buildings & Blocks (row = a structure within a property).

const STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  "Under construction": { label: "Under construction", variant: "warning", dotClass: "bg-amber-400" },
  Inactive: { label: "Inactive", variant: "outline", dotClass: "bg-[#525252]" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

const STRUCTURE_OPTIONS = [
  { value: "Low-rise", label: "Low-rise" },
  { value: "Mid-rise", label: "Mid-rise" },
  { value: "High-rise", label: "High-rise" },
  { value: "Townhome", label: "Townhome" },
  { value: "Garden", label: "Garden" },
];

export const buildingsConfig = {
  key: "building",
  singular: "Building",
  plural: "Buildings",
  title: "Buildings & Blocks",
  description:
    "Physical buildings and blocks within your properties. Open a building to manage its units, floor plans, and amenities.",
  icon: Warehouse,
  titleField: "name",
  searchFields: ["name", "blockCode", "wing"],
  data: buildingsData,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Active", label: "Active" },
    { value: "Under construction", label: "Under construction" },
    { value: "Inactive", label: "Inactive" },
    { value: "Draft", label: "Draft" },
  ],

  columns: [
    {
      key: "name",
      header: "Building",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.blockCode && `Block ${r.blockCode}`, r.structureType].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
    },
    {
      key: "structureType",
      header: "Structure",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.structureType || "—"}</span>
      ),
    },
    {
      key: "floors",
      header: "Floors",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => r.floors ?? 1,
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const building = rows.filter((r) => r.status === "Under construction").length;
    const floors = rows.reduce((s, r) => s + (Number(r.floors) || 0), 0);
    return [
      { label: "Buildings", value: String(rows.length), footer: `${active} active` },
      { label: "Active", value: String(active), footer: "In service" },
      { label: "Floors", value: String(floors), footer: "Across all buildings" },
      { label: "Building", value: String(building), footer: "Under construction" },
    ];
  },

  createDraft: { name: "", blockCode: "", status: "Active" },
  createFields: [
    { key: "name", label: "Building name", type: "text", placeholder: "e.g. Tower One" },
    { key: "blockCode", label: "Block code", type: "text", placeholder: "e.g. A" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Active", label: "Active" },
        { value: "Under construction", label: "Under construction" },
        { value: "Draft", label: "Draft" },
      ],
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    blockCode: draft.blockCode || "",
    status: draft.status || "Active",
    floors: 1,
  }),

  detailFields: [
    { key: "name", label: "Building name", type: "text", span: 2 },
    { key: "blockCode", label: "Block code", type: "text" },
    { key: "propertyId", label: "Property", type: "entity", entity: "property" },
    { key: "floors", label: "Floors", type: "number" },
    { key: "yearBuilt", label: "Year built", type: "number" },
    { key: "structureType", label: "Structure type", type: "select", options: STRUCTURE_OPTIONS },
    { key: "wing", label: "Wing / section", type: "text" },
    { key: "description", label: "Description", type: "textarea", span: 2 },
  ],
  overviewStats: (item) => [
    { label: "Floors", value: String(item.floors ?? 1) },
    { label: "Year built", value: item.yearBuilt ? String(item.yearBuilt) : "—" },
    { label: "Structure", value: item.structureType || "—" },
    { label: "Block", value: item.blockCode || "—" },
  ],

  headerMeta: (r) =>
    [r.blockCode && `Block ${r.blockCode}`, r.structureType, `${r.floors ?? 1} floors`]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this building." }] },
    {
      group: "Building",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Core fields for this building." },
        { key: "units", label: "Units", icon: DoorOpen, desc: "Units in this building." },
        { key: "floorplans", label: "Floor Plans", icon: Ruler, desc: "Floor plans linked to this building." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "Amenities attached to this building." },
        { key: "media", label: "Photos & Media", icon: ImageIcon, desc: "Photos and media for this building." },
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
    units: RelatedUnitsSection,
    floorplans: FloorPlansSection,
    amenities: AmenitiesSection,
    media: MediaSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
  sectionProps: {
    units: { filterField: "buildingId" },
    floorplans: { mode: "multi" },
  },
};

export default buildingsConfig;
