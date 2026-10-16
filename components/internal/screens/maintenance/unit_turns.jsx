"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  SquarePen,
  CalendarRange,
  ListChecks,
  Wrench,
  DollarSign,
  Camera,
  FolderOpen,
  Clock,
  NotebookPen,
  PaintRoller,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  ListPlus,
  LayoutList,
  Columns3,
  MoreHorizontal,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListLoading, ScreenHeader, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { makeNotesSection, makeUploadSection } from "@/components/internal/screens/entity/sections/factories";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { unitTurnsData, unitTurnsLayer } from "@/lib/supabase/unit_turns";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { unitOptions } from "@/lib/supabase/options";
import { cn } from "@/lib/utils";
import { TURN_STATUS_MAP, filterOptions, currency, formatDate, todayString } from "./shared";
import {
  TurnBudgetSection,
  TurnChecklistSection,
  TurnDatesSection,
  TurnDetailsSection,
  TurnOverview,
  VENDOR_TASK_FIELDS,
  VendorTasksSection,
  actualOf,
  checklistOf,
  createVendorTask,
  isTurnDone,
  isTurnLate,
  newChecklist,
  progressOf,
  vendorTaskDefaults,
} from "./sections/turn_sections";

// Unit Turns — make-ready between occupants (owns `property.unit_turns`). The
// checklist and other costs live in metadata; vendor work runs as linked work
// orders whose costs roll up into actual spend. List and board (kanban) views.

// Turns joined with their linked work-order rollups.
async function loadTurns() {
  const [turns, wos] = await Promise.all([unitTurnsLayer.list(), workOrdersLayer.list()]);
  if (!turns) return null;
  const byTurn = new Map();
  for (const w of wos ?? []) {
    if (!w.unitTurnId) continue;
    const agg = byTurn.get(w.unitTurnId) || { woCount: 0, woOpen: 0, woActual: 0 };
    agg.woCount += 1;
    if (!["Completed", "Cancelled"].includes(w.status)) agg.woOpen += 1;
    agg.woActual += Number(w.totalCost) || 0;
    byTurn.set(w.unitTurnId, agg);
  }
  return turns.map((t) => ({ woCount: 0, woOpen: 0, woActual: 0, ...t, ...(byTurn.get(t.id) || {}) }));
}

function turnStats(rows) {
  const active = rows.filter((r) => !isTurnDone(r));
  const spent = rows.reduce((s, r) => s + actualOf(r), 0);
  const budget = rows.reduce((s, r) => s + (Number(r.budget) || 0), 0);
  return [
    { label: "Active turns", value: String(active.length), footer: `${rows.length} total` },
    { label: "Ready", value: String(rows.filter((r) => r.status === "Ready").length), footer: "Rent-ready, not leased" },
    { label: "Past target", value: String(rows.filter(isTurnLate).length), footer: "Not ready by target date" },
    { label: "Actual spend", value: currency(spent), footer: budget ? `of ${currency(budget)} budgeted` : "Work orders + other costs" },
  ];
}

const ProgressBar = ({ pct, className }) => (
  <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-active", className)}>
    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
  </div>
);

const STATUS_FLOW = Object.keys(TURN_STATUS_MAP);

// Patch for a status move (stamps the actual ready date on Ready).
const statusPatch = (row, status) => ({
  status,
  ...(status === "Ready" && !row.readyDate ? { readyDate: todayString() } : {}),
});

// --- Board view ----------------------------------------------------------------

function TurnBoard({ mode, setMode }) {
  const { openItem } = useWorkspaceUrl();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    loadTurns().then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, []);

  const move = async (row, status) => {
    if (row.status === status) return;
    const patch = statusPatch(row, status);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    const saved = await unitTurnsLayer.update(row.id, patch);
    if (!saved) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      toast.error("Couldn't move that turn.");
      return;
    }
    logSystemActivity("unitturn", row.id, "updated", `Moved to ${status}`, { status: [row.status, status] });
    toast.success(`"${row.name}" moved to ${status}.`);
  };

  const stats = useMemo(() => turnStats(rows || []), [rows]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Unit Turns"
        description="Get vacated units rent-ready. Track make-ready tasks, vendor work, budget vs actual, and target vs actual ready dates."
        actions={<ViewToggle mode={mode} setMode={setMode} />}
      />
      <StatsBar stats={stats} />
      {rows === null ? (
        <ListLoading label="Loading unit turns" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_FLOW.map((status) => {
            const col = rows.filter((r) => (TURN_STATUS_MAP[r.status] ? r.status : "Not started") === status);
            return (
              <section key={status} className="flex min-w-0 flex-col rounded-xl border border-border bg-surface-subtle">
                <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <StatusPill status={status} map={TURN_STATUS_MAP} />
                  <span className="text-xs tabular-nums text-text-tertiary">{col.length}</span>
                </header>
                <div className="flex flex-col gap-2 p-3">
                  {col.length === 0 ? <p className="px-1 py-6 text-center text-xs text-text-tertiary">No turns</p> : null}
                  {col.map((r) => {
                    const pct = progressOf(r);
                    const actual = actualOf(r);
                    const over = r.budget && actual > r.budget;
                    return (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openItem(r.id)}
                        onKeyDown={(e) => e.key === "Enter" && openItem(r.id)}
                        className="cursor-pointer rounded-lg border border-border bg-surface-card p-3 text-left transition-colors hover:bg-surface-hover"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                            <p className="truncate text-xs text-text-secondary">{r.unit || "No unit set"}</p>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                                  aria-label={`Move ${r.name}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44 border-border bg-surface-card shadow-xl">
                                <DropdownMenuLabel className="text-xs text-text-tertiary">Move to</DropdownMenuLabel>
                                {STATUS_FLOW.filter((s) => s !== r.status).map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    className="cursor-pointer text-muted-foreground focus:bg-surface-hover focus:text-foreground"
                                    onClick={() => move(r, s)}
                                  >
                                    {s}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <ProgressBar pct={pct} className="flex-1" />
                          <span className="text-[11px] tabular-nums text-text-secondary">{pct}%</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                          <span className={isTurnLate(r) ? "text-red-600 dark:text-red-400" : "text-text-secondary"}>
                            {r.readyDate ? `Ready ${formatDate(r.readyDate)}` : `Target ${formatDate(r.targetReadyDate)}`}
                          </span>
                          <span className={over ? "tabular-nums text-red-600 dark:text-red-400" : "tabular-nums text-text-secondary"}>
                            {currency(actual)}
                            {r.budget ? ` / ${currency(r.budget)}` : ""}
                          </span>
                        </div>
                        {r.woCount ? (
                          <p className="mt-1 text-[11px] text-text-tertiary">
                            {r.woOpen} of {r.woCount} vendor task{r.woCount === 1 ? "" : "s"} open
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </MainScreenWrapper>
  );
}

function ViewToggle({ mode, setMode }) {
  return (
    <SegmentedTabs
      tabs={[
        { value: "list", label: "List", icon: LayoutList },
        { value: "board", label: "Board", icon: Columns3 },
      ]}
      value={mode}
      onChange={setMode}
    />
  );
}

// --- Config ----------------------------------------------------------------------

const columns = [
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
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={TURN_STATUS_MAP} /> },
  {
    key: "progress",
    header: "Checklist",
    render: (r) => (
      <div className="flex items-center gap-2">
        <ProgressBar pct={progressOf(r)} className="w-20" />
        <span className="text-xs tabular-nums text-text-secondary">{progressOf(r)}%</span>
      </div>
    ),
  },
  {
    key: "targetReadyDate",
    header: "Target / actual ready",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className={isTurnLate(r) ? "text-sm text-red-600 dark:text-red-400" : "text-sm text-muted-foreground"}>
          {formatDate(r.targetReadyDate)}
        </span>
        <span className="text-xs text-text-tertiary">{r.readyDate ? `Ready ${formatDate(r.readyDate)}` : "Not ready"}</span>
      </div>
    ),
  },
  {
    key: "spent",
    header: "Actual / budget",
    align: "right",
    className: "text-right tabular-nums",
    render: (r) => {
      const actual = actualOf(r);
      return (
        <span className="text-sm text-muted-foreground">
          <span className={r.budget && actual > r.budget ? "text-red-600 dark:text-red-400" : "text-foreground"}>{currency(actual)}</span>
          {r.budget ? ` / ${currency(r.budget)}` : ""}
        </span>
      );
    },
  },
];

function buildTurnsConfig({ mode, setMode }) {
  return {
    key: "unitturn",
    singular: "Unit turn",
    plural: "Unit turns",
    title: "Unit Turns",
    description:
      "Get vacated units rent-ready. Track make-ready tasks, vendor work, budget vs actual, and target vs actual ready dates.",
    icon: PaintRoller,
    titleField: "name",
    searchFields: ["name", "unit", "propertyName"],
    data: unitTurnsData,
    rowsLoader: loadTurns,

    statusMap: TURN_STATUS_MAP,
    statusFilterOptions: filterOptions(TURN_STATUS_MAP),

    views: [
      { value: "all", label: "All" },
      { value: "active", label: "Active", filter: (r) => !isTurnDone(r) },
      { value: "late", label: "Past target", filter: isTurnLate },
      { value: "over", label: "Over budget", filter: (r) => Number(r.budget) > 0 && actualOf(r) > Number(r.budget) },
    ],

    headerActions: () => <ViewToggle mode={mode} setMode={setMode} />,

    columns,
    stats: turnStats,

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
      propertyId: draft.propertyId || "",
      propertyName: draft.propertyName || "",
      moveOutDate: draft.moveOutDate || "",
      targetReadyDate: draft.targetReadyDate || "",
      budget: Number(draft.budget) || 0,
      status: "Not started",
      // Seed the standard make-ready checklist.
      metadata: { checklist: newChecklist(), turnType: "Standard" },
    }),

    headerMeta: (r) =>
      [r.unit, r.targetReadyDate && `Ready by ${formatDate(r.targetReadyDate)}`, `${progressOf(r)}% done`].filter(Boolean).join(" · "),

    actions: [
      {
        key: "start",
        label: "Start turn",
        icon: Wrench,
        showIf: (i) => i.status === "Not started",
        run: async (ctx) => {
          if (await ctx.commit({ status: "In progress" })) toast.success("Turn started.");
        },
      },
      {
        key: "vendorTask",
        label: "Add vendor task",
        icon: Plus,
        showIf: (i) => !isTurnDone(i),
        wizard: {
          title: "New vendor task",
          description: "Creates a work order linked to this turn.",
          finishLabel: "Create work order",
          logSummary: "Added vendor task",
          initial: vendorTaskDefaults,
          steps: [{ key: "task", title: "Task", fields: VENDOR_TASK_FIELDS }],
          finish: async (v, ctx) => {
            const wo = await createVendorTask(ctx.item, v);
            if (!wo) {
              toast.error("Couldn't create the vendor task.");
              return false;
            }
            toast.success(`Work order "${wo.name}" created.`);
            ctx.navigate("vendorTasks");
            return true;
          },
        },
      },
      {
        key: "template",
        label: "Load standard checklist",
        icon: ListPlus,
        run: async (ctx) => {
          const list = checklistOf(ctx.item);
          const have = new Set(list.map((t) => t.label));
          const added = newChecklist().filter((t) => !have.has(t.label));
          if (!added.length) {
            toast.success("The standard tasks are already on this turn.");
            return;
          }
          if (await ctx.commitMeta({ checklist: [...list, ...added] })) toast.success(`Added ${added.length} tasks.`);
        },
      },
      {
        key: "markReady",
        label: "Mark ready",
        icon: CheckCircle2,
        separatorBefore: true,
        showIf: (i) => !isTurnDone(i),
        wizard: {
          title: "Mark unit ready",
          finishLabel: "Mark ready",
          logSummary: "Marked unit rent-ready",
          initial: (i) => ({ readyDate: todayString(), walkthroughBy: i.metadata?.assignedTo || "", openTasks: checklistOf(i).filter((t) => !t.done && t.status !== "Done").length }),
          steps: [
            {
              key: "ready",
              title: "Ready",
              fields: [
                { key: "readyDate", label: "Ready on", type: "date", required: true },
                { key: "walkthroughBy", label: "Final walkthrough by", type: "text" },
                { key: "completeTasks", label: "Mark remaining checklist tasks done", type: "switch" },
              ],
              render: ({ values }) =>
                values.openTasks ? (
                  <p className="text-sm text-text-secondary">{values.openTasks} checklist task{values.openTasks === 1 ? " is" : "s are"} still open.</p>
                ) : null,
            },
          ],
          finish: async (v, ctx) => {
            const item = ctx.item;
            const checklist = v.completeTasks
              ? checklistOf(item).map((t) => ({ ...t, done: true, status: "Done" }))
              : checklistOf(item);
            const ok = await ctx.commit({
              status: "Ready",
              readyDate: v.readyDate,
              metadata: { ...(item.metadata || {}), checklist, walkthroughBy: v.walkthroughBy || "" },
            });
            if (ok) toast.success("Unit marked rent-ready.");
            return ok;
          },
        },
      },
      {
        key: "leased",
        label: "Mark leased",
        icon: KeyRound,
        showIf: (i) => i.status === "Ready",
        run: async (ctx) => {
          if (await ctx.commit({ status: "Leased" })) toast.success("Turn closed as leased.");
        },
      },
      {
        key: "reopen",
        label: "Reopen turn",
        icon: RotateCcw,
        showIf: isTurnDone,
        run: async (ctx) => {
          if (await ctx.commit({ status: "In progress", readyDate: "" })) toast.success("Turn reopened.");
        },
      },
    ],

    navGroups: [
      {
        group: null,
        items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Progress, dates and spend at a glance." }],
      },
      {
        group: "Make-ready",
        items: [
          { key: "details", label: "Details", icon: SquarePen, desc: "Unit, move-out, lead and scope." },
          { key: "dates", label: "Dates", icon: CalendarRange, desc: "Target vs actual ready date and turn time." },
          { key: "checklist", label: "Checklist", icon: ListChecks, desc: "Make-ready tasks with owners and due dates." },
          { key: "vendorTasks", label: "Vendor Tasks", icon: Wrench, desc: "Work orders for this turn." },
          { key: "budget", label: "Budget vs Actual", icon: DollarSign, desc: "Budget against work-order and other costs." },
        ],
      },
      {
        group: "Files & history",
        items: [
          { key: "photos", label: "Photos", icon: Camera, desc: "Before and after photos." },
          { key: "documents", label: "Documents", icon: FolderOpen, desc: "Inspection reports, invoices and other files." },
          { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes on this turn." },
          { key: "notes", label: "Notes", icon: NotebookPen, desc: "Internal notes." },
        ],
      },
    ],
    sections: {
      overview: TurnOverview,
      details: TurnDetailsSection,
      dates: TurnDatesSection,
      checklist: TurnChecklistSection,
      vendorTasks: VendorTasksSection,
      budget: TurnBudgetSection,
      photos: makeUploadSection({ field: "photos", ownerType: "unit_turn", singular: "photo" }),
      documents: DocumentsSection,
      activity: ActivitySection,
      notes: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this turn…" }),
    },
  };
}

export function UnitTurnsScreen() {
  const { itemId } = useWorkspaceUrl();
  const [mode, setMode] = useState("list");
  const config = useMemo(() => buildTurnsConfig({ mode, setMode }), [mode]);
  if (mode === "board" && !itemId) return <TurnBoard mode={mode} setMode={setMode} />;
  return <EntityListScreen config={config} />;
}

export default UnitTurnsScreen;
