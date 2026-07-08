import {
  DoorOpen,
  LayoutDashboard,
  SquarePen,
  KeyRound,
  Sparkles,
  Ruler,
  Image as ImageIcon,
  FileText,
  Clock,
  Settings,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { unitsData } from "@/lib/supabase/units";
import {
  OverviewSection,
  DetailsSection,
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  AmenitiesSection,
  MediaSection,
  FloorPlansSection,
} from "@/components/internal/screens/entity/shared_sections";

// Per-area config for the Units list + editor (row = one individual unit).

const STATUS_MAP = {
  Occupied: { label: "Occupied", variant: "success", dotClass: "bg-emerald-400" },
  Vacant: { label: "Vacant", variant: "info", dotClass: "bg-sky-400" },
  Notice: { label: "Notice", variant: "warning", dotClass: "bg-amber-400" },
  "Make-ready": { label: "Make-ready", variant: "purple", dotClass: "bg-violet-300" },
  Down: { label: "Down", variant: "outline", dotClass: "bg-red-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);

const specs = (u) =>
  [u.bedrooms ? `${u.bedrooms} bd` : null, u.bathrooms ? `${u.bathrooms} ba` : null, u.sqft ? `${u.sqft} sqft` : null]
    .filter(Boolean)
    .join(" · ");

const LEASE_FIELDS = [
  { key: "occupantName", label: "Occupant name", type: "text", span: 2 },
  { key: "leaseStart", label: "Lease start", type: "date" },
  { key: "leaseEnd", label: "Lease end", type: "date" },
];

export const unitsConfig = {
  key: "unit",
  singular: "Unit",
  plural: "Units",
  title: "Units",
  description:
    "Every individual unit across your portfolio — occupancy, rent, beds and baths. Open a unit to manage its lease, amenities, and floor plan.",
  icon: DoorOpen,
  titleField: "label",
  searchFields: ["label", "occupantName", "floor"],
  data: unitsData,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Occupied", label: "Occupied" },
    { value: "Vacant", label: "Vacant" },
    { value: "Notice", label: "Notice" },
    { value: "Make-ready", label: "Make-ready" },
    { value: "Down", label: "Down" },
    { value: "Draft", label: "Draft" },
  ],

  columns: [
    {
      key: "label",
      header: "Unit",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.label}</span>
          <span className="text-xs text-text-secondary">
            {r.occupantName || specs(r) || "—"}
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
      key: "specs",
      header: "Specs",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{specs(r) || "—"}</span>
      ),
    },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => currency(r.rent),
    },
  ],

  stats: (rows) => {
    const occupied = rows.filter((r) => r.status === "Occupied").length;
    const vacant = rows.filter((r) => r.status === "Vacant").length;
    const roll = rows.reduce((s, r) => s + (Number(r.rent) || 0), 0);
    return [
      { label: "Units", value: String(rows.length), footer: `${occupied} occupied` },
      { label: "Occupied", value: String(occupied), footer: "Currently leased" },
      { label: "Vacant", value: String(vacant), footer: "Available" },
      { label: "Rent roll", value: currency(roll), footer: "Monthly, all units" },
    ];
  },

  createDraft: { label: "", status: "Vacant" },
  createFields: [
    { key: "label", label: "Unit label", type: "text", placeholder: "e.g. 4B" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Vacant", label: "Vacant" },
        { value: "Occupied", label: "Occupied" },
        { value: "Make-ready", label: "Make-ready" },
        { value: "Draft", label: "Draft" },
      ],
    },
  ],
  newRow: (draft) => ({
    label: draft.label.trim(),
    status: draft.status || "Vacant",
    bedrooms: 0,
    bathrooms: 0,
    rent: 0,
  }),

  detailFields: [
    { key: "label", label: "Unit label", type: "text", span: 2 },
    { key: "propertyId", label: "Property", type: "entity", entity: "property" },
    { key: "buildingId", label: "Building", type: "entity", entity: "building" },
    { key: "unitTypeId", label: "Unit type", type: "entity", entity: "unittype" },
    { key: "floor", label: "Floor", type: "text" },
    { key: "bedrooms", label: "Bedrooms", type: "number" },
    { key: "bathrooms", label: "Bathrooms", type: "number" },
    { key: "sqft", label: "Square feet", type: "number" },
    { key: "rent", label: "Monthly rent", type: "number" },
    { key: "deposit", label: "Deposit", type: "number" },
  ],
  overviewStats: (item) => [
    { label: "Rent", value: currency(item.rent) },
    { label: "Beds", value: String(item.bedrooms ?? 0) },
    { label: "Baths", value: String(item.bathrooms ?? 0) },
    { label: "Sq ft", value: item.sqft ? String(item.sqft) : "—" },
  ],

  headerMeta: (r) => [specs(r), r.occupantName].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this unit." }] },
    {
      group: "Unit",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Core fields for this unit." },
        { key: "lease", label: "Lease & Occupancy", icon: KeyRound, desc: "Current occupant and lease dates." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "Amenities attached to this unit." },
        { key: "floorplan", label: "Floor Plan", icon: Ruler, desc: "The floor plan for this unit." },
        { key: "media", label: "Photos & Media", icon: ImageIcon, desc: "Photos and media for this unit." },
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
    lease: DetailsSection,
    amenities: AmenitiesSection,
    floorplan: FloorPlansSection,
    media: MediaSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
  sectionProps: {
    lease: { fields: LEASE_FIELDS },
    floorplan: { mode: "single" },
  },
};

export default unitsConfig;
