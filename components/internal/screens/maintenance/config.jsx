import { Wrench } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { workOrdersData } from "@/lib/supabase/work_orders";
import { workOrderNavGroups, workOrderSections } from "./work_order_sections";
import {
  MAINTENANCE_STATUS_MAP,
  CLOSED_WORK_STATUSES,
  WORK_KIND_MAP,
  PRIORITY_MAP,
  PRIORITY_OPTIONS,
  CATEGORY_OPTIONS,
  filterOptions,
  currency,
} from "./shared";

// Config for the merged Work Orders screen over `property.work_orders` — work
// orders (kind work_order), tenant requests (kind request), and field visits
// (is_field) are views over the same rows and open the same editor.

const isOpen = (r) => !CLOSED_WORK_STATUSES.includes(r.status);

export const workOrdersConfig = {
  key: "workorder",
  singular: "Work order",
  plural: "Work orders",
  title: "Work Orders",
  description:
    "Every maintenance job in one place — work orders, tenant requests, and field visits. Triage, dispatch vendors, track costs, and close them out.",
  icon: Wrench,
  titleField: "name",
  searchFields: ["name", "propertyLabel", "tenantName", "vendorName", "technician", "category"],
  data: workOrdersData,

  statusMap: MAINTENANCE_STATUS_MAP,
  statusFilterOptions: filterOptions(MAINTENANCE_STATUS_MAP),

  // New rows take their type/status from the active view.
  views: [
    { value: "all", label: "All", createDefaults: { kind: "work_order", status: "Open" } },
    {
      value: "work_orders",
      label: "Work orders",
      filter: (r) => r.kind !== "request",
      createDefaults: { kind: "work_order", status: "Open" },
    },
    {
      value: "requests",
      label: "Requests",
      filter: (r) => r.kind === "request",
      createDefaults: { kind: "request", status: "Submitted" },
    },
    {
      value: "field",
      label: "Field",
      filter: (r) => Boolean(r.isField),
      createDefaults: { kind: "work_order", status: "Open", isField: true },
    },
    {
      value: "open",
      label: "Open",
      filter: isOpen,
      createDefaults: { kind: "work_order", status: "Open" },
    },
  ],

  columns: [
    {
      key: "name",
      header: "Work order",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.propertyLabel, r.category].filter(Boolean).join(" · ") || "No unit set"}
          </span>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <Badge variant={WORK_KIND_MAP[r.kind]?.variant || "info"}>
            {WORK_KIND_MAP[r.kind]?.label || "Work order"}
          </Badge>
          {r.isField ? <Badge variant="outline">Field</Badge> : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={MAINTENANCE_STATUS_MAP} />,
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => (
        <Badge variant={PRIORITY_MAP[r.priority]?.variant || "neutral"}>{r.priority}</Badge>
      ),
    },
    {
      key: "assignee",
      header: "Assignee",
      align: "right",
      className: "text-right",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.vendorName || r.technician || "Unassigned"}
        </span>
      ),
    },
  ],

  stats: (rows) => {
    const open = rows.filter(isOpen);
    const urgent = open.filter((r) => r.priority === "Urgent" || r.priority === "High").length;
    const triage = rows.filter(
      (r) => r.kind === "request" && (r.status === "Submitted" || r.status === "In review"),
    ).length;
    const cost = rows.reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
    return [
      { label: "Open", value: String(open.length), footer: `${rows.length} total` },
      { label: "High & urgent", value: String(urgent), footer: "Open, needs attention" },
      { label: "Requests to triage", value: String(triage), footer: "Submitted or in review" },
      { label: "Total cost", value: currency(cost), footer: "Labor + materials" },
    ];
  },

  createDraft: { name: "", priority: "Medium", category: "" },
  createFields: [
    { key: "name", label: "Summary", type: "text", placeholder: "e.g. Leaking kitchen faucet" },
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    priority: draft.priority || "Medium",
    category: draft.category || "",
  }),

  headerMeta: (r) =>
    [
      WORK_KIND_MAP[r.kind]?.label,
      r.propertyLabel,
      r.priority && `${r.priority} priority`,
      r.vendorName || r.technician,
    ]
      .filter(Boolean)
      .join(" · "),

  navGroups: workOrderNavGroups,
  sections: workOrderSections,
};

export default workOrdersConfig;
