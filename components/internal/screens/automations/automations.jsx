"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  Clock,
  Filter,
  History,
  LayoutDashboard,
  ListOrdered,
  Pause,
  Play,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { automationsData } from "@/lib/supabase/automations";
import { listAutomationRuns } from "@/lib/supabase/automation_runs";
import {
  BUILT_IN_WORKFLOWS,
  CONDITION_OPS,
  TRIGGERS,
  getTrigger,
  stepSummary,
  triggerDefaults,
  triggerLabel,
} from "@/lib/automations/catalog";
import { makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { ConditionsSection, RunsSection, StepsSection, TriggerSection, workflowOf } from "./sections";
import { ScheduledJobsDialog } from "./scheduled_jobs";
import {
  AUTOMATION_STATUS_MAP,
  RUN_STATUS_MAP,
  filterOptions,
  formatDate,
  formatDateTime,
  selectOptions,
} from "./shared";

// Automations — event- and schedule-driven workflows (owns `property.automations`;
// runs in `property.automation_runs`). Record events are queued by DB triggers
// and executed by the automation runner job (lib/automations/runner.js).

const TRIGGER_OPTIONS = TRIGGERS.map((t) => ({ value: t.key, label: `${t.group} · ${t.label}` }));

const enabledPatch = (item, on) => ({
  enabled: on,
  status: on ? "Active" : item.status === "Active" ? "Paused" : item.status || "Draft",
});

// Create a workflow from a built-in starter (disabled until reviewed).
async function createFromTemplate(tpl, reload) {
  const created = await automationsData.create({
    id: crypto.randomUUID(),
    name: tpl.name,
    triggerEvent: tpl.triggerEvent,
    actionType: "workflow",
    enabled: false,
    status: "Draft",
    metadata: {
      trigger: { ...triggerDefaults(tpl.triggerEvent), ...tpl.trigger },
      conditionRules: tpl.conditionRules,
      steps: tpl.steps.map((s) => ({ ...s, id: crypto.randomUUID() })),
      builtIn: tpl.key,
    },
  });
  if (!created) return toast.error("Couldn't create the workflow.");
  toast.success(`"${tpl.name}" created — review it, then switch it on.`);
  reload();
}

function HeaderActions({ reload }) {
  const [jobsOpen, setJobsOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        onClick={() => setJobsOpen(true)}
      >
        <CalendarClock className="h-4 w-4" /> Scheduled jobs
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground">
            <Sparkles className="h-4 w-4" /> Templates <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 border-border bg-surface-subtle">
          {BUILT_IN_WORKFLOWS.map((t) => (
            <DropdownMenuItem key={t.key} onClick={() => createFromTemplate(t, reload)} className="items-start gap-2">
              <Workflow className="mt-0.5 h-4 w-4" />
              <div>
                <p className="text-sm text-foreground">{t.name}</p>
                <p className="text-xs text-text-secondary">{t.desc}</p>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ScheduledJobsDialog open={jobsOpen} onOpenChange={setJobsOpen} />
    </>
  );
}

const describeTrigger = (wf) => {
  const def = getTrigger(wf.triggerEvent);
  if (!def) return "No trigger";
  const t = { ...triggerDefaults(wf.triggerEvent), ...wf.trigger };
  if (wf.triggerEvent === "lease.ending") return `${def.label} — ${t.daysBefore} days before the end date`;
  if (wf.triggerEvent === "rent.overdue") return `${def.label} — ${t.daysOverdue} days after the due date, balance ≥ $${t.minBalance}`;
  if (wf.triggerEvent === "schedule") {
    const scope = def.config.find((f) => f.key === "scope").options.find((o) => o.value === t.scope)?.label;
    return `${t.frequency === "daily" ? "Daily" : t.frequency === "monthly" ? `Monthly on day ${t.monthDay}` : "Weekly"} · ${scope}`;
  }
  return def.label;
};

function OverviewSection({ item, onCommit, onNavigate }) {
  const wf = workflowOf(item);
  const [runs, setRuns] = useState(null);
  const id = item.id;
  useEffect(() => {
    let alive = true;
    listAutomationRuns(id).then((rows) => alive && setRuns(rows ?? []));
    return () => {
      alive = false;
    };
  }, [id]);

  const count = (s) => (runs || []).filter((r) => r.status === s).length;
  const toggle = async (on) => {
    if (on && !wf.steps.length) return toast.error("Add at least one step first.");
    const ok = await onCommit(enabledPatch(item, on));
    if (ok) toast.success(on ? "Workflow switched on." : "Workflow paused.");
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="Workflow"
        description={item.enabled ? "On — the runner picks up new triggers." : "Off — nothing runs until you switch it on."}
        action={
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">{item.enabled ? "On" : "Off"}</span>
            <Switch checked={Boolean(item.enabled)} onCheckedChange={toggle} aria-label="Enable workflow" />
          </div>
        }
      >
        <div className="space-y-4">
          <button type="button" onClick={() => onNavigate("trigger")} className="flex w-full items-start gap-3 text-left">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">When</p>
              <p className="text-sm text-foreground">{describeTrigger(wf)}</p>
            </div>
          </button>
          <button type="button" onClick={() => onNavigate("conditions")} className="flex w-full items-start gap-3 text-left">
            <Filter className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Only if</p>
              <p className="text-sm text-foreground">
                {wf.conditionRules.length
                  ? wf.conditionRules
                      .map((r) => `${r.field} ${CONDITION_OPS.find((o) => o.value === r.op)?.label || r.op} ${r.value ?? ""}`.trim())
                      .join(" · ")
                  : "Always"}
              </p>
            </div>
          </button>
          <button type="button" onClick={() => onNavigate("steps")} className="flex w-full items-start gap-3 text-left">
            <ListOrdered className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Then</p>
              {wf.steps.length ? (
                <ol className="mt-1 space-y-1">
                  {wf.steps.map((s, i) => (
                    <li key={s.id || i} className="text-sm text-foreground">
                      {i + 1}. {stepSummary(s)}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-text-tertiary">No steps yet</p>
              )}
            </div>
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Runs" description={item.lastRunOn ? `Last started ${formatDate(item.lastRunOn)}` : "Not run yet"}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Total", runs ? runs.length : "…"],
            ["Waiting", runs ? count("waiting") + count("pending") : "…"],
            ["Completed", runs ? count("completed") : "…"],
            ["Failed", runs ? count("failed") : "…"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-surface-card px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
            </div>
          ))}
        </div>
        {runs?.[0] ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
            Latest: {runs[0].recordLabel || "Scheduled run"} · {formatDateTime(runs[0].startedAt)}
            <StatusPill status={runs[0].status} map={RUN_STATUS_MAP} />
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}

const automationsConfig = {
  key: "automation",
  singular: "Workflow",
  plural: "Workflows",
  title: "Automations",
  description:
    "Workflows that react to lease, application, maintenance, payment and move events — or run on a schedule — and send messages, notify the team, open work orders, or wait.",
  icon: Workflow,
  titleField: "name",
  searchFields: ["name", "triggerLabel", "stepsLabel"],
  data: automationsData,
  rowsLoader: async () =>
    ((await automationsData.list()) ?? []).map((r) => {
      const wf = workflowOf(r);
      return { ...r, triggerLabel: triggerLabel(wf.triggerEvent), stepsLabel: wf.steps.map(stepSummary).join(" ") };
    }),

  statusMap: AUTOMATION_STATUS_MAP,
  statusFilterOptions: filterOptions(AUTOMATION_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "enabled", label: "On", filter: (r) => r.enabled },
    { value: "disabled", label: "Off", filter: (r) => !r.enabled },
  ],

  columns: [
    {
      key: "name",
      header: "Workflow",
      render: (r) => {
        const wf = workflowOf(r);
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground">{r.name}</span>
            <span className="text-xs text-text-secondary">
              {triggerLabel(wf.triggerEvent)} → {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}
            </span>
          </div>
        );
      },
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={AUTOMATION_STATUS_MAP} /> },
    {
      key: "enabled",
      header: "On",
      render: (r) => (r.enabled ? <Badge variant="success">On</Badge> : <Badge variant="outline">Off</Badge>),
    },
    {
      key: "runCount",
      header: "Runs",
      align: "right",
      className: "text-right text-sm tabular-nums text-muted-foreground",
      render: (r) => r.runCount || 0,
    },
    {
      key: "lastRunOn",
      header: "Last run",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.lastRunOn),
    },
  ],

  stats: (rows) => {
    const count = (s) => rows.filter((r) => r.status === s).length;
    const on = rows.filter((r) => r.enabled).length;
    const runs = rows.reduce((n, r) => n + (Number(r.runCount) || 0), 0);
    return [
      { label: "Workflows", value: String(rows.length), footer: `${count("Draft")} drafts` },
      { label: "Switched on", value: String(on), footer: "Running on new triggers" },
      { label: "Runs", value: String(runs), footer: "Started all-time" },
      { label: "Paused", value: String(count("Paused")), footer: "Temporarily off" },
    ];
  },

  headerActions: ({ reload }) => <HeaderActions reload={reload} />,

  createDraft: { name: "", triggerEvent: "lease.created" },
  createFields: [
    { key: "name", label: "Workflow name", type: "text", placeholder: "e.g. Welcome new residents", required: true },
    { key: "triggerEvent", label: "When", type: "select", options: TRIGGER_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    triggerEvent: draft.triggerEvent || "lease.created",
    actionType: "workflow",
    enabled: false,
    status: "Draft",
    metadata: { trigger: triggerDefaults(draft.triggerEvent || "lease.created"), conditionRules: [], steps: [] },
  }),

  headerMeta: (r) => {
    const wf = workflowOf(r);
    return [triggerLabel(wf.triggerEvent), `${wf.steps.length} steps`, r.enabled ? "On" : "Off"].join(" · ");
  },

  actions: (item) => [
    item.enabled
      ? { key: "pause", label: "Switch off", icon: Pause, run: (ctx) => ctx.commit(enabledPatch(ctx.item, false)) }
      : {
          key: "enable",
          label: "Switch on",
          icon: Play,
          run: (ctx) => {
            if (!workflowOf(ctx.item).steps.length) return toast.error("Add at least one step first.");
            return ctx.commit(enabledPatch(ctx.item, true));
          },
        },
    { key: "history", label: "Run history", icon: History, run: (ctx) => ctx.navigate("runs") },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "The workflow at a glance, on/off, and run stats." }],
    },
    {
      group: "Workflow",
      items: [
        { key: "trigger", label: "Trigger", icon: Zap, desc: "The event or schedule that starts it." },
        { key: "conditions", label: "Conditions", icon: Filter, desc: "Rules the record must match." },
        { key: "steps", label: "Steps", icon: ListOrdered, desc: "Ordered actions, waits and messages." },
      ],
    },
    {
      group: "History",
      items: [{ key: "runs", label: "Runs", icon: History, desc: "Every run with its per-step log." }],
    },
    {
      group: "General",
      items: [
        { key: "settings", label: "Settings", icon: Workflow, desc: "Name and status." },
        { key: "activity", label: "Notes", icon: Clock, desc: "Internal notes." },
      ],
    },
  ],
  sections: {
    overview: OverviewSection,
    trigger: TriggerSection,
    conditions: ConditionsSection,
    steps: StepsSection,
    runs: RunsSection,
    settings: makeFieldsSection([
      { key: "name", label: "Workflow name", type: "text", full: true },
      { key: "status", label: "Status", type: "select", options: selectOptions(AUTOMATION_STATUS_MAP) },
      { key: "enabled", label: "On", type: "switch" },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
};

export function AutomationsScreen() {
  return <EntityListScreen config={automationsConfig} />;
}

export default AutomationsScreen;
