"use client";

import {
  LayoutDashboard,
  SquarePen,
  ListChecks,
  DollarSign,
  Camera,
  Clock,
  PaintRoller,
} from "lucide-react";

import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { unitTurnsData } from "@/lib/supabase/unit_turns";
import { unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
  makeUploadSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  TURN_STATUS_MAP,
  TURN_CHECKLIST_TEMPLATE,
  daysUntil,
  filterOptions,
  selectOptions,
  currency,
  formatDate,
} from "./shared";

// Unit Turns — make-ready between occupants (owns `property.unit_turns`). The
// checklist and itemized costs live in the metadata bag.

const checklistOf = (r) => (Array.isArray(r?.metadata?.checklist) ? r.metadata.checklist : []);
const costsOf = (r) => (Array.isArray(r?.metadata?.costs) ? r.metadata.costs : []);
const spentOf = (r) => costsOf(r).reduce((s, c) => s + (Number(c.amount) || 0), 0);
const progressOf = (r) => {
  const list = checklistOf(r);
  return list.length ? Math.round((list.filter((x) => x.done).length / list.length) * 100) : 0;
};
const isDone = (r) => r.status === "Ready" || r.status === "Leased";
const isLate = (r) => !isDone(r) && (daysUntil(r.targetReadyDate) ?? 1) < 0;

const ChecklistList = makeMetaListSection({
  field: "checklist",
  singular: "task",
  icon: ListChecks,
  primaryPlaceholder: "e.g. Replace blinds",
  check: true,
});

function ChecklistSection(props) {
  const list = checklistOf(props.item);
  const pct = progressOf(props.item);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-subtle px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">
            {list.filter((x) => x.done).length} of {list.length} tasks done
          </span>
          <span className="font-medium tabular-nums text-foreground">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-active">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ChecklistList {...props} />
    </div>
  );
}

const CostsList = makeMetaListSection({
  field: "costs",
  singular: "cost",
  icon: DollarSign,
  primaryPlaceholder: "e.g. Interior paint",
  secondary: { key: "amount", label: "Amount", type: "number", placeholder: "Amount" },
});

// Itemized costs with a total-vs-budget summary.
function CostsSection(props) {
  const spent = spentOf(props.item);
  const budget = Number(props.item.budget) || 0;
  const remaining = budget - spent;
  return (
    <div className="space-y-4">
      <SectionCard>
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Spent", value: currency(spent) },
            { label: "Budget", value: budget ? currency(budget) : "Not set" },
            {
              label: remaining < 0 ? "Over budget" : "Remaining",
              value: budget ? currency(Math.abs(remaining)) : "—",
              tone: remaining < 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
            },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {s.label}
              </dt>
              <dd className={`mt-1 text-lg font-semibold tabular-nums ${s.tone || "text-foreground"}`}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </SectionCard>
      <CostsList {...props} />
    </div>
  );
}

const unitTurnsConfig = {
  key: "unitturn",
  singular: "Unit turn",
  plural: "Unit turns",
  title: "Unit Turns",
  description:
    "Get vacated units rent-ready. Track the make-ready checklist, costs against budget, and the target ready date for every turn.",
  icon: PaintRoller,
  titleField: "name",
  searchFields: ["name", "unit", "propertyName"],
  data: unitTurnsData,

  statusMap: TURN_STATUS_MAP,
  statusFilterOptions: filterOptions(TURN_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Turn",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.unit || "No unit set"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TURN_STATUS_MAP} />,
    },
    {
      key: "progress",
      header: "Checklist",
      render: (r) => {
        const pct = progressOf(r);
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-active">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-text-secondary">{pct}%</span>
          </div>
        );
      },
    },
    {
      key: "targetReadyDate",
      header: "Target ready",
      render: (r) => (
        <span className={isLate(r) ? "text-sm text-red-600 dark:text-red-400" : "text-sm text-muted-foreground"}>
          {formatDate(r.targetReadyDate)}
        </span>
      ),
    },
    {
      key: "spent",
      header: "Spent / budget",
      align: "right",
      className: "text-right tabular-nums",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          <span className={r.budget && spentOf(r) > r.budget ? "text-red-600 dark:text-red-400" : "text-foreground"}>
            {currency(spentOf(r))}
          </span>
          {r.budget ? ` / ${currency(r.budget)}` : ""}
        </span>
      ),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => !isDone(r));
    const spent = rows.reduce((s, r) => s + spentOf(r), 0);
    return [
      { label: "Active turns", value: String(active.length), footer: `${rows.length} total` },
      { label: "Ready", value: String(rows.filter((r) => r.status === "Ready").length), footer: "Rent-ready, not leased" },
      { label: "Past target", value: String(rows.filter(isLate).length), footer: "Not ready by target date" },
      { label: "Total spent", value: currency(spent), footer: "Itemized turn costs" },
    ];
  },

  createDraft: { name: "", unitId: "", moveOutDate: "", targetReadyDate: "", budget: "" },
  createFields: [
    { key: "name", label: "Turn name", type: "text", placeholder: "e.g. 4B turn — October" },
    { key: "unitId", label: "Unit", type: "select", optionsFrom: "units", emptyLabel: "No units yet" },
    { key: "moveOutDate", label: "Move-out date", type: "date" },
    { key: "targetReadyDate", label: "Target ready date", type: "date" },
    { key: "budget", label: "Budget", type: "number", placeholder: "0" },
  ],
  loadCreateOptions: async () => ({ units: await unitOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyName: draft.propertyName || "",
    moveOutDate: draft.moveOutDate || "",
    targetReadyDate: draft.targetReadyDate || "",
    budget: Number(draft.budget) || 0,
    status: "Not started",
    // Seed the standard make-ready checklist.
    metadata: {
      checklist: TURN_CHECKLIST_TEMPLATE.map((label) => ({ id: crypto.randomUUID(), label, done: false })),
    },
  }),

  headerMeta: (r) =>
    [r.unit, r.targetReadyDate && `Ready by ${formatDate(r.targetReadyDate)}`, `${progressOf(r)}% done`]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this turn." },
      ],
    },
    {
      group: "Make-ready",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Unit, dates, budget, and status." },
        { key: "checklist", label: "Checklist", icon: ListChecks, desc: "Make-ready tasks to complete." },
        { key: "costs", label: "Costs", icon: DollarSign, desc: "Itemized costs against the budget." },
        { key: "photos", label: "Photos", icon: Camera, desc: "Before and after photos." },
      ],
    },
    {
      group: "Records",
      items: [
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "unit", label: "Unit" },
        { key: "propertyName", label: "Property" },
        { key: "status", label: "Status" },
        { key: "progress", label: "Checklist", format: (_v, item) => `${progressOf(item)}% done` },
        { key: "moveOutDate", label: "Move-out", format: (v) => formatDate(v) },
        { key: "targetReadyDate", label: "Target ready", format: (v) => formatDate(v) },
        { key: "budget", label: "Budget", format: (v) => (Number(v) ? currency(v) : "Not set") },
        { key: "spent", label: "Spent", format: (_v, item) => currency(spentOf(item)) },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Turn name", type: "text", full: true },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "status", label: "Status", type: "select", options: selectOptions(TURN_STATUS_MAP) },
      { key: "moveOutDate", label: "Move-out date", type: "date" },
      { key: "targetReadyDate", label: "Target ready date", type: "date" },
      { key: "budget", label: "Budget", type: "number" },
      { key: "assignedTo", label: "Turn lead", type: "text", meta: true, placeholder: "e.g. Sam (maintenance)" },
    ]),
    checklist: ChecklistSection,
    costs: CostsSection,
    photos: makeUploadSection({ field: "photos", ownerType: "unit_turn", singular: "photo" }),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this turn…" }),
  },
};

export function UnitTurnsScreen() {
  return <EntityListScreen config={unitTurnsConfig} />;
}

export default UnitTurnsScreen;
