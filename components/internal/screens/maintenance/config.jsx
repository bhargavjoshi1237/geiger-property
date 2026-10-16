import { Wrench } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { propertyOptions, vendorOptions } from "@/lib/supabase/options";
import { workOrdersData } from "@/lib/supabase/work_orders";
import { workOrderNavGroups, workOrderSections } from "./work_order_sections";
import { workOrderActions } from "./sections/wo_actions";
import {
  MAINTENANCE_STATUS_MAP,
  WORK_KIND_MAP,
  PRIORITY_MAP,
  PRIORITY_OPTIONS,
  CATEGORY_OPTIONS,
  completedDateOf,
  daysBetween,
  daysUntil,
  filterOptions,
  currency,
  formatDate,
  isOpenWorkOrder,
  isOverdueWorkOrder,
  parseDate,
  todayString,
} from "./shared";

// Config for the merged Work Orders screen over `property.work_orders` — work
// orders (kind work_order), tenant requests (kind request), and field visits
// (is_field) are views over the same rows and open the same editor.

const isOpen = isOpenWorkOrder;
const awaitingApproval = (r) => (r.metadata?.approvalStatus ?? r.approvalStatus) === "Pending";

const inThisMonth = (v) => {
  const d = parseDate(v);
  const now = new Date();
  return Boolean(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const BASE_VIEWS = [
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
  { value: "open", label: "Open", filter: isOpen, createDefaults: { kind: "work_order", status: "Open" } },
  { value: "overdue", label: "Overdue", filter: isOverdueWorkOrder, createDefaults: { kind: "work_order", status: "Open" } },
  { value: "approval", label: "Awaiting approval", filter: awaitingApproval, createDefaults: { kind: "work_order", status: "Open" } },
];

export const PRIORITY_FILTER_OPTIONS = [{ value: "all", label: "All priorities" }, ...PRIORITY_OPTIONS];

// Extra toolbar filters (priority / vendor / property) layered onto every view.
const filters = [
  { key: "priority", label: "Priorities", options: PRIORITY_OPTIONS, match: (r, v) => r.priority === v },
  {
    key: "vendor",
    label: "Vendors",
    load: async () => [{ value: "none", label: "Unassigned" }, ...((await vendorOptions()) || [])],
    match: (r, v) => (v === "none" ? !r.vendorId : r.vendorId === v),
  },
  { key: "property", label: "Properties", load: async () => (await propertyOptions()) || [], match: (r, v) => r.propertyId === v },
];

const columns = [
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
        <Badge variant={WORK_KIND_MAP[r.kind]?.variant || "info"}>{WORK_KIND_MAP[r.kind]?.label || "Work order"}</Badge>
        {r.isField ? <Badge variant="outline">Field</Badge> : null}
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={r.status} map={MAINTENANCE_STATUS_MAP} />
        {awaitingApproval(r) ? <Badge variant="warning">Approval</Badge> : null}
      </div>
    ),
  },
  {
    key: "priority",
    header: "Priority",
    render: (r) => <Badge variant={PRIORITY_MAP[r.priority]?.variant || "neutral"}>{r.priority}</Badge>,
  },
  {
    key: "due",
    header: "Due",
    render: (r) => {
      const due = r.metadata?.dueDate || r.dueDate;
      return (
        <span className={isOverdueWorkOrder(r) ? "text-sm text-red-600 dark:text-red-400" : "text-sm text-muted-foreground"}>
          {due ? formatDate(due) : "—"}
        </span>
      );
    },
  },
  {
    key: "assignee",
    header: "Assignee",
    render: (r) => <span className="text-sm text-muted-foreground">{r.vendorName || r.technician || "Unassigned"}</span>,
  },
  {
    key: "cost",
    header: "Cost",
    align: "right",
    className: "text-right tabular-nums text-foreground",
    render: (r) => (Number(r.totalCost) ? currency(r.totalCost) : "—"),
  },
];

function stats(rows) {
  const open = rows.filter(isOpen);
  const overdue = rows.filter(isOverdueWorkOrder).length;
  const pending = rows.filter(awaitingApproval).length;
  const durations = rows
    .filter((r) => r.status === "Completed")
    .map((r) => daysBetween(r.createdAt, completedDateOf(r)))
    .filter((d) => d !== null);
  const avg = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null;
  const mtd = rows
    .filter((r) => inThisMonth(completedDateOf(r) || r.createdAt))
    .reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
  return [
    { label: "Open", value: String(open.length), footer: `${rows.length} total` },
    { label: "Overdue", value: String(overdue), footer: "Open past their due date" },
    { label: "Awaiting approval", value: String(pending), footer: "Owner sign-off pending" },
    {
      label: "Cost MTD",
      value: currency(mtd),
      footer: avg === null ? "No completed jobs yet" : `Avg ${avg.toFixed(1)} days to complete`,
    },
  ];
}

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

  views: BASE_VIEWS,
  filters,

  columns,
  stats,

  createDraft: { name: "", priority: "Medium", category: "", dueDate: "" },
  createFields: [
    { key: "name", label: "Summary", type: "text", placeholder: "e.g. Leaking kitchen faucet" },
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { key: "dueDate", label: "Due date", type: "date" },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    priority: draft.priority || "Medium",
    category: draft.category || "",
    metadata: { dueDate: draft.dueDate || "", reportedOn: todayString(), source: "staff" },
  }),

  headerMeta: (r) => {
    const due = r.metadata?.dueDate;
    const d = daysUntil(due);
    return [
      WORK_KIND_MAP[r.kind]?.label,
      r.propertyLabel,
      r.priority && `${r.priority} priority`,
      r.vendorName || r.technician,
      due && isOpen(r) && (d < 0 ? `${-d}d overdue` : `Due ${formatDate(due)}`),
    ]
      .filter(Boolean)
      .join(" · ");
  },

  navGroups: workOrderNavGroups,
  sections: workOrderSections,
  actions: workOrderActions,
};

export default workOrdersConfig;
