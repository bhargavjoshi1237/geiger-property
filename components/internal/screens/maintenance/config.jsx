import { Wrench } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { workOrdersData } from "@/lib/supabase/work_orders";
import { workOrderNavGroups, workOrderSections } from "./work_order_sections";
import {
  MAINTENANCE_STATUS_MAP,
  PRIORITY_MAP,
  PRIORITY_OPTIONS,
  filterOptions,
  currency,
} from "./shared";

// Per-area config for the All Maintenance list + editor (row = a maintenance
// record — work order, request, or field visit). Backed by the
// `property.work_orders` data layer; sections composed from the shared factories.

// Shared column set reused by the Work Orders lens.
export const workOrderColumns = [
  {
    key: "name",
    header: "Work order",
    render: (r) => (
      <div className="flex flex-col gap-1">
        <span className="font-medium text-foreground">{r.name}</span>
        <span className="text-xs text-text-secondary">
          {[r.propertyLabel, r.category].filter(Boolean).join(" · ") || "No property set"}
        </span>
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
];

export const maintenanceConfig = {
  key: "workorder",
  singular: "Work order",
  plural: "Maintenance",
  title: "All Maintenance",
  description:
    "Every maintenance record across your portfolio — work orders, tenant requests, and field visits. Search, filter, and open one to dispatch, track, and close it out.",
  icon: Wrench,
  titleField: "name",
  searchFields: ["name", "propertyLabel", "tenantName", "vendorName", "technician"],
  data: workOrdersData,

  statusMap: MAINTENANCE_STATUS_MAP,
  statusFilterOptions: filterOptions(MAINTENANCE_STATUS_MAP),

  columns: workOrderColumns,

  stats: (rows) => {
    const open = rows.filter((r) => r.status === "Open").length;
    const inProgress = rows.filter((r) => r.status === "In progress").length;
    const urgent = rows.filter((r) => r.priority === "Urgent").length;
    const cost = rows.reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
    return [
      { label: "Records", value: String(rows.length), footer: `${open} open` },
      { label: "In progress", value: String(inProgress), footer: "Being worked" },
      { label: "Urgent", value: String(urgent), footer: "Needs attention now" },
      { label: "Total cost", value: currency(cost), footer: "Across all records" },
    ];
  },

  createDraft: { name: "", priority: "Medium", status: "Open" },
  createFields: [
    { key: "name", label: "Summary", type: "text", placeholder: "e.g. Leaking kitchen faucet" },
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
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
    kind: "work_order",
    propertyLabel: "",
    priority: draft.priority || "Medium",
    status: draft.status || "Open",
  }),

  headerMeta: (r) =>
    [r.propertyLabel, r.priority && `${r.priority} priority`, r.vendorName || r.technician]
      .filter(Boolean)
      .join(" · "),

  navGroups: workOrderNavGroups,
  sections: workOrderSections,
};

export default maintenanceConfig;
