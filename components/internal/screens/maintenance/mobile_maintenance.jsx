"use client";

import {
  LayoutDashboard,
  SquarePen,
  UserRound,
  CalendarClock,
  ListChecks,
  ClipboardCheck,
  FileText,
  RefreshCw,
  Clock,
  Smartphone,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { lensData } from "@/lib/supabase/entity_factory";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  WORK_ORDER_STATUS_MAP,
  PRIORITY_MAP,
  PRIORITY_OPTIONS,
  selectOptions,
  filterOptions,
  formatDate,
} from "./shared";

// Mobile Maintenance — a lens on `property.work_orders` (is_field = true). The
// field-technician workspace: technician assignments, checklists, inspections,
// offline-sync status, and field reporting.

const fieldLens = lensData(workOrdersLayer, {
  where: { isField: true },
  defaults: { isField: true, kind: "work_order" },
});

const SYNC_OPTIONS = [
  { value: "Synced", label: "Synced" },
  { value: "Pending sync", label: "Pending sync" },
  { value: "Offline", label: "Offline" },
];

const mobileConfig = {
  key: "fieldjob",
  singular: "Field job",
  plural: "Field jobs",
  title: "Mobile Maintenance",
  description:
    "Field work for on-site technicians — assignments, checklists, inspections, and reports. Track offline-sync status and completion from anywhere.",
  icon: Smartphone,
  titleField: "name",
  searchFields: ["name", "propertyLabel", "technician"],
  data: fieldLens,

  statusMap: WORK_ORDER_STATUS_MAP,
  statusFilterOptions: filterOptions(WORK_ORDER_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Field job",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.propertyLabel, r.technician].filter(Boolean).join(" · ") || "Unassigned"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={WORK_ORDER_STATUS_MAP} />,
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => (
        <Badge variant={PRIORITY_MAP[r.priority]?.variant || "neutral"}>{r.priority}</Badge>
      ),
    },
    {
      key: "scheduledDate",
      header: "Scheduled",
      align: "right",
      className: "text-right",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{formatDate(r.scheduledDate)}</span>
      ),
    },
  ],

  stats: (rows) => {
    const assigned = rows.filter((r) => r.technician).length;
    const inProgress = rows.filter((r) => r.status === "In progress").length;
    const pendingSync = rows.filter((r) => r.metadata?.syncStatus === "Pending sync").length;
    return [
      { label: "Field jobs", value: String(rows.length), footer: `${assigned} assigned` },
      { label: "In progress", value: String(inProgress), footer: "On site now" },
      { label: "Completed", value: String(rows.filter((r) => r.status === "Completed").length), footer: "Closed out" },
      { label: "Pending sync", value: String(pendingSync), footer: "Awaiting upload" },
    ];
  },

  createDraft: { name: "", priority: "Medium", status: "Open" },
  createFields: [
    { key: "name", label: "Field job", type: "text", placeholder: "e.g. Unit turn inspection — Cedar Lane" },
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    kind: "work_order",
    isField: true,
    propertyLabel: "",
    priority: draft.priority || "Medium",
    status: draft.status || "Open",
  }),

  headerMeta: (r) =>
    [r.technician, r.propertyLabel, formatDate(r.scheduledDate)].filter((v) => v && v !== "—").join(" · "),

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this field job." }],
    },
    {
      group: "Field",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "What and where." },
        { key: "technician", label: "Technician", icon: UserRound, desc: "Who is on site." },
        { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "When it's planned." },
      ],
    },
    {
      group: "On site",
      items: [
        { key: "checklist", label: "Checklist", icon: ListChecks, desc: "Tasks to complete on site." },
        { key: "inspection", label: "Inspection", icon: ClipboardCheck, desc: "Inspection findings." },
        { key: "fieldReport", label: "Field report", icon: FileText, desc: "The technician's report." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "sync", label: "Sync", icon: RefreshCw, desc: "Offline sync status." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "propertyLabel", label: "Property & Unit" },
        { key: "technician", label: "Technician" },
        { key: "priority", label: "Priority" },
        { key: "status", label: "Status" },
        { key: "scheduledDate", label: "Scheduled", format: (v) => formatDate(v) },
        { key: "syncStatus", label: "Sync status" },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Field job", type: "text", full: true },
      { key: "propertyLabel", label: "Property & Unit", type: "text" },
      { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
      { key: "status", label: "Status", type: "select", options: selectOptions(WORK_ORDER_STATUS_MAP) },
      { key: "description", label: "Description", type: "textarea", meta: true },
    ]),
    technician: makeFieldsSection([
      { key: "technician", label: "Assigned technician", type: "text" },
      { key: "technicianPhone", label: "Technician phone", type: "text", meta: true },
      { key: "crew", label: "Crew", type: "text", meta: true },
    ]),
    schedule: makeFieldsSection([
      { key: "scheduledDate", label: "Scheduled date", type: "date" },
      { key: "arrivalWindow", label: "Arrival window", type: "text", meta: true },
      { key: "estimatedHours", label: "Estimated hours", type: "number", meta: true },
    ]),
    checklist: makeMetaListSection({
      field: "checklist",
      singular: "task",
      icon: ListChecks,
      primaryPlaceholder: "e.g. Photograph unit condition",
      check: true,
    }),
    inspection: makeMetaListSection({
      field: "inspectionItems",
      singular: "inspection item",
      icon: ClipboardCheck,
      primaryPlaceholder: "e.g. Smoke detectors operational",
      check: true,
    }),
    fieldReport: makeNotesSection({ field: "fieldReport", placeholder: "The technician's on-site report…" }),
    sync: makeFieldsSection([
      { key: "syncStatus", label: "Sync status", type: "select", meta: true, options: SYNC_OPTIONS },
      { key: "lastSyncedAt", label: "Last synced", type: "date", meta: true },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this field job…" }),
  },
};

export function MobileMaintenanceScreen() {
  return <EntityListScreen config={mobileConfig} />;
}

export default MobileMaintenanceScreen;
