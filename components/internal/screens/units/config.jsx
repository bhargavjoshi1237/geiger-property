import {
  DoorOpen,
  LayoutDashboard,
  SquarePen,
  Sparkles,
  Ruler,
  Image as ImageIcon,
  FileText,
  Clock,
  Settings,
  Tags,
  ListChecks,
  BadgeDollarSign,
  Users,
  Megaphone,
  LockKeyhole,
  Smartphone,
  Ban,
  Wrench,
  Gauge,
  Refrigerator,
  Key,
  Receipt,
  FileSignature,
  ArrowLeftRight,
  ClipboardCheck,
  RefreshCw,
  ClipboardPen,
  StickyNote,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { unitsData, listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { listUnitTypes } from "@/lib/supabase/unit_types";
import { leasesLayer } from "@/lib/supabase/leases";
import { movesLayer } from "@/lib/supabase/moves";
import { inspectionsLayer } from "@/lib/supabase/inspections";
import { unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { propertyOptions } from "@/lib/supabase/options";
import {
  DocumentsSection,
  ActivitySection,
  AmenitiesSection,
  MediaSection,
  FloorPlansSection,
  SettingsSection,
} from "@/components/internal/screens/entity/shared_sections";
import {
  makeCustomFieldsSection,
  makeFieldsSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { LEASE_STATUS_MAP, MOVE_STATUS_MAP, INSPECTION_STATUS_MAP } from "@/components/internal/screens/leasing/shared";
import { MAINTENANCE_STATUS_MAP, TURN_STATUS_MAP } from "@/components/internal/screens/maintenance/shared";
import { UnitOverviewSection } from "./sections/overview";
import { UnitRentSection } from "./sections/rent";
import { UnitOccupancySection } from "./sections/occupancy";
import { UnitMarketingSection } from "./sections/marketing";
import { unitActions } from "./actions";
import {
  UNIT_STATUS_MAP,
  FEATURE_OPTIONS,
  UTILITY_OPTIONS,
  LIVE_LEASE,
  NON_REVENUE_TYPES,
  DOWN_REASONS,
  buildingOptions,
  unitTypeOptions,
  floorPlanOptions,
  currency,
  daysSince,
  daysUntil,
  filterOptions,
  formatDate,
  isRevenue,
  randomCode,
  specs,
  toOptions,
  todayISO,
} from "./shared";

// Per-area config for the Units list + editor (row = one individual unit).

const VACANT = ["Vacant", "Make-ready"];
const OFFLINE = ["Down", "Non-revenue"];

// List rows joined with property names and the live lease (rent, end date).
async function loadUnitRows() {
  const [units, props, leases] = await Promise.all([listUnits(), listProperties(), leasesLayer.list()]);
  if (!units) return null;
  const propName = new Map((props ?? []).map((p) => [p.id, p.name]));
  const liveByUnit = new Map();
  for (const l of leases ?? []) {
    if (l.unitId && LIVE_LEASE.includes(l.status)) liveByUnit.set(l.unitId, l);
  }
  return units.map((u) => {
    const lease = liveByUnit.get(u.id);
    return {
      ...u,
      propertyName: propName.get(u.propertyId) || "",
      leasedRent: Number(lease?.rent) || 0,
      leaseEndsOn: lease?.termEnd || u.leaseEnd || "",
    };
  });
}

// Unit-type options for the create dialog, carrying the type's specs into the draft.
async function unitTypeCreateOptions() {
  const rows = (await listUnitTypes()) ?? [];
  return rows.map((t) => ({
    value: t.id,
    label: t.name || "Unit type",
    patch: {
      bedrooms: t.bedrooms,
      bathrooms: t.bathrooms,
      sqft: t.sqft,
      rent: t.marketRent,
      deposit: t.deposit,
      floorPlanId: t.floorPlanId || "",
    },
  }));
}

const tableDate = (key, header) => ({
  key,
  header,
  className: "text-sm text-muted-foreground",
  render: (r) => formatDate(r[key]),
});
const statusCol = (map) => ({ key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={map} /> });
const moneyCol = (key, header) => ({
  key,
  header,
  align: "right",
  className: "text-right tabular-nums text-foreground",
  render: (r) => currency(r[key]),
});
const nameCol = (header, sub) => ({
  key: "name",
  header,
  render: (r) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-foreground">{r.name || "Untitled"}</span>
      {sub ? <span className="text-xs text-text-secondary">{sub(r) || "—"}</span> : null}
    </div>
  ),
});

// Record-item status badges (record_items.status column).
const itemBadge = (status, map) => ({ badge: status || undefined, badgeVariant: map[status] || "neutral" });
const expired = (r) => r.endsOn && daysUntil(r.endsOn) < 0;

const DETAIL_FIELDS = [
  { key: "identity", label: "Identity", type: "heading" },
  { key: "label", label: "Unit label", type: "text", required: true },
  { key: "floor", label: "Floor", type: "text" },
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  { key: "buildingId", label: "Building", type: "relation", load: buildingOptions },
  { key: "unitTypeId", label: "Unit type", type: "relation", load: unitTypeOptions, hint: "Actions → Apply unit type specs copies its beds, baths and deposit." },
  { key: "floorPlanId", label: "Floor plan", type: "relation", load: floorPlanOptions },
  { key: "unitAddress", label: "Street address (if different)", type: "text", meta: true, full: true },
  { key: "layout", label: "Layout", type: "heading" },
  { key: "bedrooms", label: "Bedrooms", type: "number", min: 0 },
  { key: "bathrooms", label: "Full baths", type: "number", min: 0, step: 0.5 },
  { key: "halfBaths", label: "Half baths", type: "number", meta: true, min: 0 },
  { key: "sqft", label: "Square feet", type: "number", min: 0 },
  { key: "maxOccupancy", label: "Max occupancy", type: "number", meta: true, min: 0 },
  {
    key: "layoutType",
    label: "Layout type",
    type: "select",
    meta: true,
    options: toOptions(["Flat", "Studio", "Loft", "Townhouse", "Duplex", "Penthouse", "Single-family"]),
  },
  { key: "exposure", label: "Exposure", type: "select", meta: true, options: toOptions(["North", "South", "East", "West", "Corner"]) },
  { key: "view", label: "View", type: "select", meta: true, options: toOptions(["None", "City", "Courtyard", "Garden", "Pool", "Street", "Water"]) },
  { key: "accessible", label: "ADA accessible", type: "switch", meta: true },
  { key: "layoutNotes", label: "Layout notes", type: "textarea", meta: true },
];

const FEATURE_FIELDS = [
  { key: "features", label: "Unit features", type: "multiselect", options: FEATURE_OPTIONS, meta: true },
  { key: "utilitiesIncluded", label: "Utilities included in rent", type: "multiselect", options: UTILITY_OPTIONS, meta: true },
  { key: "laundry", label: "Laundry", type: "select", meta: true, options: toOptions(["In-unit", "Hookups", "Shared on site", "None"]) },
  { key: "heating", label: "Heating", type: "select", meta: true, options: toOptions(["Forced air", "Radiator", "Baseboard", "Heat pump", "None"]) },
  { key: "cooling", label: "Cooling", type: "select", meta: true, options: toOptions(["Central air", "Window units", "Mini-split", "None"]) },
  { key: "flooring", label: "Flooring", type: "select", meta: true, options: toOptions(["Hardwood", "LVP", "Carpet", "Tile", "Mixed"]) },
  {
    key: "petPolicy",
    label: "Pet policy",
    type: "select",
    meta: true,
    options: toOptions(["No pets", "Cats only", "Dogs only", "Cats & dogs", "Case by case"]),
  },
  { key: "smokingAllowed", label: "Smoking allowed", type: "switch", meta: true },
  { key: "parking", label: "Parking", type: "select", meta: true, options: toOptions(["None", "Street", "1 space", "2 spaces", "Garage"]) },
  { key: "parkingSpace", label: "Assigned parking space", type: "text", meta: true },
  { key: "storageUnit", label: "Storage unit", type: "text", meta: true },
  { key: "mailboxNumber", label: "Mailbox number", type: "text", meta: true },
];

const ACCESS_FIELDS = [
  {
    key: "permissionToEnter",
    label: "Permission to enter",
    type: "select",
    meta: true,
    options: toOptions(["Always", "Call first", "Tenant present only", "Emergencies only"]),
  },
  { key: "petOnSite", label: "Pet on premises", type: "switch", meta: true },
  { key: "petNotes", label: "Pet notes", type: "text", meta: true, full: true, showIf: (u) => Boolean(u.petOnSite) },
  { key: "entryInstructions", label: "Resident entry instructions", type: "textarea", meta: true },
  { key: "vendorEntryInstructions", label: "Vendor entry instructions", type: "textarea", meta: true },
  { key: "codes", label: "Codes & devices", type: "heading" },
  { key: "lockboxCode", label: "Lockbox code", type: "text", meta: true },
  { key: "lockboxLocation", label: "Lockbox location", type: "text", meta: true },
  { key: "gateCode", label: "Gate / building code", type: "text", meta: true },
  { key: "alarmCode", label: "Alarm code", type: "text", meta: true },
  { key: "smartLockDevice", label: "Smart lock", type: "text", meta: true, placeholder: "e.g. Front door · Yale Assure" },
  { key: "alarmNotes", label: "Alarm notes", type: "textarea", meta: true },
];

const isNonRevenue = (u) => Boolean(u.nonRevenue) || u.status === "Non-revenue";
const REVENUE_FIELDS = [
  { key: "nonRevenue", label: "Non-revenue unit", type: "switch", meta: true, hint: "Excluded from occupancy and rent-roll totals." },
  { key: "nonRevenueType", label: "Use", type: "select", options: NON_REVENUE_TYPES, meta: true, showIf: isNonRevenue },
  { key: "nonRevenueSince", label: "Since", type: "date", meta: true, showIf: isNonRevenue },
  { key: "nonRevenueUntil", label: "Until (expected)", type: "date", meta: true, showIf: isNonRevenue },
  { key: "nonRevenueReason", label: "Reason", type: "textarea", meta: true, showIf: isNonRevenue },
  { key: "offline", label: "Offline (down)", type: "heading", hint: "Shown while the unit's status is Down.", showIf: (u) => u.status === "Down" },
  { key: "downReason", label: "Reason", type: "select", options: DOWN_REASONS, meta: true, showIf: (u) => u.status === "Down" },
  { key: "downSince", label: "Offline since", type: "date", meta: true, showIf: (u) => u.status === "Down" },
  { key: "downUntil", label: "Expected back", type: "date", meta: true, showIf: (u) => u.status === "Down" },
  { key: "downNotes", label: "Notes", type: "textarea", meta: true, showIf: (u) => u.status === "Down" },
  { key: "status", label: "Unit status", type: "select", options: filterOptions(UNIT_STATUS_MAP).slice(1) },
];

const MAINTENANCE_FIELDS = [
  { key: "maintenanceNotes", label: "Maintenance notes", type: "textarea", meta: true },
  { key: "finishes", label: "Finishes", type: "heading" },
  { key: "paintColor", label: "Paint color", type: "text", meta: true, placeholder: "e.g. SW 7008 Alabaster" },
  { key: "paintFinish", label: "Paint finish", type: "select", meta: true, options: toOptions(["Flat", "Eggshell", "Satin", "Semi-gloss"]) },
  { key: "lastPaintedOn", label: "Last painted", type: "date", meta: true },
  { key: "lastFlooringOn", label: "Flooring replaced", type: "date", meta: true },
  { key: "systems", label: "Systems", type: "heading" },
  { key: "hvacFilterSize", label: "HVAC filter size", type: "text", meta: true, placeholder: "e.g. 16x25x1" },
  { key: "hvacFilterChangedOn", label: "Filter changed", type: "date", meta: true },
  { key: "waterShutoff", label: "Water shut-off location", type: "text", meta: true },
  { key: "breakerPanel", label: "Breaker panel location", type: "text", meta: true },
  { key: "smokeTestedOn", label: "Smoke/CO detectors tested", type: "date", meta: true },
  { key: "inspections", label: "Inspections", type: "heading" },
  { key: "inspectionTemplate", label: "Inspection template", type: "text", meta: true },
  { key: "nextInspectionDue", label: "Next inspection due", type: "date", meta: true },
];

const ACCESS_CODE_STATUS = { active: "success", expired: "outline", revoked: "danger" };
const KEY_STATUS = { "In office": "success", "Checked out": "warning", Lost: "danger", Retired: "outline" };
const ASSET_STATUS = { "In service": "success", "Needs repair": "warning", Retired: "outline" };
const METER_STATUS = { Active: "success", Inactive: "outline" };

export const unitsConfig = {
  key: "unit",
  singular: "Unit",
  plural: "Units",
  title: "Units",
  description:
    "Every individual unit across your portfolio — occupancy, market rent, availability and readiness. Open a unit to manage pricing, access, turns and its history.",
  icon: DoorOpen,
  titleField: "label",
  searchFields: ["label", "occupantName", "floor", "propertyName"],
  data: unitsData,
  rowsLoader: loadUnitRows,

  statusMap: UNIT_STATUS_MAP,
  statusFilterOptions: filterOptions(UNIT_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "available", label: "Vacant & make-ready", filter: (r) => VACANT.includes(r.status), createDefaults: { status: "Vacant" } },
    { value: "occupied", label: "Occupied", filter: (r) => ["Occupied", "Notice"].includes(r.status) },
    { value: "offline", label: "Offline & non-revenue", filter: (r) => OFFLINE.includes(r.status) || Boolean(r.nonRevenue) },
    { value: "flex", label: "Furnished / mid-term", filter: (r) => Boolean(r.furnished || r.midTermEligible) },
  ],

  columns: [
    {
      key: "label",
      header: "Unit",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.label}</span>
          <span className="text-xs text-text-secondary">{[r.propertyName, specs(r)].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={r.status} map={UNIT_STATUS_MAP} />
          {r.midTermEligible ? <Badge variant="purple">Mid-term</Badge> : null}
          {r.furnished && !r.midTermEligible ? <Badge variant="neutral">Furnished</Badge> : null}
        </div>
      ),
    },
    {
      key: "occupant",
      header: "Occupant · Availability",
      render: (r) => {
        if (["Occupied", "Notice"].includes(r.status)) {
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-foreground">{r.occupantName || "Occupied"}</span>
              <span className="text-xs text-text-secondary">{r.leaseEndsOn ? `Lease ends ${formatDate(r.leaseEndsOn)}` : "No end date"}</span>
            </div>
          );
        }
        const days = VACANT.includes(r.status) ? daysSince(r.vacatedOn || r.leaseEnd) : null;
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">{r.availableDate ? `Available ${formatDate(r.availableDate)}` : "—"}</span>
            <span className="text-xs text-text-secondary">
              {[r.readyStatus, days !== null ? `${days}d vacant` : null].filter(Boolean).join(" · ") || "—"}
            </span>
          </div>
        );
      },
    },
    {
      key: "rent",
      header: "Market · Leased",
      align: "right",
      className: "text-right tabular-nums",
      render: (r) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-semibold text-foreground">{currency(r.rent)}</span>
          <span className="text-xs text-text-secondary">{r.leasedRent ? `${currency(r.leasedRent)} leased` : "—"}</span>
        </div>
      ),
    },
  ],

  stats: (rows) => {
    const revenue = rows.filter(isRevenue);
    const occupied = revenue.filter((r) => ["Occupied", "Notice"].includes(r.status)).length;
    const vacant = revenue.filter((r) => VACANT.includes(r.status));
    const vacantDays = vacant.map((r) => daysSince(r.vacatedOn || r.leaseEnd)).filter((d) => d !== null);
    const avgVacant = vacantDays.length ? Math.round(vacantDays.reduce((s, d) => s + d, 0) / vacantDays.length) : 0;
    const market = revenue.reduce((s, r) => s + (Number(r.rent) || 0), 0);
    const leased = revenue.reduce((s, r) => s + (Number(r.leasedRent) || 0), 0);
    const offline = rows.length - revenue.length + revenue.filter((r) => r.status === "Down").length;
    return [
      { label: "Units", value: String(rows.length), footer: `${offline} offline or non-revenue` },
      {
        label: "Occupancy",
        value: `${revenue.length ? Math.round((occupied / revenue.length) * 100) : 0}%`,
        footer: `${occupied} of ${revenue.length} revenue units`,
      },
      { label: "Vacant", value: String(vacant.length), footer: avgVacant ? `Avg ${avgVacant} days vacant` : "Ready to lease" },
      { label: "Market rent roll", value: currency(market), footer: `${currency(leased)} leased / mo` },
    ];
  },

  createDraft: { label: "", propertyId: "", unitTypeId: "", status: "Vacant" },
  createFields: [
    { key: "label", label: "Unit label", type: "text", placeholder: "e.g. 4B" },
    { key: "propertyId", label: "Property", type: "select", optionsFrom: "properties", placeholder: "Select a property…", emptyLabel: "No properties yet" },
    { key: "unitTypeId", label: "Unit type", type: "select", optionsFrom: "unitTypes", placeholder: "Optional — prefills specs", emptyLabel: "No unit types yet" },
    { key: "status", label: "Status", type: "select", options: filterOptions(UNIT_STATUS_MAP).slice(1) },
  ],
  loadCreateOptions: async () => {
    const [properties, unitTypes] = await Promise.all([propertyOptions(), unitTypeCreateOptions()]);
    return { properties, unitTypes };
  },
  newRow: (draft) => ({
    label: draft.label.trim(),
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    unitTypeId: draft.unitTypeId || "",
    floorPlanId: draft.floorPlanId || "",
    status: draft.status || "Vacant",
    bedrooms: Number(draft.bedrooms) || 0,
    bathrooms: Number(draft.bathrooms) || 0,
    sqft: Number(draft.sqft) || null,
    rent: Number(draft.rent) || 0,
    deposit: Number(draft.deposit) || 0,
  }),

  headerMeta: (r) => [r.propertyName, specs(r), r.occupantName, r.rent ? `${currency(r.rent)}/mo` : null].filter(Boolean).join(" · "),

  actions: unitActions,

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Status, rent vs market, vacancy and open work at a glance." }] },
    {
      group: "Unit",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Property, building, type, floor plan and layout." },
        { key: "features", label: "Features & Policies", icon: ListChecks, desc: "Features, included utilities, pets and parking." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "Amenities attached to this unit." },
        { key: "floorplan", label: "Floor Plan", icon: Ruler, desc: "The floor plan for this unit." },
        { key: "media", label: "Photos & Media", icon: ImageIcon, desc: "Photos and media for this unit." },
      ],
    },
    {
      group: "Leasing",
      items: [
        { key: "rent", label: "Rent & Pricing", icon: BadgeDollarSign, desc: "Market rent, fees, concessions and rent history." },
        { key: "charges", label: "Default Charges", icon: Receipt, desc: "Charges added to every new lease on this unit." },
        { key: "occupancy", label: "Occupancy", icon: Users, desc: "Current occupant and occupancy history." },
        { key: "marketing", label: "Availability & Marketing", icon: Megaphone, desc: "Ready state, furnished / mid-term, copy and listings." },
        { key: "revenue", label: "Revenue Status", icon: Ban, desc: "Non-revenue use and offline (down) details." },
      ],
    },
    {
      group: "Access",
      items: [
        { key: "access", label: "Access & Instructions", icon: LockKeyhole, desc: "Entry instructions, lockbox, gate and alarm." },
        { key: "codes", label: "Smart-lock Codes", icon: Smartphone, desc: "Time-boxed access codes for leases, showings and vendors." },
        { key: "keys", label: "Keys", icon: Key, desc: "Physical keys, fobs and who holds them." },
      ],
    },
    {
      group: "Operations",
      items: [
        { key: "maintenance", label: "Maintenance Profile", icon: Wrench, desc: "Finishes, systems and inspection cadence." },
        { key: "meters", label: "Utilities & Meters", icon: Gauge, desc: "Meters, providers and who pays." },
        { key: "assets", label: "Appliances & Assets", icon: Refrigerator, desc: "Appliances and fixed assets with warranties." },
        { key: "workorders", label: "Work Orders", icon: ClipboardPen, desc: "Work orders logged against this unit." },
        { key: "turns", label: "Unit Turns", icon: RefreshCw, desc: "Make-ready turns for this unit." },
        { key: "inspections", label: "Inspections", icon: ClipboardCheck, desc: "Inspections of this unit." },
      ],
    },
    {
      group: "History",
      items: [
        { key: "leases", label: "Leases", icon: FileSignature, desc: "Every lease on this unit." },
        { key: "moves", label: "Move-ins & Move-outs", icon: ArrowLeftRight, desc: "Moves into and out of this unit." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Files and paperwork." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes about this unit." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Recent changes and notes." },
      ],
    },
    {
      group: "Settings",
      items: [
        { key: "custom", label: "Custom Fields", icon: Tags, desc: "Fields defined in Settings → Custom Fields." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and danger zone." },
      ],
    },
  ],
  sections: {
    overview: UnitOverviewSection,
    details: makeFieldsSection(DETAIL_FIELDS),
    features: makeFieldsSection(FEATURE_FIELDS),
    amenities: AmenitiesSection,
    floorplan: FloorPlansSection,
    media: MediaSection,
    rent: UnitRentSection,
    charges: makeMetaListSection({
      field: "defaultCharges",
      singular: "charge",
      icon: Receipt,
      primaryPlaceholder: "e.g. Parking space",
      secondary: { key: "amount", label: "Monthly amount", type: "number", placeholder: "0" },
    }),
    occupancy: UnitOccupancySection,
    marketing: UnitMarketingSection,
    revenue: makeFieldsSection(REVENUE_FIELDS),
    access: makeFieldsSection(ACCESS_FIELDS),
    codes: makeRecordItemsSection({
      kind: "access_code",
      singular: "Access code",
      plural: "Access codes",
      icon: Smartphone,
      emptyDescription: "Issue time-boxed smart-lock codes for a lease, a showing or a vendor visit.",
      defaults: () => ({ code: randomCode(), status: "active", startsOn: todayISO(), assignedType: "Showing" }),
      fields: [
        { key: "name", label: "Label", type: "text", required: true, placeholder: "e.g. Saturday showing" },
        { key: "code", label: "Code", type: "text", required: true, hint: "Auto-generated — edit if your lock needs a set code." },
        { key: "assignedType", label: "Assigned to", type: "select", options: toOptions(["Lease", "Showing", "Vendor", "Staff"]) },
        { key: "assignedTo", label: "Name", type: "text", placeholder: "Who uses this code" },
        { key: "startsOn", label: "Valid from", type: "date" },
        { key: "endsOn", label: "Valid to", type: "date" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
            { value: "revoked", label: "Revoked" },
          ],
        },
        { key: "lockDevice", label: "Lock", type: "text", placeholder: "e.g. Front door" },
      ],
      summary: (r) => {
        const status = r.status === "active" && expired(r) ? "expired" : r.status || "active";
        return {
          title: r.name,
          meta: [
            r.code ? `Code ${r.code}` : null,
            r.assignedType ? `${r.assignedType}${r.assignedTo ? `: ${r.assignedTo}` : ""}` : null,
            r.startsOn || r.endsOn ? `${formatDate(r.startsOn)} – ${formatDate(r.endsOn)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          ...itemBadge(status, ACCESS_CODE_STATUS),
        };
      },
    }),
    keys: makeRecordItemsSection({
      kind: "key",
      singular: "Key",
      plural: "Keys",
      icon: Key,
      defaults: () => ({ status: "In office", keyType: "Unit", copies: 1 }),
      fields: [
        { key: "name", label: "Key tag", type: "text", required: true, placeholder: "e.g. K-4B-1" },
        { key: "keyType", label: "Type", type: "select", options: toOptions(["Unit", "Mailbox", "Storage", "Fob", "Garage remote", "Master"]) },
        { key: "copies", label: "Copies", type: "number", min: 0 },
        { key: "status", label: "Status", type: "select", options: toOptions(Object.keys(KEY_STATUS)) },
        { key: "holder", label: "Held by", type: "text", placeholder: "Office, tenant or vendor name" },
        { key: "startsOn", label: "Checked out", type: "date" },
        { key: "endsOn", label: "Due back", type: "date" },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
      summary: (r) => ({
        title: r.name,
        meta: [r.keyType, r.copies ? `${r.copies} cop${Number(r.copies) === 1 ? "y" : "ies"}` : null, r.holder ? `Held by ${r.holder}` : null]
          .filter(Boolean)
          .join(" · "),
        ...itemBadge(r.status, KEY_STATUS),
        aside: r.endsOn ? `Due ${formatDate(r.endsOn)}` : undefined,
      }),
    }),
    maintenance: makeFieldsSection(MAINTENANCE_FIELDS),
    meters: makeRecordItemsSection({
      kind: "meter",
      singular: "Meter",
      plural: "Meters",
      icon: Gauge,
      defaults: () => ({ status: "Active", utility: "Electric", billedTo: "Tenant" }),
      fields: [
        { key: "name", label: "Meter", type: "text", required: true, placeholder: "e.g. Electric — main" },
        { key: "utility", label: "Utility", type: "select", options: UTILITY_OPTIONS },
        { key: "meterNumber", label: "Meter number", type: "text" },
        { key: "provider", label: "Provider", type: "text" },
        { key: "accountNumber", label: "Account number", type: "text" },
        { key: "billedTo", label: "Billed to", type: "select", options: toOptions(["Tenant", "Owner", "RUBS allocation", "Included in rent"]) },
        { key: "amount", label: "Last reading", type: "number" },
        { key: "startsOn", label: "Read on", type: "date" },
        { key: "status", label: "Status", type: "select", options: toOptions(Object.keys(METER_STATUS)) },
        { key: "location", label: "Location", type: "text" },
      ],
      summary: (r) => ({
        title: r.name,
        meta: [r.utility, r.meterNumber ? `#${r.meterNumber}` : null, r.provider, r.billedTo ? `Billed to ${r.billedTo}` : null]
          .filter(Boolean)
          .join(" · "),
        ...itemBadge(r.status, METER_STATUS),
        aside: r.amount ? `${Number(r.amount).toLocaleString()}${r.startsOn ? ` · ${formatDate(r.startsOn)}` : ""}` : undefined,
      }),
    }),
    assets: makeRecordItemsSection({
      kind: "asset",
      singular: "Asset",
      plural: "Assets",
      icon: Refrigerator,
      defaults: () => ({ status: "In service", category: "Appliance" }),
      fields: [
        { key: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Refrigerator" },
        { key: "category", label: "Category", type: "select", options: toOptions(["Appliance", "HVAC", "Water heater", "Fixture", "Furniture", "Electronics", "Other"]) },
        { key: "brand", label: "Brand", type: "text" },
        { key: "model", label: "Model", type: "text" },
        { key: "serialNumber", label: "Serial number", type: "text" },
        { key: "startsOn", label: "Installed", type: "date" },
        { key: "endsOn", label: "Warranty expires", type: "date" },
        { key: "amount", label: "Purchase cost", type: "currency" },
        { key: "lastServiceOn", label: "Last serviced", type: "date" },
        { key: "nextServiceOn", label: "Next service due", type: "date" },
        { key: "status", label: "Status", type: "select", options: toOptions(Object.keys(ASSET_STATUS)) },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
      summary: (r) => ({
        title: r.name,
        meta: [r.category, [r.brand, r.model].filter(Boolean).join(" "), r.serialNumber ? `SN ${r.serialNumber}` : null]
          .filter(Boolean)
          .join(" · "),
        ...itemBadge(r.status, ASSET_STATUS),
        aside: r.endsOn ? `${expired(r) ? "Warranty ended" : "Warranty to"} ${formatDate(r.endsOn)}` : undefined,
      }),
    }),
    workorders: makeRelatedSection({
      load: (u) => workOrdersLayer.list({ unitId: u.id }),
      tab: "Work Orders",
      plural: "Work orders",
      icon: ClipboardPen,
      emptyDescription: "Use Actions → New work order to open one for this unit.",
      columns: [
        nameCol("Work order", (r) => [r.category, r.vendorName].filter(Boolean).join(" · ")),
        statusCol(MAINTENANCE_STATUS_MAP),
        { key: "priority", header: "Priority", render: (r) => <Badge variant="neutral">{r.priority || "—"}</Badge> },
        tableDate("scheduledDate", "Scheduled"),
        moneyCol("totalCost", "Cost"),
      ],
      footer: (rows) => (
        <p className="text-xs text-text-secondary">
          {rows.length} work orders · {currency(rows.reduce((s, r) => s + (Number(r.totalCost) || 0), 0))} total cost
        </p>
      ),
    }),
    turns: makeRelatedSection({
      load: (u) => unitTurnsLayer.list({ unitId: u.id }),
      tab: "Unit Turns",
      plural: "Unit turns",
      icon: RefreshCw,
      emptyDescription: "Use Actions → Start turn when the unit needs a make-ready.",
      columns: [
        nameCol("Turn", (r) => (r.moveOutDate ? `Move-out ${formatDate(r.moveOutDate)}` : "")),
        statusCol(TURN_STATUS_MAP),
        tableDate("targetReadyDate", "Target ready"),
        moneyCol("budget", "Budget"),
      ],
    }),
    inspections: makeRelatedSection({
      load: (u) => inspectionsLayer.list({ unitId: u.id }),
      tab: "Inspections",
      plural: "Inspections",
      icon: ClipboardCheck,
      emptyDescription: "Use Actions → Schedule inspection to add one.",
      columns: [
        nameCol("Inspection", (r) => [r.kind, r.inspector].filter(Boolean).join(" · ")),
        statusCol(INSPECTION_STATUS_MAP),
        tableDate("inspectionDate", "Date"),
      ],
    }),
    leases: makeRelatedSection({
      load: (u) => leasesLayer.list({ unitId: u.id }),
      tab: "Leases",
      plural: "Leases",
      icon: FileSignature,
      columns: [
        nameCol("Lease", (r) => r.tenantName),
        statusCol(LEASE_STATUS_MAP),
        tableDate("termStart", "Start"),
        tableDate("termEnd", "End"),
        moneyCol("rent", "Rent"),
      ],
    }),
    moves: makeRelatedSection({
      load: (u) => movesLayer.list({ unitId: u.id }),
      tab: "Move-ins & Move-outs",
      plural: "Moves",
      icon: ArrowLeftRight,
      columns: [
        nameCol("Move", (r) => r.tenantName),
        { key: "kind", header: "Type", render: (r) => <Badge variant="neutral">{r.kind === "out" ? "Move-out" : "Move-in"}</Badge> },
        statusCol(MOVE_STATUS_MAP),
        tableDate("moveDate", "Date"),
      ],
    }),
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "unitNotes", placeholder: "Internal notes about this unit…" }),
    activity: ActivitySection,
    custom: makeCustomFieldsSection("units"),
    settings: SettingsSection,
  },
  sectionProps: {
    floorplan: { mode: "single" },
  },
};

export default unitsConfig;
