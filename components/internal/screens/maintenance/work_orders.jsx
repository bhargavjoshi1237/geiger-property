"use client";

import { ClipboardPen } from "lucide-react";

import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { lensData } from "@/lib/supabase/entity_factory";
import { workOrderNavGroups, workOrderSections } from "./work_order_sections";
import { workOrderColumns } from "./config";
import {
  WORK_ORDER_STATUS_MAP,
  PRIORITY_MAP,
  PRIORITY_OPTIONS,
  filterOptions,
  currency,
} from "./shared";

// Work Orders — a lens on `property.work_orders` (kind = "work_order"). The
// dispatch-and-track workspace; opens the same rich editor as All Maintenance.

const workOrdersLens = lensData(workOrdersLayer, {
  where: { kind: "work_order" },
  defaults: { kind: "work_order" },
});

const workOrdersConfig = {
  key: "workorder",
  singular: "Work order",
  plural: "Work orders",
  title: "Work Orders",
  description:
    "Dispatch, schedule, and track work orders through to completion. Filter by status and priority, assign vendors, and manage costs.",
  icon: ClipboardPen,
  titleField: "name",
  searchFields: ["name", "propertyLabel", "tenantName", "vendorName", "technician"],
  data: workOrdersLens,

  statusMap: WORK_ORDER_STATUS_MAP,
  statusFilterOptions: filterOptions(WORK_ORDER_STATUS_MAP),

  columns: workOrderColumns,

  stats: (rows) => {
    const open = rows.filter((r) => r.status === "Open").length;
    const inProgress = rows.filter((r) => r.status === "In progress").length;
    const urgent = rows.filter((r) => r.priority === "Urgent").length;
    const cost = rows.reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
    return [
      { label: "Work orders", value: String(rows.length), footer: `${open} open` },
      { label: "In progress", value: String(inProgress), footer: "Being worked" },
      { label: "Urgent", value: String(urgent), footer: "Needs attention now" },
      { label: "Total cost", value: currency(cost), footer: "Labor + materials" },
    ];
  },

  createDraft: { name: "", priority: "Medium", status: "Open" },
  createFields: [
    { key: "name", label: "Summary", type: "text", placeholder: "e.g. Replace water heater" },
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

export function WorkOrdersScreen() {
  return <EntityListScreen config={workOrdersConfig} />;
}

export default WorkOrdersScreen;
