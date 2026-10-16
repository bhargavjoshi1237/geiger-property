"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  CalendarClock,
  ListChecks,
  History,
  Clock,
  CalendarSync,
  Loader2,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { pmSchedulesData } from "@/lib/supabase/pm_schedules";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { propertyOptions, unitOptions, vendorOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  PM_STATUS_MAP,
  PM_FREQUENCY_OPTIONS,
  CATEGORY_OPTIONS,
  advanceByFrequency,
  daysUntil,
  filterOptions,
  selectOptions,
  currency,
  formatDate,
  todayString,
} from "./shared";

// Preventive & Recurring — maintenance schedules (owns `property.pm_schedules`).
// "Create work order now" spawns a work order and advances the next due date.

const isActive = (r) => r.status === "Active";
const isOverdue = (r) => isActive(r) && (daysUntil(r.nextDue) ?? 1) < 0;
const isDueSoon = (r) => {
  const d = daysUntil(r.nextDue);
  return isActive(r) && d !== null && d >= 0 && d <= 14;
};

function dueLabel(r) {
  const d = daysUntil(r.nextDue);
  if (d === null) return "No due date";
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return "Due today";
  return `Due in ${d}d`;
}

const overviewFields = makeOverviewSection({
  fields: [
    { key: "frequency", label: "Frequency" },
    { key: "nextDue", label: "Next due", format: (v) => formatDate(v) },
    { key: "category", label: "Category" },
    { key: "unit", label: "Unit" },
    { key: "propertyName", label: "Property" },
    { key: "vendorName", label: "Vendor" },
    { key: "estimatedCost", label: "Estimated cost", format: (v) => currency(v) },
    { key: "lastGenerated", label: "Last work order", meta: true, format: (v) => formatDate(v) },
  ],
});

// Overview with the generate action on top of the read-only summary.
function ScheduleOverview(props) {
  const { item, onCommit } = props;
  const [busy, setBusy] = useState(false);
  const Summary = overviewFields;

  const createNow = async () => {
    setBusy(true);
    const created = await workOrdersLayer.create({
      id: crypto.randomUUID(),
      name: item.name,
      kind: "work_order",
      status: "Open",
      priority: "Medium",
      category: item.category || "",
      unitId: item.unitId || "",
      propertyId: item.propertyId || "",
      propertyLabel: item.unit || item.propertyName || "",
      vendorId: item.vendorId || "",
      vendorName: item.vendorName || "",
      scheduledDate: item.nextDue || todayString(),
      metadata: { pmScheduleId: item.id, estimatedCost: Number(item.estimatedCost) || 0 },
    });
    setBusy(false);
    if (!created) {
      toast.error("Couldn't create the work order.");
      return;
    }
    const nextDue = advanceByFrequency(item.nextDue, item.frequency);
    const meta = item.metadata || {};
    onCommit({
      nextDue,
      metadata: {
        ...meta,
        lastGenerated: todayString(),
        generated: [
          { id: created.id, label: item.name, date: item.nextDue || todayString() },
          ...(Array.isArray(meta.generated) ? meta.generated : []),
        ].slice(0, 50),
      },
    });
    toast.success(`Work order created — next due ${formatDate(nextDue)}.`);
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Generate work order"
        description={`${dueLabel(item)} · repeats ${String(item.frequency || "Monthly").toLowerCase()}. Creating one opens it in Work Orders and moves the next due date forward.`}
        action={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || item.status !== "Active"}
            onClick={createNow}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Create work order now
          </Button>
        }
      >
        <p className="text-sm text-text-secondary">
          {item.status === "Active"
            ? "Work orders are created when you click — there's no background scheduler yet."
            : "This schedule is paused. Set it to Active to generate work orders."}
        </p>
      </SectionCard>
      <Summary {...props} />
    </div>
  );
}

// Work orders this schedule has spawned (newest first).
function HistorySection({ item }) {
  const list = Array.isArray(item?.metadata?.generated) ? item.metadata.generated : [];
  if (!list.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No work orders generated yet. Use “Create work order now” on the Overview.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
      {list.map((g) => (
        <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="truncate text-sm font-medium text-foreground">{g.label}</span>
          <span className="shrink-0 text-sm text-text-secondary">{formatDate(g.date)}</span>
        </li>
      ))}
    </ul>
  );
}

const preventiveConfig = {
  key: "pmschedule",
  singular: "Schedule",
  plural: "Schedules",
  title: "Preventive & Recurring",
  description:
    "Recurring maintenance on a schedule — filter changes, inspections, seasonal service. Spawn a work order when one comes due.",
  icon: CalendarSync,
  titleField: "name",
  searchFields: ["name", "category", "unit", "propertyName", "vendorName"],
  data: pmSchedulesData,

  statusMap: PM_STATUS_MAP,
  statusFilterOptions: filterOptions(PM_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    { value: "due", label: "Due ≤14 days", filter: isDueSoon },
    { value: "overdue", label: "Overdue", filter: isOverdue },
    { value: "paused", label: "Paused", filter: (r) => r.status === "Paused" },
  ],

  columns: [
    {
      key: "name",
      header: "Schedule",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.unit || r.propertyName, r.category].filter(Boolean).join(" · ") || "No location set"}
          </span>
        </div>
      ),
    },
    {
      key: "frequency",
      header: "Frequency",
      render: (r) => <span className="text-sm text-muted-foreground">{r.frequency || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={PM_STATUS_MAP} />,
    },
    {
      key: "nextDue",
      header: "Next due",
      align: "right",
      className: "text-right",
      render: (r) => (
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-sm text-foreground">{formatDate(r.nextDue)}</span>
          <span className={isOverdue(r) ? "text-xs text-red-600 dark:text-red-400" : "text-xs text-text-secondary"}>
            {r.status === "Paused" ? "Paused" : dueLabel(r)}
          </span>
        </div>
      ),
    },
  ],

  stats: (rows) => {
    const active = rows.filter(isActive);
    const annual = { Weekly: 52, Monthly: 12, Quarterly: 4, "Semi-annually": 2, Annually: 1 };
    const yearly = active.reduce(
      (s, r) => s + (Number(r.estimatedCost) || 0) * (annual[r.frequency] || 12),
      0,
    );
    return [
      { label: "Active schedules", value: String(active.length), footer: `${rows.length} total` },
      { label: "Due ≤14 days", value: String(rows.filter(isDueSoon).length), footer: "Coming up" },
      { label: "Overdue", value: String(rows.filter(isOverdue).length), footer: "Past next due date" },
      { label: "Est. annual cost", value: currency(yearly), footer: "Active schedules" },
    ];
  },

  createDraft: { name: "", frequency: "Monthly", nextDue: "", category: "" },
  createFields: [
    { key: "name", label: "Task", type: "text", placeholder: "e.g. Replace HVAC filters" },
    { key: "frequency", label: "Frequency", type: "select", options: PM_FREQUENCY_OPTIONS },
    { key: "nextDue", label: "First due date", type: "date" },
    { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    frequency: draft.frequency || "Monthly",
    nextDue: draft.nextDue || todayString(),
    category: draft.category || "",
    status: "Active",
  }),

  headerMeta: (r) =>
    [r.frequency, r.unit || r.propertyName, r.status === "Active" ? dueLabel(r) : null]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Next due date and the generate action." },
      ],
    },
    {
      group: "Schedule",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Task, category, location, and vendor." },
        { key: "recurrence", label: "Recurrence", icon: CalendarClock, desc: "How often it repeats and when it's next due." },
        { key: "steps", label: "Task Steps", icon: ListChecks, desc: "What the technician should do each time." },
      ],
    },
    {
      group: "Records",
      items: [
        { key: "history", label: "Generated Work Orders", icon: History, desc: "Work orders created from this schedule." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: ScheduleOverview,
    details: makeFieldsSection([
      { key: "name", label: "Task", type: "text", full: true },
      { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
      { key: "estimatedCost", label: "Estimated cost", type: "number" },
      { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "vendorId", label: "Vendor", type: "relation", load: vendorOptions, displayKey: "vendorName" },
      { key: "instructions", label: "Instructions", type: "textarea", meta: true },
    ]),
    recurrence: makeFieldsSection([
      { key: "frequency", label: "Frequency", type: "select", options: PM_FREQUENCY_OPTIONS },
      { key: "nextDue", label: "Next due", type: "date" },
      { key: "status", label: "Status", type: "select", options: selectOptions(PM_STATUS_MAP) },
      { key: "season", label: "Season / window", type: "text", meta: true, placeholder: "e.g. Before winter" },
    ]),
    steps: makeMetaListSection({
      field: "steps",
      singular: "step",
      icon: ListChecks,
      primaryPlaceholder: "e.g. Check refrigerant levels",
    }),
    history: HistorySection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this schedule…" }),
  },
};

export function PreventiveScreen() {
  return <EntityListScreen config={preventiveConfig} />;
}

export default PreventiveScreen;
