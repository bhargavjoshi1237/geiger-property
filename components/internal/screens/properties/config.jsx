import {
  Banknote,
  Briefcase,
  Building2,
  ClipboardCheck,
  ClipboardPen,
  Clock,
  Contact,
  DoorOpen,
  FileSignature,
  FileText,
  Gauge,
  Handshake,
  HardHat,
  Home,
  Image as ImageIcon,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Percent,
  Ruler,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  SquarePen,
  StickyNote,
  Tags,
  Truck,
  Warehouse,
  Wrench,
  Users,
  BookOpen,
} from "lucide-react";
import { makeLedgerSection } from "@/components/internal/screens/accounting/ledger_section";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@geiger/ui/badge";
import { propertiesData } from "@/lib/supabase/properties";
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
  COMMERCIAL_TYPES,
  PROPERTY_STATUS_FILTER_OPTIONS,
  PROPERTY_STATUS_MAP,
  PROPERTY_TYPE_MAP,
  PROPERTY_TYPE_OPTIONS,
  currency,
  hasAssociation,
  pct,
} from "./constants";
import { loadPropertyRows } from "./joins";
import { assignOwnerAction, lifecycleActions, makeAddUnitsAction, syncUnitCountAction } from "./actions";
import {
  AssetsSection,
  ComplianceSection,
  InsuranceSection,
  KeysSection,
  MetersSection,
  PreferredVendorsSection,
} from "./record_kinds";
import { PropertyOverviewSection } from "./sections/overview";
import { OwnershipSection } from "./sections/owners";
import {
  PropertyBuildingsSection,
  PropertyLeasesSection,
  PropertyListingsSection,
  PropertyUnitsSection,
  PropertyWorkOrdersSection,
} from "./sections/related";
import {
  AssociationSection,
  BankingSection,
  ConstructionSection,
  ContactsSection,
  LeasingPolicySection,
  MaintenancePolicySection,
  ManagementSection,
  MarketingSection,
  PropertyDetailsSection,
  RentMarketSection,
  RentPolicySection,
} from "./sections/property_tabs";
import { makeInternalNotesSection } from "./sections/form_cards";
import { OccupancyBar } from "./sections/overview_parts";

// Per-area config for the Properties list + editor, driven by the reusable
// Entity engine. Sections live in ./sections, record-item kinds in ./record_kinds.

const addUnits = makeAddUnitsAction({ scope: "property" });

export const propertiesConfig = {
  key: "property",
  singular: "Property",
  plural: "Properties",
  title: "Properties",
  description:
    "Every property in your portfolio — active, vacant, and off-market. Search, filter, and open any property to manage units, owners, money, and compliance.",
  icon: Building2,
  titleField: "name",
  searchFields: ["name", "address", "city", "state", "zip", "type", "portfolioName"],
  data: propertiesData,
  rowsLoader: loadPropertyRows,

  statusMap: PROPERTY_STATUS_MAP,
  statusFilterOptions: PROPERTY_STATUS_FILTER_OPTIONS,

  views: [
    { value: "all", label: "All" },
    { value: "residential", label: "Residential", filter: (r) => !COMMERCIAL_TYPES.includes(r.type) },
    { value: "commercial", label: "Commercial & mixed", filter: (r) => COMMERCIAL_TYPES.includes(r.type), createDefaults: { type: "Commercial" } },
    { value: "association", label: "Associations", filter: hasAssociation },
    { value: "archived", label: "Archived", filter: (r) => r.status === "Archived" },
  ],

  columns: [
    {
      key: "name",
      header: "Property",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.address, r.city, r.state].filter(Boolean).join(", ") || "No address yet"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={PROPERTY_STATUS_MAP} />,
    },
    {
      key: "type",
      header: "Type",
      render: (r) => <Badge variant={PROPERTY_TYPE_MAP[r.type]?.variant || "neutral"}>{r.type}</Badge>,
    },
    {
      key: "portfolio",
      header: "Portfolio",
      render: (r) => <span className="text-sm text-muted-foreground">{r.portfolioName || "—"}</span>,
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground dark:text-white",
      render: (r) => (r.unitCount ?? r.units ?? 0).toLocaleString(),
    },
    {
      key: "occupancy",
      header: "Occupancy",
      render: (r) => (r.unitCount ? <OccupancyBar value={r.occupancy} /> : <span className="text-sm text-text-tertiary">—</span>),
    },
    {
      key: "rentRoll",
      header: "Rent roll",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => (r.rentRoll ? currency(r.rentRoll) : "—"),
    },
  ],

  stats: (rows) => {
    const live = rows.filter((r) => r.status !== "Archived");
    const units = live.reduce((s, r) => s + (Number(r.unitCount ?? r.units) || 0), 0);
    const occupied = live.reduce((s, r) => s + (Number(r.occupiedCount) || 0), 0);
    const rentRoll = live.reduce((s, r) => s + (Number(r.rentRoll) || 0), 0);
    const active = live.filter((r) => r.status === "Active").length;
    return [
      { label: "Properties", value: String(live.length), footer: `${active} active` },
      { label: "Units", value: units.toLocaleString(), footer: `${(units - occupied).toLocaleString()} not occupied` },
      { label: "Occupancy", value: pct(units ? (occupied / units) * 100 : 0), footer: `${occupied.toLocaleString()} occupied units` },
      { label: "Rent roll", value: currency(rentRoll), footer: "Monthly, occupied units" },
    ];
  },

  createDraft: { name: "", type: "Multi-family", address: "", city: "", status: "Draft" },
  createFields: [
    { key: "name", label: "Property name", type: "text", placeholder: "e.g. Maple Court Apartments" },
    { key: "type", label: "Type", type: "select", options: PROPERTY_TYPE_OPTIONS },
    { key: "address", label: "Street address", type: "text", placeholder: "e.g. 120 Maple Ave" },
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
    address: draft.address || "",
    city: draft.city || "",
    type: draft.type,
    units: 0,
    status: draft.status || "Draft",
  }),

  headerMeta: (r) =>
    [
      r.type,
      [r.address, r.city, r.state].filter(Boolean).join(", "),
      `${r.unitCount ?? r.units ?? 0} units`,
      r.portfolioName,
    ]
      .filter(Boolean)
      .join(" · "),

  actions: (item) => [
    addUnits(item),
    assignOwnerAction,
    syncUnitCountAction,
    ...lifecycleActions({ singular: "Property" }),
  ],

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Live KPIs and what needs follow-up." }] },
    {
      group: "Property",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Identity, address, size, parcel and cover photo." },
        { key: "construction", label: "Construction & Systems", icon: Wrench, desc: "Structure and building systems." },
        { key: "units", label: "Units", icon: DoorOpen, desc: "Units on this property." },
        { key: "buildings", label: "Buildings", icon: Warehouse, desc: "Buildings and blocks on this property." },
        { key: "amenities", label: "Amenities", icon: Sparkles, desc: "Amenities attached to this property." },
        { key: "floorplans", label: "Floor Plans", icon: Ruler, desc: "Floor plans linked to this property." },
        { key: "media", label: "Photos & Media", icon: ImageIcon, desc: "Photos and media for this property." },
        { key: "marketing", label: "Marketing", icon: Megaphone, desc: "Listing defaults and leasing office details." },
      ],
    },
    {
      group: "Money",
      items: [
        { key: "ledger", label: "Ledger", icon: BookOpen, desc: "Every posting tagged to this property." },
        { key: "banking", label: "Banking & Accounting", icon: Landmark, desc: "Bank accounts, accounting basis and default GL accounts." },
        { key: "rentMarket", label: "Rent & Market", icon: Banknote, desc: "Pricing, rent regulation and utility billing." },
        { key: "rentPolicy", label: "Rent & Payment Rules", icon: Percent, desc: "Due dates, late fees and payment methods — inherited from company defaults unless overridden." },
        { key: "leasingPolicy", label: "Leasing & Deposits", icon: FileSignature, desc: "Leasing defaults and deposit handling for this property." },
      ],
    },
    {
      group: "People",
      items: [
        { key: "owners", label: "Owners", icon: Briefcase, desc: "Who owns this property and their shares." },
        { key: "management", label: "Management Agreement", icon: Handshake, desc: "Agreement terms and management fees." },
        { key: "contacts", label: "Team & Contacts", icon: Contact, desc: "Assigned staff and on-site contacts." },
        { key: "vendors", label: "Preferred Vendors", icon: Truck, desc: "Go-to vendors by trade." },
        { key: "association", label: "Association", icon: Users, desc: "HOA / condo association details.", showIf: hasAssociation },
      ],
    },
    {
      group: "Operations",
      items: [
        { key: "leases", label: "Leases", icon: FileSignature, desc: "Leases on this property." },
        { key: "workorders", label: "Work Orders", icon: ClipboardPen, desc: "Maintenance on this property." },
        { key: "listings", label: "Listings", icon: Home, desc: "Marketing listings for vacancies." },
        { key: "maintenancePolicy", label: "Maintenance Rules", icon: Scale, desc: "Approval limits and entry rules." },
        { key: "assets", label: "Assets", icon: HardHat, desc: "Equipment, warranties and service schedules." },
        { key: "keys", label: "Keys & Access", icon: KeyRound, desc: "Keys, fobs and codes." },
        { key: "meters", label: "Meters & Utilities", icon: Gauge, desc: "Utility meters, providers and who pays." },
      ],
    },
    {
      group: "Risk & compliance",
      items: [
        { key: "insurance", label: "Insurance", icon: ShieldCheck, desc: "Policies, coverage and renewals." },
        { key: "compliance", label: "Compliance", icon: ClipboardCheck, desc: "Permits, certifications and inspections." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Files and paperwork." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes for your team." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and note on this property." },
        { key: "custom", label: "Custom Fields", icon: Tags, desc: "Fields defined in Settings → Custom Fields." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and danger zone." },
      ],
    },
  ],
  sections: {
    ledger: makeLedgerSection({ scope: "property" }),
    overview: PropertyOverviewSection,
    details: PropertyDetailsSection,
    construction: ConstructionSection,
    units: PropertyUnitsSection,
    buildings: PropertyBuildingsSection,
    amenities: AmenitiesSection,
    floorplans: FloorPlansSection,
    media: MediaSection,
    marketing: MarketingSection,
    banking: BankingSection,
    rentMarket: RentMarketSection,
    rentPolicy: RentPolicySection,
    leasingPolicy: LeasingPolicySection,
    owners: OwnershipSection,
    management: ManagementSection,
    contacts: ContactsSection,
    vendors: PreferredVendorsSection,
    association: AssociationSection,
    leases: PropertyLeasesSection,
    workorders: PropertyWorkOrdersSection,
    listings: PropertyListingsSection,
    maintenancePolicy: MaintenancePolicySection,
    assets: AssetsSection,
    keys: KeysSection,
    meters: MetersSection,
    insurance: InsuranceSection,
    compliance: ComplianceSection,
    documents: DocumentsSection,
    notes: makeInternalNotesSection(),
    activity: ActivitySection,
    custom: makeCustomFieldsSection("properties"),
    settings: SettingsSection,
  },
  sectionProps: {
    floorplans: { mode: "multi" },
  },
};

export default propertiesConfig;
