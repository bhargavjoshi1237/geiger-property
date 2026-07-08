"use client";

import { LayoutDashboard, ListChecks, KeyRound, Gauge, ClipboardCheck, FileText, LogIn } from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { movesLayer } from "@/lib/supabase/moves";
import { lensData } from "@/lib/supabase/entity_factory";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
} from "@/components/internal/screens/entity/sections/factories";
import { MOVE_STATUS_MAP, filterOptions, formatDate } from "./shared";

// Move-in — a lens on `property.moves` (kind = "in"). Manage move-in records and
// their workflow: checklist, keys, utilities, and the move-in inspection.

const moveInData = lensData(movesLayer, {
  where: { kind: "in" },
  defaults: { kind: "in" },
});

const moveInConfig = {
  key: "move",
  singular: "Move-in",
  plural: "Move-ins",
  title: "Move-in",
  description:
    "Every move-in across your portfolio — schedule, run the checklist, hand over keys, and complete the walkthrough.",
  icon: LogIn,
  titleField: "name",
  searchFields: ["name", "unit"],
  data: moveInData,

  statusMap: MOVE_STATUS_MAP,
  statusFilterOptions: filterOptions(MOVE_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Move-in",
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
      render: (r) => <StatusPill status={r.status} map={MOVE_STATUS_MAP} />,
    },
    {
      key: "moveDate",
      header: "Date",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.moveDate),
    },
  ],

  stats: (rows) => {
    const scheduled = rows.filter((r) => r.status === "Scheduled").length;
    const complete = rows.filter((r) => r.status === "Complete").length;
    return [
      { label: "Move-ins", value: String(rows.length), footer: `${complete} complete` },
      { label: "Scheduled", value: String(scheduled), footer: "Upcoming" },
      { label: "In progress", value: String(rows.filter((r) => r.status === "In progress").length), footer: "Underway" },
      { label: "Complete", value: String(complete), footer: "Moved in" },
    ];
  },

  createDraft: { name: "", unit: "", moveDate: "" },
  createFields: [
    { key: "name", label: "Move-in label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Maple Court · 4B" },
    { key: "moveDate", label: "Move-in date", type: "date" },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    unit: draft.unit || "",
    moveDate: draft.moveDate || null,
    kind: "in",
    status: "Scheduled",
  }),

  headerMeta: (r) => [r.unit, formatDate(r.moveDate)].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this move-in." },
      ],
    },
    {
      group: "Workflow",
      items: [
        { key: "checklist", label: "Checklist", icon: ListChecks, desc: "Tasks to complete for move-in." },
        { key: "keys", label: "Keys & Access", icon: KeyRound, desc: "Keys, fobs, and access codes." },
        { key: "utilities", label: "Utilities", icon: Gauge, desc: "Utility transfer and readings." },
        { key: "inspection", label: "Inspection", icon: ClipboardCheck, desc: "Move-in walkthrough." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Signed forms and photos." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "unit", label: "Unit" },
        { key: "status", label: "Status" },
        { key: "moveDate", label: "Move-in date", format: (v) => formatDate(v) },
      ],
    }),
    checklist: makeMetaListSection({
      field: "checklist",
      singular: "task",
      icon: ListChecks,
      primaryPlaceholder: "e.g. Confirm renters insurance",
      check: true,
    }),
    keys: makeMetaListSection({
      field: "keys",
      singular: "key or fob",
      icon: KeyRound,
      primaryPlaceholder: "e.g. Front door key",
      secondary: { key: "count", label: "Qty", type: "number", placeholder: "1" },
    }),
    utilities: makeFieldsSection([
      { key: "electricStatus", label: "Electric", type: "text", meta: true, placeholder: "e.g. Transferred" },
      { key: "waterStatus", label: "Water", type: "text", meta: true },
      { key: "gasStatus", label: "Gas", type: "text", meta: true },
      { key: "internetStatus", label: "Internet", type: "text", meta: true },
    ]),
    inspection: makeFieldsSection([
      { key: "inspectionScheduled", label: "Inspection date", type: "date", meta: true },
      { key: "inspector", label: "Inspector", type: "text", meta: true },
      { key: "inspectionComplete", label: "Walkthrough complete", type: "switch", meta: true },
    ]),
    documents: makeMetaListSection({
      field: "documents",
      singular: "document",
      icon: FileText,
      primaryPlaceholder: "Document name",
    }),
  },
};

export function MoveInScreen() {
  return <EntityListScreen config={moveInConfig} />;
}

export default MoveInScreen;
