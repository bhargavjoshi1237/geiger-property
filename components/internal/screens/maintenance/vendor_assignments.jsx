"use client";

import {
  LayoutDashboard,
  SquarePen,
  CalendarClock,
  Flag,
  Clock,
  Settings,
  HardHat,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { vendorAssignmentsData } from "@/lib/supabase/vendor_assignments";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  ASSIGNMENT_STATUS_MAP,
  selectOptions,
  filterOptions,
  formatDate,
} from "./shared";

// Vendor Assignments — vendor ↔ work-order assignments (owns
// `property.vendor_assignments`). Track who is doing what, when, and its status.

const assignmentsConfig = {
  key: "assignment",
  singular: "Assignment",
  plural: "Assignments",
  title: "Vendor Assignments",
  description:
    "Assign vendors to work orders and track them through completion. Manage schedules, workloads, and assignment history in one place.",
  icon: HardHat,
  titleField: "name",
  searchFields: ["name", "vendorName", "workOrderLabel"],
  data: vendorAssignmentsData,

  statusMap: ASSIGNMENT_STATUS_MAP,
  statusFilterOptions: filterOptions(ASSIGNMENT_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Assignment",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {r.workOrderLabel || "No work order set"}
          </span>
        </div>
      ),
    },
    {
      key: "vendorName",
      header: "Vendor",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.vendorName || "Unassigned"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={ASSIGNMENT_STATUS_MAP} />,
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
    const active = rows.filter((r) => r.status === "In progress" || r.status === "Accepted").length;
    const completed = rows.filter((r) => r.status === "Completed").length;
    const vendors = new Set(rows.map((r) => r.vendorName).filter(Boolean)).size;
    return [
      { label: "Assignments", value: String(rows.length), footer: `${active} active` },
      { label: "In progress", value: String(rows.filter((r) => r.status === "In progress").length), footer: "Being worked" },
      { label: "Completed", value: String(completed), footer: "Closed out" },
      { label: "Vendors engaged", value: String(vendors), footer: "Across assignments" },
    ];
  },

  createDraft: { name: "", vendorName: "", status: "Assigned" },
  createFields: [
    { key: "name", label: "Assignment label", type: "text", placeholder: "e.g. HVAC repair — The Beacon 12A" },
    { key: "vendorName", label: "Vendor", type: "text", placeholder: "e.g. Ace Mechanical" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: selectOptions(ASSIGNMENT_STATUS_MAP),
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    vendorName: draft.vendorName || "",
    workOrderLabel: "",
    status: draft.status || "Assigned",
  }),

  headerMeta: (r) =>
    [r.vendorName, r.workOrderLabel, formatDate(r.scheduledDate)].filter((v) => v && v !== "—").join(" · "),

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this assignment." }],
    },
    {
      group: "Assignment",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Vendor and work order." },
        { key: "schedule", label: "Schedule", icon: CalendarClock, desc: "Timing and duration." },
        { key: "status", label: "Status", icon: Flag, desc: "Assignment status." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "notes", label: "Notes", icon: Clock, desc: "Notes and history." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "vendorName", label: "Vendor" },
        { key: "workOrderLabel", label: "Work order" },
        { key: "status", label: "Status" },
        { key: "scheduledDate", label: "Scheduled", format: (v) => formatDate(v) },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Assignment label", type: "text", full: true },
      { key: "vendorName", label: "Vendor", type: "text" },
      { key: "workOrderLabel", label: "Work order", type: "text" },
      { key: "scope", label: "Scope of work", type: "textarea", meta: true },
    ]),
    schedule: makeFieldsSection([
      { key: "scheduledDate", label: "Scheduled date", type: "date" },
      { key: "estimatedHours", label: "Estimated hours", type: "number", meta: true },
      { key: "windowNotes", label: "Arrival window", type: "text", meta: true },
    ]),
    status: makeFieldsSection([
      { key: "status", label: "Status", type: "select", options: selectOptions(ASSIGNMENT_STATUS_MAP) },
      { key: "acceptedAt", label: "Accepted on", type: "date", meta: true },
      { key: "completedAt", label: "Completed on", type: "date", meta: true },
    ]),
    notes: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this assignment…" }),
    settings: makeFieldsSection([
      { key: "status", label: "Status", type: "select", options: selectOptions(ASSIGNMENT_STATUS_MAP) },
    ]),
  },
};

export function VendorAssignmentsScreen() {
  return <EntityListScreen config={assignmentsConfig} />;
}

export default VendorAssignmentsScreen;
