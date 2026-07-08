import {
  Boxes,
  LayoutDashboard,
  SquarePen,
  Building2,
  FileText,
  Clock,
  Settings,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { portfoliosData } from "@/lib/supabase/portfolios";
import {
  OverviewSection,
  DetailsSection,
  SettingsSection,
  DocumentsSection,
  ActivitySection,
  PortfolioPropertiesSection,
} from "@/components/internal/screens/entity/shared_sections";

// Per-area config for Portfolios (row = a named collection of properties).

const STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-[#525252]" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

const COLOR_OPTIONS = [
  { value: "emerald", label: "Emerald" },
  { value: "sky", label: "Sky" },
  { value: "violet", label: "Violet" },
  { value: "amber", label: "Amber" },
  { value: "rose", label: "Rose" },
];

export const portfoliosConfig = {
  key: "portfolio",
  singular: "Portfolio",
  plural: "Portfolios",
  title: "Portfolios",
  description:
    "Group properties into portfolios to manage and report on them together. Open a portfolio to assign properties and track performance.",
  icon: Boxes,
  titleField: "name",
  searchFields: ["name", "manager", "region"],
  data: portfoliosData,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Active", label: "Active" },
    { value: "Archived", label: "Archived" },
    { value: "Draft", label: "Draft" },
  ],

  columns: [
    {
      key: "name",
      header: "Portfolio",
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
      key: "manager",
      header: "Manager",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.manager || "—"}</span>
      ),
    },
    {
      key: "region",
      header: "Region",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => r.region || "—",
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active").length;
    const archived = rows.filter((r) => r.status === "Archived").length;
    const regions = new Set(rows.map((r) => r.region).filter(Boolean)).size;
    return [
      { label: "Portfolios", value: String(rows.length), footer: `${active} active` },
      { label: "Active", value: String(active), footer: "Currently managed" },
      { label: "Archived", value: String(archived), footer: "Closed out" },
      { label: "Regions", value: String(regions), footer: "Distinct regions" },
    ];
  },

  createDraft: { name: "", manager: "", status: "Active" },
  createFields: [
    { key: "name", label: "Portfolio name", type: "text", placeholder: "e.g. West Coast Residential" },
    { key: "manager", label: "Manager", type: "text", placeholder: "e.g. Dana Ruiz" },
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
    manager: draft.manager || "",
    status: draft.status || "Active",
  }),

  detailFields: [
    { key: "name", label: "Portfolio name", type: "text", span: 2 },
    { key: "manager", label: "Manager", type: "text" },
    { key: "region", label: "Region", type: "text" },
    { key: "color", label: "Accent color", type: "select", options: COLOR_OPTIONS },
    { key: "description", label: "Description", type: "textarea", span: 2 },
  ],

  headerMeta: (r) => [r.manager, r.region].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this portfolio." }] },
    {
      group: "Portfolio",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Core fields for this portfolio." },
        { key: "properties", label: "Properties", icon: Building2, desc: "Properties in this portfolio." },
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
    properties: PortfolioPropertiesSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default portfoliosConfig;
