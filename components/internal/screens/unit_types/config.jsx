import {
  BedDouble,
  LayoutDashboard,
  SquarePen,
  Sparkles,
  DoorOpen,
  FileText,
  Clock,
  Settings,
  BadgeDollarSign,
  ListChecks,
  Megaphone,
  Receipt,
  Image as ImageIcon,
  StickyNote,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { unitTypesData, listUnitTypes } from "@/lib/supabase/unit_types";
import { listUnits, updateUnit, unitsData } from "@/lib/supabase/units";
import {
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  AmenitiesSection,
  MediaSection,
  RelatedUnitsSection,
} from "@/components/internal/screens/entity/shared_sections";
import {
  makeFieldsSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  FEATURE_OPTIONS,
  UTILITY_OPTIONS,
  currency,
  filterOptions,
  floorPlanOptions,
  specs,
  toOptions,
  todayISO,
} from "@/components/internal/screens/units/shared";
import { makeUnitRollupSection } from "./sections/rollup";

// Per-area config for Unit Types (row = a reusable unit template with pricing,
// features and marketing copy, rolled up over the units assigned to it).

const STATUS_MAP = {
  Active: { label: "Active", variant: "success" },
  Inactive: { label: "Inactive", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

const AVAILABLE = ["Vacant", "Make-ready", "Notice"];
const TERMS = toOptions(["Month-to-month", "6 months", "9 months", "12 months", "18 months", "24 months"]);

// List rows joined with assigned-unit counts.
async function loadTypeRows() {
  const [types, units] = await Promise.all([listUnitTypes(), listUnits()]);
  if (!types) return null;
  const count = new Map();
  const avail = new Map();
  for (const u of units ?? []) {
    if (!u.unitTypeId) continue;
    count.set(u.unitTypeId, (count.get(u.unitTypeId) || 0) + 1);
    if (AVAILABLE.includes(u.status)) avail.set(u.unitTypeId, (avail.get(u.unitTypeId) || 0) + 1);
  }
  return types.map((t) => ({ ...t, unitCount: count.get(t.id) || 0, availableCount: avail.get(t.id) || 0 }));
}

const range = (t) =>
  t.rentMin || t.rentMax ? `${currency(t.rentMin || t.marketRent)}–${currency(t.rentMax || t.marketRent)}` : null;

const DETAIL_FIELDS = [
  { key: "name", label: "Unit type name", type: "text", required: true },
  { key: "code", label: "Code", type: "text", meta: true, placeholder: "e.g. 2B2-A" },
  {
    key: "category",
    label: "Category",
    type: "select",
    meta: true,
    options: toOptions(["Studio", "1 bedroom", "2 bedroom", "3 bedroom", "4+ bedroom", "Townhome", "Commercial", "Parking", "Storage"]),
  },
  { key: "floorPlanId", label: "Default floor plan", type: "relation", load: floorPlanOptions },
  { key: "bedrooms", label: "Bedrooms", type: "number", min: 0 },
  { key: "bathrooms", label: "Full baths", type: "number", min: 0, step: 0.5 },
  { key: "halfBaths", label: "Half baths", type: "number", meta: true, min: 0 },
  { key: "maxOccupancy", label: "Max occupancy", type: "number", meta: true, min: 0 },
  { key: "sqft", label: "Typical sq ft", type: "number", min: 0 },
  { key: "sqftRange", label: "Sq ft range", type: "text", meta: true, placeholder: "e.g. 820–910" },
  { key: "description", label: "Description", type: "textarea" },
];

const PRICING_FIELDS = [
  { key: "marketRent", label: "Market rent", type: "currency", hint: "Actions → Push rent to units applies it to assigned units." },
  { key: "deposit", label: "Default deposit", type: "currency" },
  { key: "rentMin", label: "Rent range — low", type: "currency", meta: true },
  { key: "rentMax", label: "Rent range — high", type: "currency", meta: true },
  { key: "pricingStrategy", label: "Pricing strategy", type: "select", meta: true, options: toOptions(["Fixed", "Range by unit", "Manually revenue-managed"]) },
  { key: "leaseTerms", label: "Lease terms offered", type: "multiselect", options: TERMS, meta: true },
  { key: "applicationFee", label: "Application fee", type: "currency", meta: true },
  { key: "petRent", label: "Pet rent", type: "currency", meta: true, suffix: "/mo" },
  { key: "furnishedPremium", label: "Furnished premium", type: "currency", meta: true, suffix: "/mo" },
  { key: "concessionNote", label: "Current special", type: "text", meta: true, full: true, placeholder: "e.g. 6 weeks free on 13-month leases" },
  { key: "pricingNotes", label: "Pricing notes", type: "textarea", meta: true },
];

const FEATURE_FIELDS = [
  { key: "features", label: "Standard features", type: "multiselect", options: FEATURE_OPTIONS, meta: true },
  { key: "utilitiesIncluded", label: "Utilities included", type: "multiselect", options: UTILITY_OPTIONS, meta: true },
  { key: "laundry", label: "Laundry", type: "select", meta: true, options: toOptions(["In-unit", "Hookups", "Shared on site", "None"]) },
  { key: "petPolicy", label: "Pet policy", type: "select", meta: true, options: toOptions(["No pets", "Cats only", "Dogs only", "Cats & dogs", "Case by case"]) },
  { key: "accessible", label: "ADA accessible layout", type: "switch", meta: true },
  { key: "furnishedAvailable", label: "Furnished option available", type: "switch", meta: true },
];

const MARKETING_FIELDS = [
  { key: "showOnWebsite", label: "Show on website / ILS", type: "switch", meta: true },
  { key: "marketingTitle", label: "Marketing title", type: "text", meta: true, full: true },
  { key: "marketingDescription", label: "Marketing description", type: "textarea", meta: true },
  { key: "highlights", label: "Highlights (one per line)", type: "textarea", meta: true },
  { key: "virtualTourUrl", label: "Virtual tour", type: "url", meta: true },
  { key: "videoUrl", label: "Video", type: "url", meta: true },
];

export const unitTypesConfig = {
  key: "unittype",
  singular: "Unit Type",
  plural: "Unit Types",
  title: "Unit Types",
  description:
    "Reusable unit templates — layout, pricing range, features and marketing copy. Assign a type to units to keep specs and rent consistent, and see availability across them.",
  icon: BedDouble,
  titleField: "name",
  searchFields: ["name", "code", "category"],
  data: unitTypesData,
  rowsLoader: loadTypeRows,

  statusMap: STATUS_MAP,
  statusFilterOptions: filterOptions(STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "available", label: "With availability", filter: (r) => r.availableCount > 0 },
    { value: "unused", label: "No units", filter: (r) => !r.unitCount },
  ],

  columns: [
    {
      key: "name",
      header: "Unit type",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{[r.code, specs(r)].filter(Boolean).join(" · ") || "—"}</span>
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
      key: "marketRent",
      header: "Market rent",
      align: "right",
      className: "text-right tabular-nums",
      render: (r) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-semibold text-foreground">{currency(r.marketRent)}</span>
          <span className="text-xs text-text-secondary">{range(r) || "—"}</span>
        </div>
      ),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const units = rows.reduce((s, r) => s + (r.unitCount || 0), 0);
    const avail = rows.reduce((s, r) => s + (r.availableCount || 0), 0);
    const withRent = rows.filter((r) => Number(r.marketRent) > 0);
    const avg = withRent.length ? Math.round(withRent.reduce((s, r) => s + Number(r.marketRent), 0) / withRent.length) : 0;
    return [
      { label: "Unit types", value: String(rows.length), footer: `${active} active` },
      { label: "Units assigned", value: String(units), footer: "Across all types" },
      { label: "Available", value: String(avail), footer: "Vacant, make-ready or notice" },
      { label: "Avg market rent", value: currency(avg), footer: "Across types" },
    ];
  },

  createDraft: { name: "", status: "Active" },
  createFields: [
    { key: "name", label: "Unit type name", type: "text", placeholder: "e.g. 1BR / 1BA Standard" },
    { key: "status", label: "Status", type: "select", options: filterOptions(STATUS_MAP).slice(1) },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    status: draft.status || "Active",
    bedrooms: 0,
    bathrooms: 0,
    marketRent: 0,
  }),

  headerMeta: (r) => [r.code, specs(r), currency(r.marketRent), range(r)].filter(Boolean).join(" · "),

  actions: [
    {
      key: "pushRent",
      label: "Push rent to units",
      icon: Send,
      wizard: {
        title: "Push market rent to units",
        description: "Sets each assigned unit's market rent to this type's rent and records it in the unit's rent history.",
        finishLabel: "Update Units",
        logSummary: "Pushed market rent to units",
        initial: () => ({ scope: "vacant" }),
        steps: [
          {
            key: "scope",
            title: "Which units",
            fields: [
              {
                key: "scope",
                label: "Apply to",
                type: "select",
                options: [
                  { value: "vacant", label: "Vacant & make-ready units only" },
                  { value: "all", label: "All assigned units" },
                ],
              },
            ],
          },
        ],
        finish: async (v, ctx) => {
          const amount = Number(ctx.item.marketRent) || 0;
          if (!amount) {
            toast.error("Set a market rent first.");
            return false;
          }
          const units = ((await listUnits()) ?? []).filter(
            (u) => u.unitTypeId === ctx.item.id && (v.scope === "all" || ["Vacant", "Make-ready"].includes(u.status)) && Number(u.rent) !== amount,
          );
          let done = 0;
          for (const u of units) {
            const saved = await updateUnit(u.id, { rent: amount });
            if (!saved) continue;
            const history = Array.isArray(u.rentHistory) ? u.rentHistory : [];
            await unitsData.mergeMeta(u.id, {
              rentHistory: [
                ...history,
                { id: crypto.randomUUID(), effectiveDate: todayISO(), amount, previous: Number(u.rent) || 0, reason: `Unit type ${ctx.item.name}`, notes: "", recordedAt: new Date().toISOString() },
              ],
            });
            done += 1;
          }
          toast.success(done ? `Updated ${done} unit${done === 1 ? "" : "s"}.` : "All matching units already have this rent.");
          return true;
        },
      },
    },
  ],

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Availability and pricing across units of this type." }] },
    {
      group: "Unit Type",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Layout, floor plan and size." },
        { key: "pricing", label: "Pricing", icon: BadgeDollarSign, desc: "Market rent, range, deposit and fees." },
        { key: "features", label: "Features", icon: ListChecks, desc: "Standard features and policies." },
        { key: "charges", label: "Default Charges", icon: Receipt, desc: "Recurring charges for units of this type." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "Default amenities for this type." },
      ],
    },
    {
      group: "Marketing",
      items: [
        { key: "marketing", label: "Marketing Copy", icon: Megaphone, desc: "Title, description and tours." },
        { key: "media", label: "Photos & Media", icon: ImageIcon, desc: "Representative photos for this type." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "units", label: "Units", icon: DoorOpen, desc: "Units of this type — add one pre-linked." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Files and paperwork." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Recent changes and notes." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: makeUnitRollupSection({ filterField: "unitTypeId", marketKey: "marketRent", noun: "unit type" }),
    details: makeFieldsSection(DETAIL_FIELDS),
    pricing: makeFieldsSection(PRICING_FIELDS),
    features: makeFieldsSection(FEATURE_FIELDS),
    charges: makeMetaListSection({
      field: "defaultCharges",
      singular: "charge",
      icon: Receipt,
      primaryPlaceholder: "e.g. Valet trash",
      secondary: { key: "amount", label: "Monthly amount", type: "number", placeholder: "0" },
    }),
    amenities: AmenitiesSection,
    marketing: makeFieldsSection(MARKETING_FIELDS),
    media: MediaSection,
    units: RelatedUnitsSection,
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "typeNotes", placeholder: "Internal notes about this unit type…" }),
    activity: ActivitySection,
    settings: SettingsSection,
  },
  sectionProps: {
    units: { filterField: "unitTypeId" },
  },
};

export default unitTypesConfig;
