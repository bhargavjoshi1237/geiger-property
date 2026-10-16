"use client";

import {
  LayoutDashboard,
  Link2,
  ListChecks,
  KeyRound,
  Gauge,
  ClipboardCheck,
  Calculator,
  FileText,
  Clock,
  ArrowLeftRight,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { movesData } from "@/lib/supabase/moves";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeEitherSection, makeGatedSection } from "./sections";
import { tenantJoinedLoader } from "./joins";
import {
  MOVE_STATUS_MAP,
  MOVE_KIND_OPTIONS,
  filterOptions,
  currency,
  formatDate,
  withinDays,
} from "./shared";

// Move-ins & Move-outs — one entity screen over `property.moves`; `kind` ("in" /
// "out") picks the view and which workflow tabs apply to a record.

const isOut = (r) => r?.kind === "out";
const kindLabel = (r) => (isOut(r) ? "Move-out" : "Move-in");
const deductionsOf = (r) => Number(r?.metadata?.deductionsTotal) || 0;
const heldOf = (r) => Number(r?.metadata?.depositHeld) || 0;

const moveInInspection = makeFieldsSection([
  { key: "inspectionScheduled", label: "Inspection date", type: "date", meta: true },
  { key: "inspector", label: "Inspector", type: "text", meta: true },
  { key: "inspectionComplete", label: "Walkthrough complete", type: "switch", meta: true },
  { key: "conditionSummary", label: "Condition summary", type: "textarea", meta: true, full: true },
]);

const finalInspection = makeFieldsSection([
  { key: "inspectionDate", label: "Inspection date", type: "date", meta: true },
  { key: "inspector", label: "Inspector", type: "text", meta: true },
  { key: "inspectionComplete", label: "Walkthrough complete", type: "switch", meta: true },
  { key: "conditionSummary", label: "Condition summary", type: "textarea", meta: true, full: true },
]);

const keysSection = makeMetaListSection({
  field: "keys",
  singular: "key or fob",
  icon: KeyRound,
  primaryPlaceholder: "e.g. Front door key",
  secondary: { key: "count", label: "Qty", type: "number", placeholder: "1" },
});

const utilitiesSection = makeFieldsSection([
  { key: "electricStatus", label: "Electric", type: "text", meta: true, placeholder: "e.g. Transferred" },
  { key: "waterStatus", label: "Water", type: "text", meta: true },
  { key: "gasStatus", label: "Gas", type: "text", meta: true },
  { key: "internetStatus", label: "Internet", type: "text", meta: true },
]);

const reconciliationSection = makeFieldsSection([
  { key: "depositHeld", label: "Deposit held", type: "number", meta: true },
  { key: "deductionsTotal", label: "Deductions", type: "number", meta: true },
  {
    key: "refundDue",
    label: "Refund due",
    type: "readonly",
    format: (_v, r) => currency(Math.max(0, heldOf(r) - deductionsOf(r))),
    hint: "Held minus deductions.",
  },
  { key: "forwardingAddress", label: "Forwarding address", type: "textarea", meta: true, full: true },
]);

const movesConfig = {
  key: "move",
  singular: "Move",
  plural: "Moves",
  title: "Move-ins & Move-outs",
  description:
    "Every move across your portfolio — schedule move-ins and move-outs, run the checklist, hand over keys, and reconcile the deposit.",
  icon: ArrowLeftRight,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName"],
  data: movesData,
  rowsLoader: tenantJoinedLoader(movesData),

  statusMap: MOVE_STATUS_MAP,
  statusFilterOptions: filterOptions(MOVE_STATUS_MAP),

  views: [
    { value: "in", label: "Move-ins", filter: (r) => !isOut(r), createDefaults: { kind: "in" } },
    { value: "out", label: "Move-outs", filter: isOut, createDefaults: { kind: "out" } },
    { value: "all", label: "All", filter: () => true },
  ],

  columns: [
    {
      key: "name",
      header: "Move",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit].filter(Boolean).join(" · ") || "No unit linked"}
          </span>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      render: (r) => <Badge variant={isOut(r) ? "warning" : "info"}>{kindLabel(r)}</Badge>,
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
    const pending = rows.filter((r) => r.status !== "Complete");
    const ins = pending.filter((r) => !isOut(r)).length;
    const outs = pending.filter(isOut).length;
    const soon = pending.filter((r) => withinDays(r.moveDate, 30)).length;
    return [
      { label: "Upcoming move-ins", value: String(ins), footer: "Not yet complete" },
      { label: "Upcoming move-outs", value: String(outs), footer: "Not yet complete" },
      { label: "Next 30 days", value: String(soon), footer: "Scheduled soon" },
      {
        label: "In progress",
        value: String(rows.filter((r) => r.status === "In progress").length),
        footer: `${rows.filter((r) => r.status === "Complete").length} complete`,
      },
    ];
  },

  createDraft: { name: "", kind: "", unitId: "", tenantId: "", moveDate: "" },
  createFields: [
    { key: "name", label: "Label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    { key: "kind", label: "Type", type: "select", options: MOVE_KIND_OPTIONS, placeholder: "Matches the current tab" },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet — add them in Units",
    },
    {
      key: "tenantId",
      label: "Tenant",
      type: "select",
      optionsFrom: "tenants",
      placeholder: "Select a tenant…",
      emptyLabel: "No tenants yet — add them in Tenants",
    },
    { key: "moveDate", label: "Move date", type: "date" },
  ],
  loadCreateOptions: async () => {
    const [units, tenants] = await Promise.all([unitOptions(), tenantOptions()]);
    return { units, tenants };
  },
  // `kind` only when chosen, so the active view's createDefaults apply otherwise.
  newRow: (draft) => ({
    name: draft.name.trim(),
    ...(draft.kind ? { kind: draft.kind } : {}),
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    moveDate: draft.moveDate || null,
    status: "Scheduled",
  }),

  headerMeta: (r) => [kindLabel(r), r.unit, formatDate(r.moveDate)].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this move." },
        { key: "details", label: "Unit & Parties", icon: Link2, desc: "Type, date, and the linked unit, tenant, and lease." },
      ],
    },
    {
      group: "Workflow",
      items: [
        { key: "checklist", label: "Checklist", icon: ListChecks, desc: "Tasks to complete for this move." },
        { key: "inspection", label: "Inspection", icon: ClipboardCheck, desc: "Walkthrough and condition." },
        { key: "documents", label: "Documents", icon: FileText, desc: "Signed forms, photos, and notices." },
      ],
    },
    {
      group: "Move-in",
      items: [
        { key: "keys", label: "Keys & Access", icon: KeyRound, desc: "Keys, fobs, and access codes handed over." },
        { key: "utilities", label: "Utilities", icon: Gauge, desc: "Utility transfers and readings." },
      ],
    },
    {
      group: "Move-out",
      items: [
        { key: "reconciliation", label: "Deposit Reconciliation", icon: Calculator, desc: "Deductions and refund." },
      ],
    },
    {
      group: null,
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "kind", label: "Type", format: (_v, r) => kindLabel(r) },
        { key: "status", label: "Status" },
        { key: "unit", label: "Unit" },
        { key: "tenantName", label: "Tenant" },
        { key: "moveDate", label: "Move date", format: (v) => formatDate(v) },
        {
          key: "checklistProgress",
          label: "Checklist",
          format: (_v, r) => {
            const list = Array.isArray(r.metadata?.checklist) ? r.metadata.checklist : [];
            return list.length ? `${list.filter((x) => x.done).length}/${list.length} done` : "—";
          },
        },
      ],
    }),
    details: makeFieldsSection([
      { key: "kind", label: "Type", type: "select", options: MOVE_KIND_OPTIONS },
      { key: "moveDate", label: "Move date", type: "date" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions, full: true },
      { key: "status", label: "Status", type: "select", options: filterOptions(MOVE_STATUS_MAP).slice(1) },
    ]),
    checklist: makeMetaListSection({
      field: "checklist",
      singular: "task",
      icon: ListChecks,
      primaryPlaceholder: "e.g. Confirm renters insurance",
      check: true,
    }),
    inspection: makeEitherSection({ when: isOut, then: finalInspection, otherwise: moveInInspection }),
    documents: makeMetaListSection({
      field: "documents",
      singular: "document",
      icon: FileText,
      primaryPlaceholder: "Document name",
    }),
    keys: makeGatedSection({
      when: (r) => !isOut(r),
      section: keysSection,
      icon: KeyRound,
      title: "Keys apply to move-ins",
      description: "This record is a move-out — use the checklist to track keys returned.",
    }),
    utilities: makeGatedSection({
      when: (r) => !isOut(r),
      section: utilitiesSection,
      icon: Gauge,
      title: "Utilities apply to move-ins",
      description: "This record is a move-out — switch its type in Unit & Parties if that's wrong.",
    }),
    reconciliation: makeGatedSection({
      when: isOut,
      section: reconciliationSection,
      icon: Calculator,
      title: "Reconciliation applies to move-outs",
      description: "This record is a move-in — the deposit is reconciled when the tenant moves out.",
    }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this move…" }),
  },
};

export function MovesScreen() {
  return <EntityListScreen config={movesConfig} />;
}

export default MovesScreen;
