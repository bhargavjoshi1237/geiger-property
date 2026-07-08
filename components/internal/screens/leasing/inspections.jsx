"use client";

import { LayoutDashboard, DoorClosed, Camera, StickyNote, PenLine, ClipboardCheck } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { inspectionsData } from "@/lib/supabase/inspections";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { INSPECTION_STATUS_MAP, filterOptions, formatDate } from "./shared";

// Move-in Inspection — an entity screen over `property.inspections`. Record the
// condition of a unit room by room, attach photos, and capture sign-off.

const inspectionsConfig = {
  key: "inspection",
  singular: "Inspection",
  plural: "Inspections",
  title: "Move-in Inspection",
  description:
    "Document unit condition at move-in — room by room, with photos and sign-off — so the record is clear at move-out.",
  icon: ClipboardCheck,
  titleField: "name",
  searchFields: ["name", "unit", "inspector"],
  data: inspectionsData,

  statusMap: INSPECTION_STATUS_MAP,
  statusFilterOptions: filterOptions(INSPECTION_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Inspection",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.unit || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={INSPECTION_STATUS_MAP} />,
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
    const scheduled = rows.filter((r) => r.status === "Scheduled").length;
    const complete = rows.filter((r) => r.status === "Complete").length;
    return [
      { label: "Inspections", value: String(rows.length), footer: `${complete} complete` },
      { label: "Scheduled", value: String(scheduled), footer: "Upcoming" },
      { label: "In progress", value: String(rows.filter((r) => r.status === "In progress").length), footer: "Underway" },
      { label: "Failed", value: String(rows.filter((r) => r.status === "Failed").length), footer: "Need follow-up" },
    ];
  },

  createDraft: { name: "", unit: "", inspectionDate: "" },
  createFields: [
    { key: "name", label: "Inspection label", type: "text", placeholder: "e.g. Maple Court · 4B — Move-in" },
    { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Maple Court · 4B" },
    { key: "inspectionDate", label: "Inspection date", type: "date" },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    unit: draft.unit || "",
    inspectionDate: draft.inspectionDate || null,
    status: "Scheduled",
  }),

  headerMeta: (r) => [r.unit, formatDate(r.inspectionDate)].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this inspection." },
      ],
    },
    {
      group: "Report",
      items: [
        { key: "rooms", label: "Rooms & Areas", icon: DoorClosed, desc: "Condition room by room." },
        { key: "photos", label: "Photos", icon: Camera, desc: "Photo evidence of condition." },
        { key: "notes", label: "Condition Notes", icon: StickyNote, desc: "Overall condition notes." },
        { key: "signoff", label: "Sign-off", icon: PenLine, desc: "Inspector and tenant sign-off." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "unit", label: "Unit" },
        { key: "status", label: "Status" },
        { key: "inspector", label: "Inspector" },
        { key: "inspectionDate", label: "Date", format: (v) => formatDate(v) },
      ],
    }),
    rooms: makeMetaListSection({
      field: "rooms",
      singular: "room",
      icon: DoorClosed,
      primaryPlaceholder: "e.g. Living room",
      secondary: { key: "condition", label: "Condition", placeholder: "e.g. Good" },
    }),
    photos: makeMetaListSection({
      field: "photos",
      singular: "photo",
      icon: Camera,
      primaryPlaceholder: "Photo label",
      secondary: { key: "url", label: "URL", placeholder: "https://…" },
    }),
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
  },
};

export function InspectionsScreen() {
  return <EntityListScreen config={inspectionsConfig} />;
}

export default InspectionsScreen;
