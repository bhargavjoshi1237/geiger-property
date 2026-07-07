import { Building2 } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { buildNavGroups } from "@/components/internal/screens/entity/default_sections";
import { OverviewSection } from "./sections/overview";
import { DetailsSection } from "./sections/details";
import { DocumentsSection } from "./sections/documents";
import { ActivitySection } from "./sections/activity";
import { SettingsSection } from "./sections/settings";

// Per-area config for the Properties list + editor. The reusable Entity engine
// reads this; nothing Properties-specific lives in the engine itself.

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

// TEMP demo rows — held in local state so the editor is clickable before the
// data layer exists. Replaced by lib/supabase/properties.js fetch-on-mount.
const DEMO_ROWS = [
  { id: "p-1001", name: "Maple Court Apartments", address: "120 Maple St", city: "Austin", type: "Multi-family", units: 24, status: "Active" },
  { id: "p-1002", name: "The Beacon on 5th", address: "5th & Vine", city: "Denver", type: "Apartment", units: 48, status: "Active" },
  { id: "p-1003", name: "Riverside Duplex", address: "8 Riverside Dr", city: "Portland", type: "Multi-family", units: 2, status: "Vacant" },
  { id: "p-1004", name: "Oakview Commercial Plaza", address: "300 Oak Ave", city: "Seattle", type: "Commercial", units: 6, status: "Maintenance" },
  { id: "p-1005", name: "Cedar Lane Home", address: "44 Cedar Ln", city: "Boise", type: "Single-family", units: 1, status: "Off-market" },
];

export const propertiesConfig = {
  key: "property",
  singular: "Property",
  plural: "Properties",
  title: "All Properties",
  description:
    "Every building and unit in your portfolio — active, vacant, and off-market. Search, filter, and open any property to manage it.",
  icon: Building2,
  titleField: "name",
  searchFields: ["name", "address", "city"],
  demoRows: DEMO_ROWS,

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
    {
      key: "type",
      label: "Type",
      type: "select",
      options: [
        { value: "Single-family", label: "Single-family" },
        { value: "Multi-family", label: "Multi-family" },
        { value: "Apartment", label: "Apartment" },
        { value: "Condo", label: "Condo" },
        { value: "Commercial", label: "Commercial" },
      ],
    },
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

  headerMeta: (r) =>
    [r.type, [r.address, r.city].filter(Boolean).join(", "), `${r.units ?? 0} units`]
      .filter(Boolean)
      .join(" · "),

  navGroups: buildNavGroups("Property"),
  sections: {
    overview: OverviewSection,
    details: DetailsSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default propertiesConfig;
