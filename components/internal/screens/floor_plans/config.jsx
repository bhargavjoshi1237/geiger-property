import {
  Ruler,
  LayoutDashboard,
  SquarePen,
  ImagePlus,
  Link2,
  FileText,
  Clock,
  Settings,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { floorPlansData } from "@/lib/supabase/floor_plans";
import {
  OverviewSection,
  DetailsSection,
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  PlanFileSection,
  FloorPlanLinkedSection,
} from "@/components/internal/screens/entity/shared_sections";

// Per-area config for Floor Plans (row = a reusable plan with an uploaded drawing).

const STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-[#525252]" },
};

const specs = (p) =>
  [p.bedrooms ? `${p.bedrooms} bd` : null, p.bathrooms ? `${p.bathrooms} ba` : null, p.sqft ? `${p.sqft} sqft` : null]
    .filter(Boolean)
    .join(" · ");

export const floorPlansConfig = {
  key: "floorplan",
  singular: "Floor Plan",
  plural: "Floor Plans",
  title: "Floor Plans",
  description:
    "Reusable floor plans you can link to units and properties. Upload a drawing, set its specs, and see everywhere it's used.",
  icon: Ruler,
  titleField: "name",
  searchFields: ["name", "dimensions"],
  data: floorPlansData,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Active", label: "Active" },
    { value: "Draft", label: "Draft" },
    { value: "Archived", label: "Archived" },
  ],

  columns: [
    {
      key: "name",
      header: "Floor plan",
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={r.imageUrl}
              alt=""
              className="h-9 w-12 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card text-text-tertiary">
              <Ruler className="h-4 w-4" />
            </span>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{r.name}</span>
            <span className="text-xs text-text-secondary">{specs(r) || "—"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
    },
    {
      key: "dimensions",
      header: "Dimensions",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.dimensions || "—"}</span>
      ),
    },
    {
      key: "sqft",
      header: "Sq ft",
      align: "right",
      className: "text-right font-semibold tabular-nums text-white",
      render: (r) => (r.sqft ? r.sqft.toLocaleString() : "—"),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const archived = rows.filter((r) => r.status === "Archived").length;
    const withSqft = rows.filter((r) => Number(r.sqft) > 0);
    const avg = withSqft.length
      ? Math.round(withSqft.reduce((s, r) => s + Number(r.sqft), 0) / withSqft.length)
      : 0;
    return [
      { label: "Floor plans", value: String(rows.length), footer: `${active} active` },
      { label: "Active", value: String(active), footer: "In use" },
      { label: "Avg sq ft", value: avg ? avg.toLocaleString() : "—", footer: "Across plans" },
      { label: "Archived", value: String(archived), footer: "Retired" },
    ];
  },

  createDraft: { name: "", status: "Active" },
  createFields: [
    { key: "name", label: "Floor plan name", type: "text", placeholder: "e.g. A1 — 1BR Standard" },
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
  }),

  detailFields: [
    { key: "name", label: "Floor plan name", type: "text", span: 2 },
    { key: "bedrooms", label: "Bedrooms", type: "number" },
    { key: "bathrooms", label: "Bathrooms", type: "number" },
    { key: "sqft", label: "Square feet", type: "number" },
    { key: "dimensions", label: "Dimensions", type: "text" },
    { key: "propertyId", label: "Property", type: "entity", entity: "property" },
    { key: "description", label: "Description", type: "textarea", span: 2 },
  ],
  overviewStats: (item) => [
    { label: "Beds", value: String(item.bedrooms ?? 0) },
    { label: "Baths", value: String(item.bathrooms ?? 0) },
    { label: "Sq ft", value: item.sqft ? String(item.sqft) : "—" },
    { label: "Dimensions", value: item.dimensions || "—" },
  ],

  headerMeta: (r) => specs(r) || "No specs",

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this floor plan." }] },
    {
      group: "Floor Plan",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Core fields for this plan." },
        { key: "planfile", label: "Plan File", icon: ImagePlus, desc: "Upload or replace the drawing." },
        { key: "linked", label: "Linked", icon: Link2, desc: "Units and properties using this plan." },
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
    planfile: PlanFileSection,
    linked: FloorPlanLinkedSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default floorPlansConfig;
