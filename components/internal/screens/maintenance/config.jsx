import { Wrench } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { buildNavGroups } from "@/components/internal/screens/entity/default_sections";
import { OverviewSection } from "./sections/overview";
import { DetailsSection } from "./sections/details";
import { DocumentsSection } from "./sections/documents";
import { ActivitySection } from "./sections/activity";
import { SettingsSection } from "./sections/settings";

// Per-area config for the Maintenance list + editor (row = a work order).

const STATUS_MAP = {
  Open: { label: "Open", variant: "info", dotClass: "bg-sky-400" },
  "In progress": { label: "In progress", variant: "purple", dotClass: "bg-violet-300" },
  "On hold": { label: "On hold", variant: "warning", dotClass: "bg-amber-400" },
  Completed: { label: "Completed", variant: "success", dotClass: "bg-emerald-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

const PRIORITY_MAP = {
  Low: { variant: "neutral" },
  Medium: { variant: "info" },
  High: { variant: "warning" },
  Urgent: { variant: "danger" },
};

// TEMP demo rows — replaced by lib/supabase/maintenance.js fetch-on-mount later.
const DEMO_ROWS = [
  { id: "m-3001", name: "Leaking kitchen faucet", property: "Maple Court · 4B", priority: "Medium", status: "Open", assignee: "Unassigned" },
  { id: "m-3002", name: "HVAC not cooling", property: "The Beacon · 12A", priority: "Urgent", status: "In progress", assignee: "Ace Mechanical" },
  { id: "m-3003", name: "Repaint hallway", property: "The Beacon · Common", priority: "Low", status: "On hold", assignee: "Unassigned" },
  { id: "m-3004", name: "Replace smoke detectors", property: "Riverside · A", priority: "High", status: "Completed", assignee: "Jose R." },
  { id: "m-3005", name: "Garage door won't open", property: "Cedar Lane", priority: "High", status: "Open", assignee: "Unassigned" },
];

export const maintenanceConfig = {
  key: "workorder",
  singular: "Work order",
  plural: "Work orders",
  title: "All Maintenance",
  description:
    "Every maintenance request and work order across your portfolio. Search, filter, and open a work order to dispatch, track, and close it out.",
  icon: Wrench,
  titleField: "name",
  searchFields: ["name", "property", "assignee"],
  demoRows: DEMO_ROWS,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Open", label: "Open" },
    { value: "In progress", label: "In progress" },
    { value: "On hold", label: "On hold" },
    { value: "Completed", label: "Completed" },
    { value: "Draft", label: "Draft" },
  ],

  columns: [
    {
      key: "name",
      header: "Work order",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.property}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => (
        <Badge variant={PRIORITY_MAP[r.priority]?.variant || "neutral"}>
          {r.priority}
        </Badge>
      ),
    },
    {
      key: "assignee",
      header: "Assignee",
      align: "right",
      className: "text-right",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.assignee || "Unassigned"}</span>
      ),
    },
  ],

  stats: (rows) => {
    const open = rows.filter((r) => r.status === "Open").length;
    const inProgress = rows.filter((r) => r.status === "In progress").length;
    const urgent = rows.filter((r) => r.priority === "Urgent").length;
    return [
      { label: "Work orders", value: String(rows.length), footer: `${open} open` },
      { label: "In progress", value: String(inProgress), footer: "Being worked" },
      { label: "Urgent", value: String(urgent), footer: "Needs attention now" },
      { label: "Open", value: String(open), footer: "Awaiting dispatch" },
    ];
  },

  createDraft: { name: "", priority: "Medium", status: "Open" },
  createFields: [
    { key: "name", label: "Summary", type: "text", placeholder: "e.g. Leaking kitchen faucet" },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "Low", label: "Low" },
        { value: "Medium", label: "Medium" },
        { value: "High", label: "High" },
        { value: "Urgent", label: "Urgent" },
      ],
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Open", label: "Open" },
        { value: "In progress", label: "In progress" },
        { value: "Draft", label: "Draft" },
      ],
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    property: "",
    priority: draft.priority || "Medium",
    status: draft.status || "Open",
    assignee: "Unassigned",
  }),

  headerMeta: (r) =>
    [r.property, r.priority && `${r.priority} priority`, r.assignee]
      .filter(Boolean)
      .join(" · "),

  navGroups: buildNavGroups("Work order"),
  sections: {
    overview: OverviewSection,
    details: DetailsSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default maintenanceConfig;
