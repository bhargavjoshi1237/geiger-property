"use client";

import { LayoutDashboard, ListChecks, ClipboardCheck, Calculator, FileText, LogOut } from "lucide-react";

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

// Move-out — a lens on `property.moves` (kind = "out"). Manage move-out records:
// checklist, final inspection, deposit reconciliation, and closeout.

const moveOutData = lensData(movesLayer, {
  where: { kind: "out" },
  defaults: { kind: "out" },
});

const moveOutConfig = {
  key: "move",
  singular: "Move-out",
  plural: "Move-outs",
  title: "Move-out",
  description:
    "Every move-out across your portfolio — run the checklist, complete the final inspection, and reconcile the deposit.",
  icon: LogOut,
  titleField: "name",
  searchFields: ["name", "unit"],
  data: moveOutData,

  statusMap: MOVE_STATUS_MAP,
  statusFilterOptions: filterOptions(MOVE_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Move-out",
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
      { label: "Move-outs", value: String(rows.length), footer: `${complete} complete` },
      { label: "Scheduled", value: String(scheduled), footer: "Upcoming" },
      { label: "In progress", value: String(rows.filter((r) => r.status === "In progress").length), footer: "Underway" },
      { label: "Complete", value: String(complete), footer: "Moved out" },
    ];
  },

  createDraft: { name: "", unit: "", moveDate: "" },
  createFields: [
    { key: "name", label: "Move-out label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    { key: "unit", label: "Unit", type: "text", placeholder: "e.g. Maple Court · 4B" },
    { key: "moveDate", label: "Move-out date", type: "date" },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    unit: draft.unit || "",
    moveDate: draft.moveDate || null,
    kind: "out",
    status: "Scheduled",
  }),

  headerMeta: (r) => [r.unit, formatDate(r.moveDate)].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this move-out." },
      ],
    },
    {
      group: "Workflow",
      items: [
        { key: "checklist", label: "Checklist", icon: ListChecks, desc: "Tasks to complete for move-out." },
        { key: "finalInspection", label: "Final Inspection", icon: ClipboardCheck, desc: "Closeout walkthrough." },
        { key: "reconciliation", label: "Deposit Reconciliation", icon: Calculator, desc: "Deductions and refund." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Forms, photos, and notices." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "unit", label: "Unit" },
        { key: "status", label: "Status" },
        { key: "moveDate", label: "Move-out date", format: (v) => formatDate(v) },
      ],
    }),
    checklist: makeMetaListSection({
      field: "checklist",
      singular: "task",
      icon: ListChecks,
      primaryPlaceholder: "e.g. Collect keys",
      check: true,
    }),
    finalInspection: makeFieldsSection([
      { key: "inspectionDate", label: "Inspection date", type: "date", meta: true },
      { key: "inspector", label: "Inspector", type: "text", meta: true },
      { key: "conditionSummary", label: "Condition summary", type: "textarea", meta: true, full: true },
    ]),
    reconciliation: makeFieldsSection([
      { key: "depositHeld", label: "Deposit held", type: "number", meta: true },
      { key: "deductionsTotal", label: "Deductions", type: "number", meta: true },
      { key: "refundDue", label: "Refund due", type: "number", meta: true, hint: "Held minus deductions." },
      { key: "forwardingAddress", label: "Forwarding address", type: "textarea", meta: true, full: true },
    ]),
    documents: makeMetaListSection({
      field: "documents",
      singular: "document",
      icon: FileText,
      primaryPlaceholder: "Document name",
    }),
  },
};

export function MoveOutScreen() {
  return <EntityListScreen config={moveOutConfig} />;
}

export default MoveOutScreen;
