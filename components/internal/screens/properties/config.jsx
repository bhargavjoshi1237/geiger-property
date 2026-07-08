import {
  Building2,
  LayoutDashboard,
  SquarePen,
  DoorOpen,
  Sparkles,
  Ruler,
  Image as ImageIcon,
  FileText,
  Clock,
  Settings,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { propertiesData } from "@/lib/supabase/properties";
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

// Per-area config for the Properties list + editor. Driven entirely by the
// reusable Entity engine — no Properties-specific engine code.

const STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Vacant: { label: "Vacant", variant: "info", dotClass: "bg-sky-400" },
  Maintenance: { label: "Maintenance", variant: "purple", dotClass: "bg-violet-300" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  "Off-market": { label: "Off-market", variant: "outline", dotClass: "bg-[#525252]" },
};

const TYPE_MAP = {
  "Single-family": { variant: "neutral" },
  "Multi-family": { variant: "info" },
  Apartment: { variant: "purple" },
  Condo: { variant: "neutral" },
  Commercial: { variant: "warning" },
};

const TYPE_OPTIONS = [
  { value: "Single-family", label: "Single-family" },
  { value: "Multi-family", label: "Multi-family" },
  { value: "Apartment", label: "Apartment" },
  { value: "Condo", label: "Condo" },
  { value: "Commercial", label: "Commercial" },
];

export const propertiesConfig = {
  key: "property",
  singular: "Property",
  plural: "Properties",
  title: "Properties",
  description:
    "Every building and unit set in your portfolio — active, vacant, and off-market. Search, filter, and open any property to manage it.",
  icon: Building2,
  titleField: "name",
  searchFields: ["name", "address", "city"],
  data: propertiesData,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Active", label: "Active" },
    { value: "Vacant", label: "Vacant" },
    { value: "Maintenance", label: "Maintenance" },
    { value: "Off-market", label: "Off-market" },
    { value: "Draft", label: "Draft" },
  ],

  columns: [
    {
      key: "name",
      header: "Property",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.address, r.city].filter(Boolean).join(", ")}
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
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge variant={TYPE_MAP[r.type]?.variant || "neutral"}>{r.type}</Badge>
      ),
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => (r.units ?? 0).toLocaleString(),
    },
  ],

  stats: (rows) => {
    const units = rows.reduce((s, r) => s + (Number(r.units) || 0), 0);
    const active = rows.filter((r) => r.status === "Active").length;
    const vacant = rows.filter((r) => r.status === "Vacant").length;
    return [
      { label: "Properties", value: String(rows.length), footer: `${active} active` },
      { label: "Units", value: units.toLocaleString(), footer: "Across the portfolio" },
      { label: "Active", value: String(active), footer: "Occupied & operating" },
      { label: "Vacant", value: String(vacant), footer: "Needs attention" },
    ];
  },

  createDraft: { name: "", type: "Multi-family", city: "", status: "Draft" },
  createFields: [
    { key: "name", label: "Property name", type: "text", placeholder: "e.g. Maple Court Apartments" },
    { key: "type", label: "Type", type: "select", options: TYPE_OPTIONS },
    { key: "city", label: "City", type: "text", placeholder: "e.g. Austin" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Draft", label: "Draft" },
        { value: "Active", label: "Active" },
        { value: "Vacant", label: "Vacant" },
      ],
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    address: "",
    city: draft.city || "",
    type: draft.type,
    units: 0,
    status: draft.status || "Draft",
  }),

  detailFields: [
    { key: "name", label: "Property name", type: "text", span: 2 },
    { key: "type", label: "Type", type: "select", options: TYPE_OPTIONS },
    { key: "portfolioId", label: "Portfolio", type: "entity", entity: "portfolio" },
    { key: "address", label: "Address", type: "text", span: 2 },
    { key: "city", label: "City", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "zip", label: "ZIP", type: "text" },
    { key: "yearBuilt", label: "Year built", type: "number" },
    { key: "description", label: "Description", type: "textarea", span: 2 },
  ],
  overviewStats: (item) => [
    { label: "Units", value: String(item.units ?? 0) },
    { label: "Type", value: item.type || "—" },
    { label: "City", value: item.city || "—" },
    { label: "Year built", value: item.yearBuilt ? String(item.yearBuilt) : "—" },
  ],

  headerMeta: (r) =>
    [r.type, [r.address, r.city].filter(Boolean).join(", "), `${r.units ?? 0} units`]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this property." }] },
    {
      group: "Property",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Core fields for this property." },
        { key: "units", label: "Units", icon: DoorOpen, desc: "Units that belong to this property." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "Amenities attached to this property." },
        { key: "floorplans", label: "Floor Plans", icon: Ruler, desc: "Floor plans linked to this property." },
        { key: "media", label: "Photos & Media", icon: ImageIcon, desc: "Photos and media for this property." },
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
    amenities: AmenitiesSection,
    floorplans: FloorPlansSection,
    media: MediaSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
  sectionProps: {
    units: { filterField: "propertyId" },
    floorplans: { mode: "multi" },
  },
};

export default propertiesConfig;
