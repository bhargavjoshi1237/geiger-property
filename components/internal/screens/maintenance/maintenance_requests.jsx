"use client";

import {
  LayoutDashboard,
  SquarePen,
  UserRound,
  CheckCircle2,
  Camera,
  Clock,
  Settings,
  Hammer,
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
  REQUEST_STATUS_MAP,
  PRIORITY_MAP,
  PRIORITY_OPTIONS,
  CATEGORY_OPTIONS,
  selectOptions,
  filterOptions,
  formatDate,
} from "./shared";

// Maintenance Requests — a lens on `property.work_orders` (kind = "request").
// Tenant/staff-submitted requests move through their lifecycle here; approving a
// request converts it to a work order (flip status to "Approved" → dispatch).

const requestsLens = lensData(workOrdersLayer, {
  where: { kind: "request" },
  defaults: { kind: "request", status: "Submitted" },
});

const requestsConfig = {
  key: "request",
  singular: "Request",
  plural: "Requests",
  title: "Maintenance Requests",
  description:
    "Requests submitted by tenants and staff. Triage, approve or reject, and convert approved requests into scheduled work orders.",
  icon: Hammer,
  titleField: "name",
  searchFields: ["name", "propertyLabel", "tenantName", "category"],
  data: requestsLens,

  statusMap: REQUEST_STATUS_MAP,
  statusFilterOptions: filterOptions(REQUEST_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Request",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.propertyLabel, r.tenantName].filter(Boolean).join(" · ") || "No property set"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={REQUEST_STATUS_MAP} />,
    },
    {
      key: "priority",
      header: "Priority",
      render: (r) => (
        <Badge variant={PRIORITY_MAP[r.priority]?.variant || "neutral"}>{r.priority}</Badge>
      ),
    },
    {
      key: "category",
      header: "Category",
      align: "right",
      className: "text-right",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.category || "—"}</span>
      ),
    },
  ],

  stats: (rows) => {
    const submitted = rows.filter((r) => r.status === "Submitted").length;
    const review = rows.filter((r) => r.status === "In review").length;
    const approved = rows.filter((r) => r.status === "Approved").length;
    return [
      { label: "Requests", value: String(rows.length), footer: `${submitted} new` },
      { label: "In review", value: String(review), footer: "Being triaged" },
      { label: "Approved", value: String(approved), footer: "Ready to dispatch" },
      { label: "Urgent", value: String(rows.filter((r) => r.priority === "Urgent").length), footer: "Escalated" },
    ];
  },

  createDraft: { name: "", priority: "Medium", status: "Submitted" },
  createFields: [
    { key: "name", label: "Request summary", type: "text", placeholder: "e.g. Bathroom sink clogged" },
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    kind: "request",
    propertyLabel: "",
    priority: draft.priority || "Medium",
    status: draft.status || "Submitted",
  }),

  headerMeta: (r) =>
    [r.propertyLabel, r.tenantName, r.category].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this request." }],
    },
    {
      group: "Request",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "What was reported." },
        { key: "requester", label: "Requester", icon: UserRound, desc: "Who submitted it and how to reach them." },
        { key: "approval", label: "Approval", icon: CheckCircle2, desc: "Triage, approve, reject, or convert." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "photos", label: "Photos", icon: Camera, desc: "Images attached to the request." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "propertyLabel", label: "Property & Unit" },
        { key: "tenantName", label: "Tenant" },
        { key: "category", label: "Category" },
        { key: "priority", label: "Priority" },
        { key: "status", label: "Status" },
        { key: "submittedDate", label: "Submitted", format: (v) => formatDate(v) },
      ],
      note: "Approve a request to convert it into a scheduled work order.",
    }),
    details: makeFieldsSection([
      { key: "name", label: "Request summary", type: "text", full: true },
      { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
      { key: "propertyLabel", label: "Property & Unit", type: "text" },
      { key: "tenantName", label: "Tenant", type: "text" },
      { key: "description", label: "Description", type: "textarea", meta: true },
    ]),
    requester: makeFieldsSection([
      { key: "requestedBy", label: "Requested by", type: "text", meta: true },
      { key: "requesterContact", label: "Contact", type: "text", meta: true },
      { key: "submittedDate", label: "Submitted date", type: "date", meta: true },
      { key: "preferredTime", label: "Preferred time", type: "text", meta: true },
    ]),
    approval: makeFieldsSection([
      { key: "status", label: "Status", type: "select", options: selectOptions(REQUEST_STATUS_MAP) },
      { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
      { key: "approvedBy", label: "Reviewed by", type: "text", meta: true },
      { key: "resolutionNotes", label: "Decision notes", type: "textarea", meta: true },
    ]),
    photos: makeMetaListSection({
      field: "photos",
      singular: "photo",
      icon: Camera,
      primaryPlaceholder: "Photo name or URL",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this request…" }),
    settings: makeFieldsSection([
      { key: "status", label: "Status", type: "select", options: selectOptions(REQUEST_STATUS_MAP) },
      { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
    ]),
  },
};

export function MaintenanceRequestsScreen() {
  return <EntityListScreen config={requestsConfig} />;
}

export default MaintenanceRequestsScreen;
