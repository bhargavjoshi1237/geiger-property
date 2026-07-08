import {
  Sparkles,
  LayoutDashboard,
  SquarePen,
  Link2,
  FileText,
  Clock,
  Settings,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { amenitiesData } from "@/lib/supabase/amenities";
import {
  OverviewSection,
  DetailsSection,
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  AmenityAttachedSection,
} from "@/components/internal/screens/entity/shared_sections";

// Per-area config for Amenities (row = a reusable amenity definition).

const STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Inactive: { label: "Inactive", variant: "outline", dotClass: "bg-[#525252]" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

const CATEGORY_OPTIONS = [
  { value: "Community", label: "Community" },
  { value: "Unit", label: "Unit" },
  { value: "Building", label: "Building" },
  { value: "Outdoor", label: "Outdoor" },
  { value: "Parking", label: "Parking" },
  { value: "Security", label: "Security" },
  { value: "Utilities", label: "Utilities" },
  { value: "Accessibility", label: "Accessibility" },
];

const SCOPE_OPTIONS = [
  { value: "both", label: "Property & unit" },
  { value: "property", label: "Property only" },
  { value: "unit", label: "Unit only" },
];

const FEE_OPTIONS = [
  { value: "none", label: "Free" },
  { value: "one-time", label: "One-time fee" },
  { value: "monthly", label: "Monthly fee" },
];

const currency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);

const feeLabel = (a) =>
  a.feeType && a.feeType !== "none" ? `${currency(a.feeAmount)} ${a.feeType === "monthly" ? "/mo" : "once"}` : "Free";

export const amenitiesConfig = {
  key: "amenity",
  singular: "Amenity",
  plural: "Amenities",
  title: "Amenities",
  description:
    "Your library of amenities — attach them to properties and units from their Amenities section. Open one to edit its category, scope, and fee.",
  icon: Sparkles,
  titleField: "name",
  searchFields: ["name", "category"],
  data: amenitiesData,

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
      header: "Amenity",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.description || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
    },
    {
      key: "category",
      header: "Category",
      render: (r) => <Badge variant="purple">{r.category}</Badge>,
    },
    {
      key: "fee",
      header: "Fee",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => feeLabel(r),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const categories = new Set(rows.map((r) => r.category).filter(Boolean)).size;
    const paid = rows.filter((r) => r.feeType && r.feeType !== "none").length;
    return [
      { label: "Amenities", value: String(rows.length), footer: `${active} active` },
      { label: "Active", value: String(active), footer: "Available" },
      { label: "Categories", value: String(categories), footer: "Distinct groups" },
      { label: "Paid", value: String(paid), footer: "Carry a fee" },
    ];
  },

  createDraft: { name: "", category: "Community", status: "Active" },
  createFields: [
    { key: "name", label: "Amenity name", type: "text", placeholder: "e.g. In-unit Laundry" },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
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
    category: draft.category || "Community",
    scope: "both",
    status: draft.status || "Active",
  }),

  detailFields: [
    { key: "name", label: "Amenity name", type: "text", span: 2 },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { key: "scope", label: "Applies to", type: "select", options: SCOPE_OPTIONS },
    { key: "icon", label: "Icon (Lucide name)", type: "text" },
    { key: "feeType", label: "Fee", type: "select", options: FEE_OPTIONS },
    { key: "feeAmount", label: "Fee amount", type: "number" },
    { key: "description", label: "Description", type: "textarea", span: 2 },
  ],
  overviewStats: (item) => [
    { label: "Category", value: item.category || "—" },
    { label: "Scope", value: SCOPE_OPTIONS.find((s) => s.value === item.scope)?.label || "—" },
    { label: "Fee", value: feeLabel(item) },
    { label: "Status", value: item.status || "—" },
  ],

  headerMeta: (r) => [r.category, feeLabel(r)].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this amenity." }] },
    {
      group: "Amenity",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Core fields for this amenity." },
        { key: "attached", label: "Attached To", icon: Link2, desc: "Everywhere this amenity is used." },
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
    attached: AmenityAttachedSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default amenitiesConfig;
