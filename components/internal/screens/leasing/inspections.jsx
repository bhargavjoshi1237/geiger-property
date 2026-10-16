"use client";

import {
  LayoutDashboard,
  Link2,
  DoorClosed,
  Camera,
  StickyNote,
  PenLine,
  ClipboardCheck,
  Clock,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { inspectionsData } from "@/lib/supabase/inspections";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
  makeUploadSection,
} from "@/components/internal/screens/entity/sections/factories";
import { tenantJoinedLoader } from "./joins";
import {
  INSPECTION_STATUS_MAP,
  INSPECTION_TYPE_OPTIONS,
  filterOptions,
  formatDate,
  withinDays,
} from "./shared";

// Inspections — an entity screen over `property.inspections`. Record a unit's
// condition room by room, attach photos, and capture sign-off.

const typeOf = (r) => r?.metadata?.inspectionType || "";

const inspectionsConfig = {
  key: "inspection",
  singular: "Inspection",
  plural: "Inspections",
  title: "Inspections",
  description:
    "Document unit condition at move-in, move-out, and routine visits — room by room, with photos and sign-off — so the record is clear later.",
  icon: ClipboardCheck,
  titleField: "name",
  searchFields: ["name", "unit", "inspector", "tenantName"],
  data: inspectionsData,
  rowsLoader: tenantJoinedLoader(inspectionsData),

  statusMap: INSPECTION_STATUS_MAP,
  statusFilterOptions: filterOptions(INSPECTION_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Inspection",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[typeOf(r), r.unit, r.tenantName].filter(Boolean).join(" · ") || "No unit linked"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={INSPECTION_STATUS_MAP} />,
    },
    {
      key: "inspector",
      header: "Inspector",
      className: "text-sm text-muted-foreground",
      render: (r) => r.inspector || "—",
    },
    {
      key: "inspectionDate",
      header: "Date",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.inspectionDate),
    },
  ],

  stats: (rows) => {
    const complete = rows.filter((r) => r.status === "Complete").length;
    const upcoming = rows.filter((r) => r.status === "Scheduled" && withinDays(r.inspectionDate, 14)).length;
    return [
      { label: "Inspections", value: String(rows.length), footer: `${complete} complete` },
      { label: "Scheduled", value: String(rows.filter((r) => r.status === "Scheduled").length), footer: `${upcoming} in the next 14 days` },
      { label: "In progress", value: String(rows.filter((r) => r.status === "In progress").length), footer: "Underway" },
      { label: "Failed", value: String(rows.filter((r) => r.status === "Failed").length), footer: "Need follow-up" },
    ];
  },

  createDraft: { name: "", unitId: "", inspectionDate: "" },
  createFields: [
    { key: "name", label: "Inspection label", type: "text", placeholder: "e.g. Maple Court · 4B — Move-in" },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet — add them in Units",
    },
    { key: "inspectionDate", label: "Inspection date", type: "date" },
  ],
  loadCreateOptions: async () => ({ units: await unitOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    inspectionDate: draft.inspectionDate || null,
    status: "Scheduled",
  }),

  headerMeta: (r) =>
    [typeOf(r), r.unit, r.inspectionDate ? formatDate(r.inspectionDate) : null].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this inspection." },
        { key: "details", label: "Unit & Parties", icon: Link2, desc: "Type, date, and the linked unit, tenant, and lease." },
      ],
    },
    {
      group: "Report",
      items: [
        { key: "rooms", label: "Rooms & Areas", icon: DoorClosed, desc: "Condition room by room." },
        { key: "photos", label: "Photos", icon: Camera, desc: "Photo evidence of condition." },
        { key: "notes", label: "Condition Notes", icon: StickyNote, desc: "Overall condition notes." },
        { key: "signoff", label: "Sign-off", icon: PenLine, desc: "Inspector and tenant sign-off." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "inspectionType", label: "Type", meta: true },
        { key: "status", label: "Status" },
        { key: "unit", label: "Unit" },
        { key: "tenantName", label: "Tenant" },
        { key: "inspector", label: "Inspector" },
        { key: "inspectionDate", label: "Date", format: (v) => formatDate(v) },
        {
          key: "roomCount",
          label: "Rooms recorded",
          format: (_v, r) => String(Array.isArray(r.metadata?.rooms) ? r.metadata.rooms.length : 0),
        },
        {
          key: "photoCount",
          label: "Photos",
          format: (_v, r) => String(Array.isArray(r.metadata?.photos) ? r.metadata.photos.length : 0),
        },
      ],
    }),
    details: makeFieldsSection([
      { key: "inspectionType", label: "Type", type: "select", meta: true, options: INSPECTION_TYPE_OPTIONS },
      { key: "inspectionDate", label: "Inspection date", type: "date" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions, full: true },
    ]),
    rooms: makeMetaListSection({
      field: "rooms",
      singular: "room",
      icon: DoorClosed,
      primaryPlaceholder: "e.g. Living room",
      secondary: { key: "condition", label: "Condition", placeholder: "e.g. Good" },
    }),
    photos: makeUploadSection({ field: "photos", ownerType: "inspection", singular: "photo" }),
    notes: makeNotesSection({ field: "conditionNotes", placeholder: "Overall condition notes…" }),
    signoff: makeFieldsSection([
      { key: "inspector", label: "Inspector", type: "text" },
      { key: "tenantPresent", label: "Tenant present", type: "switch", meta: true },
      { key: "signedOn", label: "Signed on", type: "date", meta: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: filterOptions(INSPECTION_STATUS_MAP).slice(1),
      },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this inspection…" }),
  },
};

export function InspectionsScreen() {
  return <EntityListScreen config={inspectionsConfig} />;
}

export default InspectionsScreen;
