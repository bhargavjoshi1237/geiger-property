import {
  ClipboardCheck,
  Clock,
  DoorOpen,
  FileText,
  Gauge,
  HardHat,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LayoutDashboard,
  Ruler,
  Settings,
  ShieldCheck,
  Sparkles,
  SquarePen,
  StickyNote,
  Tags,
  Warehouse,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { buildingsData } from "@/lib/supabase/buildings";
import {
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  AmenitiesSection,
  MediaSection,
  FloorPlansSection,
} from "@/components/internal/screens/entity/shared_sections";
import { makeCustomFieldsSection } from "@/components/internal/screens/entity/sections/factories";
import {
  BUILDING_STATUS_MAP,
  STRUCTURE_OPTIONS,
  currency,
  pct,
} from "@/components/internal/screens/properties/constants";
import { loadBuildingRows, loadPropertyOptions } from "@/components/internal/screens/properties/joins";
import { lifecycleActions, makeAddUnitsAction } from "@/components/internal/screens/properties/actions";
import {
  AssetsSection,
  ComplianceSection,
  FloorsSection,
  InsuranceSection,
  KeysSection,
  MetersSection,
} from "@/components/internal/screens/properties/record_kinds";
import { BuildingUnitsSection } from "@/components/internal/screens/properties/sections/related";
import { makeInternalNotesSection } from "@/components/internal/screens/properties/sections/form_cards";
import { OccupancyBar } from "@/components/internal/screens/properties/sections/overview_parts";
import { BuildingConstructionSection, BuildingDetailsSection, BuildingOverviewSection } from "./sections";

// Per-area config for Buildings & Blocks (row = a structure within a property).

const addUnits = makeAddUnitsAction({ scope: "building" });

export const buildingsConfig = {
  key: "building",
  singular: "Building",
  plural: "Buildings",
  title: "Buildings",
  description:
    "Physical buildings and blocks within your properties. Open a building to manage its floors, units, systems, keys, meters and inspections.",
  icon: Warehouse,
  titleField: "name",
  searchFields: ["name", "blockCode", "wing", "propertyName", "structureType"],
  data: buildingsData,
  rowsLoader: loadBuildingRows,

  statusMap: BUILDING_STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    ...Object.keys(BUILDING_STATUS_MAP).map((k) => ({ value: k, label: k })),
  ],

  columns: [
    {
      key: "name",
      header: "Building",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.propertyName, r.blockCode && `Block ${r.blockCode}`].filter(Boolean).join(" · ") || "Not linked to a property"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={BUILDING_STATUS_MAP} />,
    },
    {
      key: "structureType",
      header: "Structure",
      render: (r) => <span className="text-sm text-muted-foreground">{r.structureType || "—"}</span>,
    },
    {
      key: "floors",
      header: "Floors",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => r.floors ?? 1,
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground dark:text-white",
      render: (r) => r.unitCount ?? 0,
    },
    {
      key: "occupancy",
      header: "Occupancy",
      render: (r) => (r.unitCount ? <OccupancyBar value={r.occupancy} /> : <span className="text-sm text-text-tertiary">—</span>),
    },
  ],

  stats: (rows) => {
    const live = rows.filter((r) => r.status !== "Archived");
    const units = live.reduce((s, r) => s + (Number(r.unitCount) || 0), 0);
    const occupied = live.reduce((s, r) => s + ((Number(r.occupancy) || 0) / 100) * (Number(r.unitCount) || 0), 0);
    const floors = live.reduce((s, r) => s + (Number(r.floors) || 0), 0);
    const building = live.filter((r) => r.status === "Under construction").length;
    return [
      { label: "Buildings", value: String(live.length), footer: `${building} under construction` },
      { label: "Floors", value: String(floors), footer: "Across all buildings" },
      { label: "Units", value: units.toLocaleString(), footer: currency(live.reduce((s, r) => s + (Number(r.rentRoll) || 0), 0)) + "/mo rent roll" },
      { label: "Occupancy", value: pct(units ? (occupied / units) * 100 : 0), footer: "Units in buildings" },
    ];
  },

  createDraft: { name: "", blockCode: "", propertyId: "", structureType: "", status: "Active" },
  createFields: [
    { key: "name", label: "Building name", type: "text", placeholder: "e.g. Tower One" },
    { key: "propertyId", label: "Property", type: "select", optionsFrom: "properties", emptyLabel: "No properties yet" },
    { key: "blockCode", label: "Block code", type: "text", placeholder: "e.g. A" },
    { key: "structureType", label: "Structure", type: "select", options: STRUCTURE_OPTIONS },
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
  loadCreateOptions: async () => ({ properties: await loadPropertyOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    blockCode: draft.blockCode || "",
    propertyId: draft.propertyId || null,
    propertyName: draft.propertyName || "",
    structureType: draft.structureType || "",
    status: draft.status || "Active",
    floors: 1,
  }),

  headerMeta: (r) =>
    [r.propertyName, r.blockCode && `Block ${r.blockCode}`, r.structureType, `${r.floors ?? 1} floors`, r.unitCount ? `${r.unitCount} units` : null]
      .filter(Boolean)
      .join(" · "),

  actions: (item) => [
    addUnits(item),
    {
      key: "underConstruction",
      label: "Mark under construction",
      icon: HardHat,
      showIf: (i) => !["Under construction", "Archived"].includes(i.status),
      run: async (ctx) => {
        if (await ctx.commit({ status: "Under construction" })) toast.success("Building marked under construction.");
      },
    },
    ...lifecycleActions({ singular: "Building" }),
  ],

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Units, occupancy and follow-ups for this building." }] },
    {
      group: "Building",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Identity, location and size." },
        { key: "construction", label: "Construction & Systems", icon: Wrench, desc: "Structure and building systems." },
        { key: "floors", label: "Floors", icon: Layers, desc: "Each level's use, units and area." },
        { key: "units", label: "Units", icon: DoorOpen, desc: "Units in this building." },
        { key: "floorplans", label: "Floor Plans", icon: Ruler, desc: "Floor plans linked to this building." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "Amenities attached to this building." },
        { key: "media", label: "Photos & Media", icon: ImageIcon, desc: "Photos and media for this building." },
      ],
    },
    {
      group: "Operations",
      items: [
        { key: "assets", label: "Systems & Assets", icon: HardHat, desc: "Equipment, warranties and service schedules." },
        { key: "keys", label: "Keys & Access", icon: KeyRound, desc: "Keys, fobs and codes." },
        { key: "meters", label: "Meters & Utilities", icon: Gauge, desc: "Utility meters and who pays." },
      ],
    },
    {
      group: "Risk & compliance",
      items: [
        { key: "compliance", label: "Inspections & Compliance", icon: ClipboardCheck, desc: "Elevator, fire, boiler and other inspections." },
        { key: "insurance", label: "Insurance", icon: ShieldCheck, desc: "Building-specific policies." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Files and paperwork." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes for your team." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and note on this building." },
        { key: "custom", label: "Custom Fields", icon: Tags, desc: "Fields defined in Settings → Custom Fields." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and danger zone." },
      ],
    },
  ],
  sections: {
    overview: BuildingOverviewSection,
    details: BuildingDetailsSection,
    construction: BuildingConstructionSection,
    floors: FloorsSection,
    units: BuildingUnitsSection,
    floorplans: FloorPlansSection,
    amenities: AmenitiesSection,
    media: MediaSection,
    assets: AssetsSection,
    keys: KeysSection,
    meters: MetersSection,
    compliance: ComplianceSection,
    insurance: InsuranceSection,
    documents: DocumentsSection,
    notes: makeInternalNotesSection(),
    activity: ActivitySection,
    custom: makeCustomFieldsSection("buildings"),
    settings: SettingsSection,
  },
  sectionProps: {
    floorplans: { mode: "multi" },
  },
};

export default buildingsConfig;
