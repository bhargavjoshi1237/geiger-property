"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  CalendarClock,
  Crosshair,
  ListChecks,
  Wrench,
  History,
  Clock,
  FolderOpen,
  NotebookPen,
  CalendarSync,
  Loader2,
  Zap,
  PauseCircle,
  PlayCircle,
  SlidersHorizontal,
  Boxes,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import {
  FieldsForm,
  makeFieldsSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { pmSchedulesData } from "@/lib/supabase/pm_schedules";
import { listWorkOrdersForSchedule } from "@/lib/supabase/work_orders";
import { propertyOptions, unitOptions, vendorOptions } from "@/lib/supabase/options";
import { advanceDue, isOccurrenceDue, leadDaysOf, occurrencesPerYear } from "@/lib/maintenance/pm";
import {
  PM_STATUS_MAP,
  PM_FREQUENCY_OPTIONS,
  PM_INTERVAL_UNIT_OPTIONS,
  PM_SCOPE_OPTIONS,
  MONTH_OPTIONS,
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
  ENTRY_PERMISSION_OPTIONS,
  MAINTENANCE_STATUS_MAP,
  daysUntil,
  filterOptions,
  selectOptions,
  currency,
  formatDate,
  todayString,
} from "./shared";
import { advancePartial, generateAndAdvance, generateOccurrence, scheduleView } from "./pm_generate";

// Preventive & Recurring — maintenance schedules (owns `property.pm_schedules`).
// "Generate now" creates the current occurrence's work orders and advances the
// next due date; the preventive-work-orders job does the same on a schedule.

const meta = (field) => ({ ...field, meta: true });
const isActive = (r) => r.status === "Active";
const isOverdue = (r) => isActive(r) && (daysUntil(r.nextDue) ?? 1) < 0;
const isDueSoon = (r) => {
  const d = daysUntil(r.nextDue);
  return isActive(r) && d !== null && d >= 0 && d <= 14;
};
const scopeLabel = (r) => PM_SCOPE_OPTIONS.find((o) => o.value === scheduleView(r).scope)?.label.split(" (")[0];

function dueLabel(r) {
  if (r.status === "Ended") return "Ended";
  const d = daysUntil(r.nextDue);
  if (d === null) return "No due date";
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return "Due today";
  return `Due in ${d}d`;
}

// Next `n` occurrences starting at next due.
function upcoming(item, n = 6) {
  const s = scheduleView(item);
  const out = [];
  let d = s.nextDue;
  for (let i = 0; d && i < n; i += 1) {
    out.push(d);
    d = advanceDue(s, d);
  }
  return out;
}

// --- Overview --------------------------------------------------------------------

function ScheduleOverview({ item, runAction }) {
  const s = scheduleView(item);
  const dates = upcoming(item);
  const facts = [
    { label: "Frequency", value: s.frequency === "Custom" ? `Every ${s.intervalCount || 1} ${s.intervalUnit || "months"}` : s.frequency || "—" },
    { label: "Scope", value: scopeLabel(item) || "A specific unit" },
    { label: "Location", value: s.unit || s.propertyName || "—" },
    { label: "Category", value: s.category || "—" },
    { label: "Vendor", value: s.vendorName || "Unassigned" },
    { label: "Estimated cost", value: currency(s.estimatedCost) },
    { label: "Lead time", value: `${leadDaysOf(s)} days before due` },
    { label: "Last generated", value: s.lastGenerated ? formatDate(s.lastGenerated) : "Never" },
  ];
  return (
    <div className="space-y-4">
      <SectionCard
        title="Generate work orders"
        description={`${dueLabel(item)} · ${s.autoGenerate === false ? "manual only" : "created automatically by the daily preventive job"}.`}
        action={
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={item.status !== "Active"}
            onClick={() => runAction("generate")}
          >
            <Wrench className="h-4 w-4" /> Generate now
          </Button>
        }
      >
        <p className="text-sm text-text-secondary">
          {item.status === "Active"
            ? "Generating creates this occurrence's work order(s), then moves the next due date forward."
            : `This schedule is ${String(item.status).toLowerCase()}. Resume it to generate work orders.`}
        </p>
      </SectionCard>

      <SectionCard title="At a glance">
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{f.label}</dt>
              <dd className="mt-1 truncate text-sm text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard title="Upcoming occurrences" bodyPadding={false}>
        {dates.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-secondary">No upcoming dates — set a next due date under Recurrence.</p>
        ) : (
          <ul className="divide-y divide-border">
            {dates.map((d, i) => (
              <li key={d} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-foreground">{formatDate(d)}</span>
                {i === 0 ? <Badge variant={isOverdue(item) ? "danger" : "info"}>{dueLabel(item)}</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// --- Recurrence & scope -------------------------------------------------------------

const monthBased = (i) => !["Weekly", "Biweekly"].includes(i.frequency) && !(i.frequency === "Custom" && (i.metadata?.intervalUnit || "months") !== "months");

const RECURRENCE_FIELDS = [
  { key: "frequency", label: "Frequency", type: "select", options: PM_FREQUENCY_OPTIONS },
  { key: "status", label: "Status", type: "select", options: selectOptions(PM_STATUS_MAP) },
  meta({ key: "intervalCount", label: "Every", type: "number", min: 1, showIf: (i) => i.frequency === "Custom" }),
  meta({ key: "intervalUnit", label: "Unit", type: "select", options: PM_INTERVAL_UNIT_OPTIONS, showIf: (i) => i.frequency === "Custom" }),
  meta({ key: "dayOfMonth", label: "Day of month", type: "number", min: 1, max: 31, showIf: monthBased, hint: "Clamped to the month's last day." }),
  { key: "nextDue", label: "Next due", type: "date" },
  meta({ key: "startDate", label: "Starts", type: "date" }),
  meta({ key: "endDate", label: "Ends", type: "date", hint: "Blank to repeat indefinitely." }),
  meta({ key: "activeMonths", label: "Only in these months", type: "multiselect", options: MONTH_OPTIONS, hint: "Seasonal work — leave empty for year-round." }),
  { key: "gen-h", label: "Generation", type: "heading" },
  meta({ key: "leadDays", label: "Create work order (days before due)", type: "number", min: 0 }),
  meta({ key: "autoGenerate", label: "Generate automatically", type: "switch", hint: "The daily preventive job creates due work orders." }),
  meta({ key: "skipIfOpen", label: "Skip while the last one is open", type: "switch" }),
  meta({ key: "season", label: "Season / window", type: "text", placeholder: "e.g. Before winter" }),
];

function RecurrenceSection({ item, onPatch, onCommit, onCommitMeta }) {
  // autoGenerate defaults on for older schedules.
  const view = item.metadata?.autoGenerate === undefined ? { ...item, metadata: { ...(item.metadata || {}), autoGenerate: true } } : item;
  return <FieldsForm item={view} fields={RECURRENCE_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />;
}

const SCOPE_FIELDS = [
  meta({ key: "scope", label: "Applies to", type: "select", options: PM_SCOPE_OPTIONS }),
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  {
    key: "unitId",
    label: "Unit",
    type: "relation",
    load: unitOptions,
    displayKey: "unit",
    showIf: (i) => !["property", "all_units"].includes(i.metadata?.scope),
  },
];

const AssetsList = makeMetaListSection({
  field: "assets",
  singular: "asset",
  icon: Boxes,
  primaryPlaceholder: "e.g. Rooftop unit #2",
  secondary: { key: "location", label: "Location", placeholder: "Location" },
});

function ScopeSection(props) {
  const { item, onPatch, onCommit, onCommitMeta } = props;
  const scope = item.metadata?.scope || "unit";
  return (
    <div className="space-y-5">
      <FieldsForm
        item={item.metadata?.scope ? item : { ...item, metadata: { ...(item.metadata || {}), scope } }}
        fields={SCOPE_FIELDS}
        onPatch={onPatch}
        onCommit={onCommit}
        onCommitMeta={onCommitMeta}
      />
      <p className="text-sm text-text-secondary">
        {scope === "all_units"
          ? "One work order per unit in the property is created for each occurrence."
          : scope === "assets"
            ? "One work order lists every asset below as a checklist task."
            : "One work order is created for each occurrence."}
      </p>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Assets & equipment</p>
        <AssetsList {...props} />
      </div>
    </div>
  );
}

// --- Generated work orders ---------------------------------------------------------

const GeneratedWorkOrders = makeRelatedSection({
  load: (item) => listWorkOrdersForSchedule(item.id),
  tab: "Work Orders",
  plural: "Generated work orders",
  icon: History,
  emptyDescription: "Work orders created from this schedule show up here.",
  columns: [
    {
      key: "name",
      header: "Work order",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.propertyLabel || "—"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={MAINTENANCE_STATUS_MAP} /> },
    { key: "due", header: "Due", render: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.pmDueDate || r.scheduledDate)}</span> },
    { key: "cost", header: "Cost", align: "right", className: "text-right tabular-nums", render: (r) => currency(r.totalCost) },
  ],
  footer: (rows) => {
    const done = rows.filter((r) => r.status === "Completed");
    const spent = rows.reduce((s, r) => s + (Number(r.totalCost) || 0), 0);
    return (
      <p className="text-sm text-text-secondary">
        {done.length} of {rows.length} completed · {currency(spent)} spent
      </p>
    );
  },
});

// --- List header: generate everything that's due -----------------------------------

function GenerateDueButton({ rows, reload }) {
  const [busy, setBusy] = useState(false);
  const due = useMemo(() => rows.filter((r) => isOccurrenceDue(scheduleView(r), todayString())), [rows]);
  const run = async () => {
    setBusy(true);
    let made = 0;
    let failed = 0;
    for (const r of due) {
      const res = await generateAndAdvance(r);
      made += res.created.length;
      failed += res.failed;
    }
    setBusy(false);
    reload();
    if (made) toast.success(`Created ${made} work order${made === 1 ? "" : "s"}.`);
    if (failed) toast.error(`${failed} work order${failed === 1 ? "" : "s"} couldn't be created.`);
  };
  return (
    <Button
      variant="outline"
      className="border-border bg-surface-card hover:bg-surface-hover"
      disabled={busy || due.length === 0}
      onClick={run}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
      Generate due ({due.length})
    </Button>
  );
}

const preventiveConfig = {
  key: "pmschedule",
  singular: "Schedule",
  plural: "Schedules",
  title: "Preventive & Recurring",
  description:
    "Recurring maintenance on a schedule — filter changes, inspections, seasonal service. Work orders are created automatically as each occurrence comes due.",
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
    { value: "ended", label: "Ended", filter: (r) => r.status === "Ended" },
  ],

  headerActions: ({ rows, reload }) => <GenerateDueButton rows={rows} reload={reload} />,

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
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground">{r.frequency || "—"}</span>
          <span className="text-xs text-text-secondary">{scopeLabel(r) || "Single unit"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={PM_STATUS_MAP} /> },
    {
      key: "vendor",
      header: "Vendor",
      render: (r) => <span className="text-sm text-muted-foreground">{r.vendorName || "Unassigned"}</span>,
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
    const yearly = active.reduce((s, r) => s + (Number(r.estimatedCost) || 0) * occurrencesPerYear(scheduleView(r)), 0);
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
    metadata: { scope: "unit", autoGenerate: true, leadDays: 0, priority: "Medium", startDate: draft.nextDue || todayString() },
  }),

  headerMeta: (r) =>
    [r.frequency, r.unit || r.propertyName, r.status === "Active" ? dueLabel(r) : null].filter(Boolean).join(" · "),

  actions: [
    {
      key: "generate",
      label: "Generate now",
      icon: Wrench,
      showIf: (i) => i.status === "Active",
      run: async (ctx) => {
        const res = await generateOccurrence(ctx.item);
        if (!res.created.length) {
          toast.error("Couldn't create the work order — one may already exist for this due date.");
          return;
        }
        const ok = await ctx.commit(advancePartial(ctx.item, res.created, res.dueDate));
        ctx.log(`Generated ${res.created.length} work order${res.created.length === 1 ? "" : "s"} for ${formatDate(res.dueDate)}`);
        if (ok) toast.success(`Created ${res.created.length} work order${res.created.length === 1 ? "" : "s"}.`);
        if (res.failed) toast.error(`${res.failed} couldn't be created.`);
      },
    },
    {
      key: "skip",
      label: "Skip this occurrence",
      icon: CalendarClock,
      showIf: (i) => i.status === "Active" && Boolean(i.nextDue),
      run: async (ctx) => {
        const next = advanceDue(scheduleView(ctx.item), ctx.item.nextDue);
        const ok = await ctx.commit({ nextDue: next || "", ...(next ? {} : { status: "Ended" }) });
        if (ok) {
          ctx.log(`Skipped the ${formatDate(ctx.item.nextDue)} occurrence`);
          toast.success(next ? `Skipped — next due ${formatDate(next)}.` : "Skipped — schedule ended.");
        }
      },
    },
    {
      key: "pause",
      label: "Pause",
      icon: PauseCircle,
      separatorBefore: true,
      showIf: (i) => i.status === "Active",
      run: async (ctx) => {
        if (await ctx.commit({ status: "Paused" })) toast.success("Schedule paused.");
      },
    },
    {
      key: "resume",
      label: "Resume",
      icon: PlayCircle,
      separatorBefore: true,
      showIf: (i) => i.status !== "Active",
      wizard: {
        title: "Resume schedule",
        finishLabel: "Resume",
        logSummary: "Resumed schedule",
        initial: (i) => ({ nextDue: i.nextDue && (daysUntil(i.nextDue) ?? -1) >= 0 ? i.nextDue : todayString() }),
        steps: [{ key: "when", title: "Next due", fields: [{ key: "nextDue", label: "Next due", type: "date", required: true }] }],
        finish: async (v, ctx) => {
          const ok = await ctx.commit({ status: "Active", nextDue: v.nextDue });
          if (ok) toast.success("Schedule resumed.");
          return ok;
        },
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Next due, upcoming dates and the generate action." }],
    },
    {
      group: "Schedule",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Task, category, vendor and cost." },
        { key: "recurrence", label: "Recurrence", icon: CalendarClock, desc: "How often it repeats, seasons and generation rules." },
        { key: "scope", label: "Scope & Assets", icon: Crosshair, desc: "Which property, units or equipment it covers." },
        { key: "steps", label: "Checklist Template", icon: ListChecks, desc: "Copied onto every generated work order." },
        { key: "defaults", label: "Work Order Defaults", icon: SlidersHorizontal, desc: "Priority, entry and sharing for generated jobs." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "history", label: "Generated Work Orders", icon: History, desc: "Work orders created from this schedule." },
        { key: "documents", label: "Documents", icon: FolderOpen, desc: "Manuals, contracts and service records." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes on this schedule." },
        { key: "notes", label: "Notes", icon: NotebookPen, desc: "Internal notes." },
      ],
    },
  ],
  sections: {
    overview: ScheduleOverview,
    details: makeFieldsSection([
      { key: "name", label: "Task", type: "text", full: true },
      { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
      { key: "estimatedCost", label: "Estimated cost per occurrence", type: "currency" },
      meta({ key: "estimatedHours", label: "Estimated hours", type: "number", min: 0, step: 0.25 }),
      { key: "vendorId", label: "Vendor", type: "relation", load: vendorOptions, displayKey: "vendorName" },
      meta({ key: "technician", label: "Technician", type: "text" }),
      meta({ key: "contractRef", label: "Service contract #", type: "text" }),
      meta({ key: "instructions", label: "Instructions", type: "textarea" }),
    ]),
    recurrence: RecurrenceSection,
    scope: ScopeSection,
    steps: makeMetaListSection({
      field: "steps",
      singular: "step",
      icon: ListChecks,
      primaryPlaceholder: "e.g. Check refrigerant levels",
    }),
    defaults: makeFieldsSection([
      meta({ key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS }),
      meta({ key: "entryPermission", label: "Entry permission", type: "select", options: ENTRY_PERMISSION_OPTIONS, hint: "Blank uses the property's maintenance policy." }),
      meta({ key: "dueOffsetDays", label: "Due date offset (days after scheduled)", type: "number", min: 0 }),
      meta({ key: "notifyTenant", label: "Notify residents before the visit", type: "switch" }),
      meta({ key: "shareWithOwner", label: "Share generated jobs with the owner", type: "switch" }),
      meta({ key: "requireApproval", label: "Always require owner approval", type: "switch" }),
    ]),
    history: GeneratedWorkOrders,
    documents: DocumentsSection,
    activity: ActivitySection,
    notes: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this schedule…" }),
  },
};

export function PreventiveScreen() {
  return <EntityListScreen config={preventiveConfig} />;
}

export default PreventiveScreen;
