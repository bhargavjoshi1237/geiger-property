import {
  Ruler,
  LayoutDashboard,
  SquarePen,
  ImagePlus,
  Link2,
  FileText,
  Clock,
  Settings,
  BadgeDollarSign,
  ListChecks,
  Megaphone,
  Image as ImageIcon,
  StickyNote,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { floorPlansData, listFloorPlans } from "@/lib/supabase/floor_plans";
import { listUnits } from "@/lib/supabase/units";
import { propertyOptions } from "@/lib/supabase/options";
import {
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  PlanFileSection,
  FloorPlanLinkedSection,
  MediaSection,
} from "@/components/internal/screens/entity/shared_sections";
import { makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { FEATURE_OPTIONS, currency, filterOptions, specs, toOptions } from "@/components/internal/screens/units/shared";
import { makeUnitRollupSection } from "@/components/internal/screens/unit_types/sections/rollup";

// Per-area config for Floor Plans (row = a reusable plan with an uploaded drawing,
// pricing range and marketing copy, rolled up over the units that use it).

const STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-neutral-600" },
};

const AVAILABLE = ["Vacant", "Make-ready", "Notice"];

// List rows joined with linked-unit counts and live unit rent range.
async function loadPlanRows() {
  const [plans, units] = await Promise.all([listFloorPlans(), listUnits()]);
  if (!plans) return null;
  const byPlan = new Map();
  for (const u of units ?? []) {
    if (!u.floorPlanId) continue;
    if (!byPlan.has(u.floorPlanId)) byPlan.set(u.floorPlanId, []);
    byPlan.get(u.floorPlanId).push(u);
  }
  return plans.map((p) => {
    const mine = byPlan.get(p.id) || [];
    const rents = mine.map((u) => Number(u.rent) || 0).filter(Boolean);
    return {
      ...p,
      unitCount: mine.length,
      availableCount: mine.filter((u) => AVAILABLE.includes(u.status)).length,
      unitRentMin: rents.length ? Math.min(...rents) : 0,
      unitRentMax: rents.length ? Math.max(...rents) : 0,
    };
  });
}

const priceRange = (p) => {
  const lo = Number(p.startingRent) || p.unitRentMin;
  const hi = Number(p.maxRent) || p.unitRentMax;
  if (!lo && !hi) return null;
  return lo === hi || !hi ? `From ${currency(lo)}` : `${currency(lo)}–${currency(hi)}`;
};

const DETAIL_FIELDS = [
  { key: "name", label: "Floor plan name", type: "text", required: true },
  { key: "planCode", label: "Plan code", type: "text", meta: true, placeholder: "e.g. A1" },
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions },
  { key: "layoutStyle", label: "Layout style", type: "select", meta: true, options: toOptions(["Open concept", "Split bedroom", "Galley", "Loft", "Townhome", "Penthouse"]) },
  { key: "bedrooms", label: "Bedrooms", type: "number", min: 0 },
  { key: "bathrooms", label: "Bathrooms", type: "number", min: 0, step: 0.5 },
  { key: "sqft", label: "Square feet", type: "number", min: 0 },
  { key: "dimensions", label: "Dimensions", type: "text", placeholder: "e.g. 28' × 34'" },
  { key: "levels", label: "Levels", type: "number", meta: true, min: 1 },
  { key: "ceilingHeight", label: "Ceiling height", type: "text", meta: true, placeholder: "e.g. 9 ft" },
  { key: "outdoorSqft", label: "Outdoor space (sq ft)", type: "number", meta: true, min: 0 },
  { key: "description", label: "Description", type: "textarea" },
];

const PRICING_FIELDS = [
  { key: "startingRent", label: "Starting rent", type: "currency", meta: true, hint: "Leave blank to use the lowest unit rent." },
  { key: "maxRent", label: "Highest rent", type: "currency", meta: true },
  { key: "deposit", label: "Deposit", type: "currency", meta: true },
  { key: "specials", label: "Current special", type: "text", meta: true, full: true, placeholder: "e.g. $500 off first month" },
  { key: "pricingNotes", label: "Pricing notes", type: "textarea", meta: true },
];

const FEATURE_FIELDS = [
  { key: "features", label: "Plan features", type: "multiselect", options: FEATURE_OPTIONS, meta: true },
  { key: "accessible", label: "ADA accessible", type: "switch", meta: true },
  { key: "hasDen", label: "Den / flex room", type: "switch", meta: true },
  { key: "outdoorSpace", label: "Outdoor space", type: "select", meta: true, options: toOptions(["None", "Balcony", "Patio", "Terrace", "Yard"]) },
];

const MARKETING_FIELDS = [
  { key: "showOnWebsite", label: "Show on website / ILS", type: "switch", meta: true },
  { key: "marketingTitle", label: "Marketing title", type: "text", meta: true, full: true },
  { key: "marketingDescription", label: "Marketing description", type: "textarea", meta: true },
  { key: "virtualTourUrl", label: "Virtual tour", type: "url", meta: true },
  { key: "threeDUrl", label: "3D / interactive plan", type: "url", meta: true },
];

export const floorPlansConfig = {
  key: "floorplan",
  singular: "Floor Plan",
  plural: "Floor Plans",
  title: "Floor Plans",
  description:
    "Reusable floor plans you link to units and properties — the drawing, specs, pricing range and marketing copy, with availability across every unit on the plan.",
  icon: Ruler,
  titleField: "name",
  searchFields: ["name", "dimensions", "planCode"],
  data: floorPlansData,
  rowsLoader: loadPlanRows,

  statusMap: STATUS_MAP,
  statusFilterOptions: filterOptions(STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "available", label: "With availability", filter: (r) => r.availableCount > 0 },
    { value: "nodrawing", label: "Missing drawing", filter: (r) => !r.imageUrl },
  ],

  columns: [
    {
      key: "name",
      header: "Floor plan",
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={r.imageUrl} alt="" className="h-9 w-12 shrink-0 rounded-md border border-border object-cover" />
          ) : (
            <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card text-text-tertiary">
              <Ruler className="h-4 w-4" />
            </span>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{r.name}</span>
            <span className="text-xs text-text-secondary">{[r.planCode, specs(r)].filter(Boolean).join(" · ") || "—"}</span>
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
      key: "units",
      header: "Units",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground">{r.unitCount} units</span>
          <span className="text-xs text-text-secondary">{r.availableCount ? `${r.availableCount} available` : "None available"}</span>
        </div>
      ),
    },
    {
      key: "price",
      header: "Pricing",
      align: "right",
      className: "text-right tabular-nums text-sm text-foreground",
      render: (r) => priceRange(r) || "—",
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const units = rows.reduce((s, r) => s + (r.unitCount || 0), 0);
    const avail = rows.reduce((s, r) => s + (r.availableCount || 0), 0);
    const withSqft = rows.filter((r) => Number(r.sqft) > 0);
    const avg = withSqft.length ? Math.round(withSqft.reduce((s, r) => s + Number(r.sqft), 0) / withSqft.length) : 0;
    return [
      { label: "Floor plans", value: String(rows.length), footer: `${active} active` },
      { label: "Units on plans", value: String(units), footer: `${avail} available` },
      { label: "Avg sq ft", value: avg ? avg.toLocaleString() : "0", footer: "Across plans" },
      { label: "Missing drawing", value: String(rows.filter((r) => !r.imageUrl).length), footer: "Upload under Plan File" },
    ];
  },

  createDraft: { name: "", status: "Active" },
  createFields: [
    { key: "name", label: "Floor plan name", type: "text", placeholder: "e.g. A1 — 1BR Standard" },
    { key: "status", label: "Status", type: "select", options: filterOptions(STATUS_MAP).slice(1) },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    status: draft.status || "Active",
    bedrooms: 0,
    bathrooms: 0,
  }),

  headerMeta: (r) => [r.planCode, specs(r), priceRange(r)].filter(Boolean).join(" · ") || "No specs",

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Availability and pricing across units on this plan." }] },
    {
      group: "Floor Plan",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Specs, dimensions and property." },
        { key: "planfile", label: "Plan File", icon: ImagePlus, desc: "Upload or replace the drawing." },
        { key: "pricing", label: "Pricing", icon: BadgeDollarSign, desc: "Rent range, deposit and specials." },
        { key: "features", label: "Features", icon: ListChecks, desc: "What this layout includes." },
      ],
    },
    {
      group: "Marketing",
      items: [
        { key: "marketing", label: "Marketing Copy", icon: Megaphone, desc: "Title, description and tours." },
        { key: "media", label: "Photos & Media", icon: ImageIcon, desc: "Renderings and model-unit photos." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "linked", label: "Linked", icon: Link2, desc: "Units and properties using this plan." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Files and paperwork." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Recent changes and notes." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: makeUnitRollupSection({ filterField: "floorPlanId", marketKey: "startingRent", noun: "floor plan", imageKey: "imageUrl" }),
    details: makeFieldsSection(DETAIL_FIELDS),
    planfile: PlanFileSection,
    pricing: makeFieldsSection(PRICING_FIELDS),
    features: makeFieldsSection(FEATURE_FIELDS),
    marketing: makeFieldsSection(MARKETING_FIELDS),
    media: MediaSection,
    linked: FloorPlanLinkedSection,
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "planNotes", placeholder: "Internal notes about this floor plan…" }),
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default floorPlansConfig;
