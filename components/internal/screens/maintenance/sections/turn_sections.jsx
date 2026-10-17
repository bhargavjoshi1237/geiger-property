"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, ExternalLink, ListPlus, Plus, Trash2, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ListLoading, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { FieldsForm } from "@/components/internal/screens/entity/sections/factories";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listWorkOrdersForTurn, workOrdersLayer } from "@/lib/supabase/work_orders";
import { movesLayer } from "@/lib/supabase/moves";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { propertyOptions, unitOptions, vendorOptions } from "@/lib/supabase/options";
import {
  CATEGORY_OPTIONS,
  MAINTENANCE_STATUS_MAP,
  PRIORITY_OPTIONS,
  TURN_CHECKLIST_TEMPLATE,
  TURN_STATUS_MAP,
  TURN_TASK_STATUS_OPTIONS,
  currency,
  daysBetween,
  daysUntil,
  formatDate,
  selectOptions,
  todayString,
} from "../shared";
import { actorName } from "./wo_shared";

// Unit-turn editor sections: details, dates (target vs actual), the make-ready
// checklist with owners/due dates, vendor tasks (linked work orders) and
// budget vs actual rolled up from those work orders.

const meta = (field) => ({ ...field, meta: true });

export const checklistOf = (r) => (Array.isArray(r?.metadata?.checklist) ? r.metadata.checklist : []);
export const costsOf = (r) => (Array.isArray(r?.metadata?.costs) ? r.metadata.costs : []);
export const otherCostOf = (r) => costsOf(r).reduce((s, c) => s + (Number(c.amount) || 0), 0);
const isDoneTask = (t) => t.done || t.status === "Done";
export const progressOf = (r) => {
  const list = checklistOf(r);
  return list.length ? Math.round((list.filter(isDoneTask).length / list.length) * 100) : 0;
};
// Actual = linked work-order costs (rolled up by the list loader) + other costs.
export const actualOf = (r, woActual = r?.woActual) => (Number(woActual) || 0) + otherCostOf(r);
export const isTurnDone = (r) => r.status === "Ready" || r.status === "Leased";
export const isTurnLate = (r) => !isTurnDone(r) && (daysUntil(r.targetReadyDate) ?? 1) < 0;

export const newChecklist = () =>
  TURN_CHECKLIST_TEMPLATE.map((label) => ({ id: crypto.randomUUID(), label, owner: "", dueDate: "", status: "To do", done: false }));

// Linked work orders for one turn (null while loading).
function useTurnWorkOrders(turnId, version = 0) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    listWorkOrdersForTurn(turnId).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, [turnId, version]);
  return rows;
}

const woTotal = (rows) => (rows || []).reduce((s, w) => s + (Number(w.totalCost) || 0), 0);

// --- Overview ------------------------------------------------------------------

export function TurnOverview({ item, runAction }) {
  const wos = useTurnWorkOrders(item.id);
  const actual = actualOf(item, wos ? woTotal(wos) : item.woActual);
  const budget = Number(item.budget) || 0;
  const target = daysUntil(item.targetReadyDate);
  const vacant = daysBetween(item.moveOutDate, item.readyDate || todayString());
  const lateBy = item.readyDate && item.targetReadyDate ? daysBetween(item.targetReadyDate, item.readyDate) : null;
  const tasks = checklistOf(item);
  const openTasks = tasks.filter((t) => !isDoneTask(t));
  return (
    <div className="space-y-5">
      <StatsBar
        stats={[
          { label: "Checklist", value: `${progressOf(item)}%`, footer: `${tasks.length - openTasks.length} of ${tasks.length} tasks done` },
          {
            label: item.readyDate ? "Ready on" : "Target ready",
            value: formatDate(item.readyDate || item.targetReadyDate),
            footer: item.readyDate
              ? lateBy
                ? `${lateBy}d after target`
                : "On or before target"
              : target === null
                ? "No target set"
                : target < 0
                  ? `${-target}d past target`
                  : `${target}d to go`,
          },
          { label: "Days vacant", value: vacant === null ? "—" : String(vacant), footer: `Moved out ${formatDate(item.moveOutDate)}` },
          {
            label: "Actual vs budget",
            value: currency(actual),
            footer: budget ? `${actual > budget ? "Over" : "Under"} ${currency(budget)} by ${currency(Math.abs(budget - actual))}` : "No budget set",
          },
        ]}
      />
      <SectionCard
        title="Open tasks"
        description={openTasks.length ? `${openTasks.length} make-ready task${openTasks.length === 1 ? "" : "s"} left.` : "Every make-ready task is done."}
        action={
          isTurnDone(item) ? null : (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("markReady")}>
              Mark Ready
            </Button>
          )
        }
        bodyPadding={false}
      >
        {openTasks.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-secondary">Nothing outstanding.</p>
        ) : (
          <ul className="divide-y divide-border">
            {openTasks.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="truncate text-foreground">{t.label}</span>
                <span className={(daysUntil(t.dueDate) ?? 1) < 0 ? "shrink-0 text-xs text-red-600 dark:text-red-400" : "shrink-0 text-xs text-text-secondary"}>
                  {[t.owner, t.dueDate && `Due ${formatDate(t.dueDate)}`].filter(Boolean).join(" · ") || "Unassigned"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Vendor tasks" description={wos === null ? "Loading…" : `${wos.length} linked work order${wos.length === 1 ? "" : "s"} · ${currency(woTotal(wos))}`}>
        <div className="flex flex-wrap gap-2">
          {(wos || []).map((w) => (
            <StatusPill key={w.id} status={w.status} map={MAINTENANCE_STATUS_MAP} />
          ))}
          {wos && !wos.length ? <p className="text-sm text-text-secondary">No vendor tasks yet.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
}

// --- Details & dates -------------------------------------------------------------

const moveLoader = async () =>
  ((await movesLayer.list()) ?? [])
    .filter((m) => m.kind === "out")
    .map((m) => ({
      value: m.id,
      label: [m.name, m.unit, m.moveDate && formatDate(m.moveDate)].filter(Boolean).join(" · ") || "Move-out",
      patch: { moveOutDate: m.moveDate || "", unitId: m.unitId || "", unit: m.unit || "", propertyId: m.propertyId || "" },
    }));

export const TURN_DETAIL_FIELDS = [
  { key: "name", label: "Turn name", type: "text", full: true },
  { key: "status", label: "Status", type: "select", options: selectOptions(TURN_STATUS_MAP) },
  meta({ key: "assignedTo", label: "Turn lead", type: "text", placeholder: "e.g. Sam (maintenance)" }),
  { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions, displayKey: "propertyName" },
  { key: "moveId", label: "Move-out", type: "relation", load: moveLoader, hint: "Links the move and fills the move-out date." },
  meta({ key: "turnType", label: "Turn type", type: "select", options: ["Light", "Standard", "Heavy", "Renovation"].map((v) => ({ value: v, label: v })) }),
  meta({ key: "rush", label: "Rush turn", type: "switch", hint: "A new resident is waiting." }),
  meta({ key: "nextTenant", label: "Incoming resident", type: "text" }),
  meta({ key: "scopeNotes", label: "Scope notes", type: "textarea" }),
];

export const TURN_DATE_FIELDS = [
  { key: "moveOutDate", label: "Move-out date", type: "date" },
  meta({ key: "keysReturned", label: "Keys returned", type: "date" }),
  meta({ key: "inspectionDate", label: "Move-out inspection", type: "date" }),
  { key: "targetReadyDate", label: "Target ready date", type: "date" },
  { key: "readyDate", label: "Actual ready date", type: "date" },
  meta({ key: "marketedOn", label: "Listed for rent", type: "date" }),
  meta({ key: "nextMoveInDate", label: "Next move-in", type: "date" }),
  {
    key: "varianceDays",
    label: "Target vs actual",
    type: "readonly",
    format: (_v, i) => {
      if (!i.targetReadyDate) return "No target set";
      if (!i.readyDate) {
        const d = daysUntil(i.targetReadyDate);
        return d < 0 ? `${-d} days past target, not ready` : `${d} days left`;
      }
      const late = daysBetween(i.targetReadyDate, i.readyDate);
      return late ? `Ready ${late} days late` : `Ready ${daysBetween(i.readyDate, i.targetReadyDate) || 0} days early`;
    },
  },
  {
    key: "turnDays",
    label: "Turn time",
    type: "readonly",
    format: (_v, i) => {
      const d = daysBetween(i.moveOutDate, i.readyDate || todayString());
      return d === null ? "—" : `${d} days${i.readyDate ? "" : " so far"}`;
    },
  },
];

// Status edits stamp the actual ready date when a turn becomes Ready; clearing
// the move or unit link keeps the other fields it had filled in.
export function turnCommit(item, onCommit) {
  return (partial) => {
    if ("moveId" in partial && !partial.moveId) return onCommit({ moveId: "" });
    if ("unitId" in partial && !partial.unitId) return onCommit({ unitId: "", unit: "" });
    if (partial.status === "Ready" && !item.readyDate && !("readyDate" in partial)) {
      return onCommit({ ...partial, readyDate: todayString() });
    }
    return onCommit(partial);
  };
}

export function TurnDetailsSection({ item, onPatch, onCommit, onCommitMeta }) {
  return (
    <FieldsForm item={item} fields={TURN_DETAIL_FIELDS} onPatch={onPatch} onCommit={turnCommit(item, onCommit)} onCommitMeta={onCommitMeta} />
  );
}

export function TurnDatesSection({ item, onPatch, onCommit, onCommitMeta }) {
  return <FieldsForm item={item} fields={TURN_DATE_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />;
}

// --- Make-ready checklist ------------------------------------------------------

export function TurnChecklistSection({ item, onCommitMeta }) {
  const [rows, setRows] = useState(() => checklistOf(item));
  const [seed, setSeed] = useState(item.id);
  const [label, setLabel] = useState("");
  if (seed !== item.id) {
    setSeed(item.id);
    setRows(checklistOf(item));
  }
  const persist = (next) => onCommitMeta({ checklist: next });
  const edit = (id, patch) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const editNow = (id, patch) => {
    const next = rows.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setRows(next);
    persist(next);
  };
  const add = () => {
    const v = label.trim();
    if (!v) {
      toast.error("Name the task.");
      return;
    }
    const next = [...rows, { id: crypto.randomUUID(), label: v, owner: "", dueDate: "", status: "To do", done: false }];
    setRows(next);
    setLabel("");
    persist(next);
  };
  const addTemplate = () => {
    const have = new Set(rows.map((r) => r.label));
    const next = [...rows, ...newChecklist().filter((t) => !have.has(t.label))];
    setRows(next);
    persist(next);
  };
  const remove = (id) => {
    const next = rows.filter((x) => x.id !== id);
    setRows(next);
    persist(next);
  };
  const done = rows.filter(isDoneTask).length;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-subtle px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">
            {done} of {rows.length} tasks done
          </span>
          <span className="font-medium tabular-nums text-foreground">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-active">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="e.g. Replace blinds"
          className="bg-surface-card"
        />
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={add}>
          <Plus className="h-4 w-4" /> Add Task
        </Button>
        <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={addTemplate}>
          <ListPlus className="h-4 w-4" /> Standard Tasks
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={ClipboardList} title="No tasks yet" description="Add tasks or load the standard make-ready checklist." />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {rows.map((t) => {
            const overdue = !isDoneTask(t) && (daysUntil(t.dueDate) ?? 1) < 0;
            return (
              <li key={t.id} className="grid gap-2 px-4 py-3 lg:grid-cols-[24px_1fr_150px_150px_130px_32px] lg:items-center">
                <Checkbox
                  checked={isDoneTask(t)}
                  onCheckedChange={(v) => editNow(t.id, { done: Boolean(v), status: v ? "Done" : "To do" })}
                  aria-label={`Done: ${t.label}`}
                />
                <Input
                  value={t.label}
                  aria-label="Task"
                  className={isDoneTask(t) ? "bg-surface-card text-text-tertiary line-through" : "bg-surface-card"}
                  onChange={(e) => edit(t.id, { label: e.target.value })}
                  onBlur={() => persist(rows)}
                />
                <Input
                  value={t.owner || ""}
                  placeholder="Owner"
                  aria-label="Owner"
                  className="bg-surface-card"
                  onChange={(e) => edit(t.id, { owner: e.target.value })}
                  onBlur={() => persist(rows)}
                />
                <Input
                  type="date"
                  value={t.dueDate || ""}
                  aria-label="Due date"
                  className={overdue ? "bg-surface-card text-red-600 dark:text-red-400" : "bg-surface-card"}
                  onChange={(e) => editNow(t.id, { dueDate: e.target.value })}
                />
                <Select
                  value={t.status || (t.done ? "Done" : "To do")}
                  onValueChange={(v) => editNow(t.id, { status: v, done: v === "Done" })}
                >
                  <SelectTrigger className="bg-surface-card" aria-label="Task status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TURN_TASK_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="justify-self-end text-red-600 dark:text-red-300 hover:bg-red-500/10"
                  onClick={() => remove(t.id)}
                  aria-label={`Remove ${t.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --- Vendor tasks (linked work orders) ---------------------------------------------

export const VENDOR_TASK_FIELDS = [
  { key: "name", label: "Task", type: "text", required: true, full: true },
  { key: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
  { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
  { key: "vendorId", label: "Vendor", type: "relation", load: vendorOptions, displayKey: "vendorName" },
  { key: "scheduledDate", label: "Scheduled date", type: "date" },
  { key: "estimate", label: "Estimate", type: "currency" },
  { key: "notes", label: "Instructions", type: "textarea" },
];

export const vendorTaskDefaults = (turn) => ({
  name: "",
  category: "General",
  priority: turn.metadata?.rush ? "High" : "Medium",
  vendorId: "",
  vendorName: "",
  scheduledDate: "",
  estimate: "",
  notes: "",
});

// Create a work order linked to the turn. Returns the work order or null.
export async function createVendorTask(turn, v) {
  const at = new Date().toISOString();
  const wo = await workOrdersLayer.create({
    id: crypto.randomUUID(),
    name: v.name.trim(),
    kind: "work_order",
    status: v.scheduledDate ? "Scheduled" : "Open",
    priority: v.priority || "Medium",
    category: v.category || "",
    unitTurnId: turn.id,
    unitId: turn.unitId || "",
    propertyId: turn.propertyId || "",
    propertyLabel: turn.unit || turn.propertyName || "",
    vendorId: v.vendorId || "",
    vendorName: v.vendorName || "",
    scheduledDate: v.scheduledDate || "",
    metadata: {
      source: "turn",
      dueDate: turn.targetReadyDate || "",
      estimateAmount: Number(v.estimate) || 0,
      assignmentNotes: v.notes || "",
      statusHistory: [
        { id: crypto.randomUUID(), status: v.scheduledDate ? "Scheduled" : "Open", from: "", at, by: await actorName(), note: `Created from unit turn "${turn.name}"` },
      ],
    },
  });
  if (wo) logSystemActivity("workorder", wo.id, "created", `Created from unit turn "${turn.name}"`);
  return wo;
}

export function VendorTasksSection({ item }) {
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const rows = useTurnWorkOrders(item.id, version);
  const { openItemInTab } = useWorkspaceUrl();

  const create = async (v) => {
    const wo = await createVendorTask(item, v);
    if (!wo) {
      toast.error("Couldn't create the vendor task.");
      return false;
    }
    toast.success(`Work order "${wo.name}" created.`);
    setVersion((n) => n + 1);
    return true;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Vendor work for this turn runs as work orders, so costs and status roll up here.
        </p>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Vendor Task
        </Button>
      </div>
      {rows === null ? (
        <ListLoading label="Loading vendor tasks" className="py-10" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Wrench} title="No vendor tasks yet" description="Create work orders for painters, cleaners and other trades." />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {rows.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                onClick={() => openItemInTab(w.id, "Work Orders")}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{w.name}</span>
                    <StatusPill status={w.status} map={MAINTENANCE_STATUS_MAP} />
                  </div>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {[w.vendorName || "Unassigned", w.scheduledDate && formatDate(w.scheduledDate)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-foreground">
                  {currency(w.totalCost || w.metadata?.estimateAmount)}
                  {!Number(w.totalCost) && Number(w.metadata?.estimateAmount) ? <Badge variant="outline">Est.</Badge> : null}
                  <ExternalLink className="h-3.5 w-3.5 text-text-secondary" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <WizardDialog
        open={open}
        onOpenChange={setOpen}
        title="New Vendor Task"
        description="Creates a work order linked to this turn."
        steps={[{ key: "task", title: "Task", fields: VENDOR_TASK_FIELDS }]}
        initial={vendorTaskDefaults(item)}
        finishLabel="Create Work Order"
        onFinish={create}
      />
    </div>
  );
}

// --- Budget vs actual --------------------------------------------------------------

export function TurnBudgetSection({ item, onPatch, onCommit, onCommitMeta }) {
  const wos = useTurnWorkOrders(item.id);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const costs = costsOf(item);
  const woActual = woTotal(wos);
  const committed = (wos || []).reduce((s, w) => s + (Number(w.totalCost) ? 0 : Number(w.metadata?.estimateAmount) || 0), 0);
  const actual = actualOf(item, woActual);
  const budget = Number(item.budget) || 0;
  const variance = budget - actual;

  const addCost = () => {
    if (!label.trim() || !(Number(amount) > 0)) {
      toast.error("Add a description and an amount.");
      return;
    }
    onCommitMeta({ costs: [...costs, { id: crypto.randomUUID(), label: label.trim(), amount: Number(amount) }] });
    setLabel("");
    setAmount("");
  };

  return (
    <div className="space-y-4">
      <SectionCard>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "Budget", value: budget ? currency(budget) : "Not set" },
            { label: "Work orders", value: wos === null ? "…" : currency(woActual) },
            { label: "Other costs", value: currency(otherCostOf(item)) },
            { label: "Actual", value: currency(actual) },
            {
              label: variance < 0 ? "Over budget" : "Remaining",
              value: budget ? currency(Math.abs(variance)) : "—",
              tone: variance < 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
            },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{s.label}</dt>
              <dd className={`mt-1 text-lg font-semibold tabular-nums ${s.tone || "text-foreground"}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
        {committed ? (
          <p className="mt-3 text-xs text-text-secondary">Plus {currency(committed)} estimated on work orders not yet costed.</p>
        ) : null}
      </SectionCard>

      <FieldsForm
        item={item}
        fields={[
          { key: "budget", label: "Turn budget", type: "currency" },
          meta({ key: "budgetNotes", label: "Budget notes", type: "text" }),
        ]}
        onPatch={onPatch}
        onCommit={onCommit}
        onCommitMeta={onCommitMeta}
      />

      <SectionCard title="Other costs" description="Costs not on a work order — supplies, in-house labor, utilities." bodyPadding={false}>
        <div className="flex flex-col gap-2 border-b border-border px-5 py-3 sm:flex-row">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Paint supplies" className="bg-surface-card" />
          <Input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="bg-surface-card sm:w-32"
          />
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={addCost}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {costs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-secondary">No other costs.</p>
        ) : (
          <ul className="divide-y divide-border">
            {costs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="truncate text-sm text-foreground">{c.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm tabular-nums text-foreground">{currency(c.amount)}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
                    onClick={() => onCommitMeta({ costs: costs.filter((x) => x.id !== c.id) })}
                    aria-label={`Remove ${c.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
