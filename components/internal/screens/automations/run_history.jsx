"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Download, History, Loader2, Pencil, RotateCcw } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui/sheet";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ListLoading,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { downloadCsvText } from "@/components/internal/screens/reports/report_view";
import { automationsData } from "@/lib/supabase/automations";
import { cancelAutomationRun, listAutomationRuns } from "@/lib/supabase/automation_runs";
import { reviewItemsLayer } from "@/lib/supabase/review_items";
import { RECORD_TYPES, triggerLabel } from "@/lib/automations/catalog";
import { explainRun } from "@/lib/orchestration/explain";
import { reviewAction } from "@/lib/orchestration/api";
import { tableCsv } from "@/lib/reports/csv";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { usePermission } from "@/context/rbac-context";
import { RUN_STATUS_MAP, filterOptions, formatDateTime } from "./shared";
import { RunSteps, RunWhy } from "./run_detail";

// Run History — every automation run across all workflows (reads property.automation_runs, written by the runner):
// why each run ran, a per-step log with inputs, outputs and record links, filters by workflow / record / status,
// Retry for failed runs and a CSV export. Skipped evaluations (conditions didn't hold) are kept 30 days on their own tab.

const IN_PROGRESS = ["pending", "running", "waiting", "retrying", "waiting_review", "waiting_approval"];
const STATUS_OPTIONS = filterOptions(Object.fromEntries(Object.entries(RUN_STATUS_MAP).filter(([k]) => k !== "skipped")));
const VIEWS = [
  { value: "runs", label: "Runs" },
  { value: "skipped", label: "Skipped evaluations" },
];

const stepsOf = (run) => (Array.isArray(run?.steps) ? run.steps : []);
const stepsDone = (run) => Math.min(Number(run.currentStep) || 0, stepsOf(run).length);
const recordName = (run) => run.recordLabel || (run.recordType ? RECORD_TYPES[run.recordType]?.label : "Scheduled run");

function durationMs(run) {
  if (!run.startedAt || !run.finishedAt) return null;
  return Math.max(0, new Date(run.finishedAt) - new Date(run.startedAt));
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const sectionLabel = "mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary";
const outlineButton = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";

function RunDetailSheet({ run, workflowName, onClose, onCancel, onRetry, retrying, onOpenWorkflow }) {
  return (
    <Sheet open={Boolean(run)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{workflowName || "Workflow run"}</SheetTitle>
          <SheetDescription>
            When {triggerLabel(run?.eventType).toLowerCase()} · {formatDateTime(run?.startedAt)}
          </SheetDescription>
        </SheetHeader>

        {run ? (
          <div className="space-y-6 px-4 pb-8 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={run.status} map={RUN_STATUS_MAP} />
              <Badge variant="neutral">{formatDuration(durationMs(run))}</Badge>
              <Badge variant="neutral">
                {stepsDone(run)}/{stepsOf(run).length} steps
              </Badge>
              {Number(run.attempt) > 0 ? <Badge variant="outline">Attempt {Number(run.attempt) + 1}</Badge> : null}
            </div>

            {run.error ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{run.error}</div>
            ) : null}

            <div>
              <p className={sectionLabel}>Why this ran</p>
              <div className="rounded-lg border border-border bg-surface-subtle p-3">
                <RunWhy run={run} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-text-tertiary">Record</p>
                <p className="truncate text-foreground">{recordName(run)}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Started</p>
                <p className="text-foreground">{formatDateTime(run.startedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">
                  {run.status === "retrying" ? "Next retry" : run.status === "waiting" ? "Resumes" : "Finished"}
                </p>
                <p className="text-foreground">
                  {formatDateTime(run.status === "retrying" ? run.nextRetryAt : run.status === "waiting" ? run.resumeAt : run.finishedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Trigger</p>
                <p className="truncate text-foreground">{triggerLabel(run.eventType)}</p>
              </div>
            </div>

            {run.status !== "skipped" ? (
              <div>
                <p className={sectionLabel}>Steps</p>
                <RunSteps run={run} />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {run.automationId ? (
                <Button variant="outline" className={outlineButton} onClick={() => onOpenWorkflow(run.automationId)}>
                  <Pencil className="h-4 w-4" /> Open workflow
                </Button>
              ) : null}
              {["failed", "retrying"].includes(run.status) ? (
                <Button variant="outline" className={outlineButton} disabled={retrying} onClick={() => onRetry(run)}>
                  {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Retry from the failed step
                </Button>
              ) : null}
              {onCancel && ["pending", "waiting", "retrying"].includes(run.status) ? (
                <Button variant="ghost" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400" onClick={() => onCancel(run)}>
                  <Ban className="h-4 w-4" /> Cancel run
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function RunHistoryScreen() {
  const [runs, setRuns] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("runs");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [recordFilter, setRecordFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const { itemId, openItemInTab, closeItem } = useWorkspaceUrl();
  const canExport = usePermission("reports.export");
  // Cancelling a run needs automation.manage in the database (PLAT-01d).
  const canCancel = usePermission("automations.manage");

  const load = () =>
    listAutomationRuns().then((rows) => {
      setRuns(rows ?? []);
      setLoading(false);
    });

  useEffect(() => {
    let alive = true;
    listAutomationRuns().then((rows) => {
      if (!alive) return;
      setRuns(rows ?? []);
      setLoading(false);
    });
    automationsData.list().then((rows) => alive && setWorkflows(rows ?? []));
    return () => {
      alive = false;
    };
  }, []);

  // A deep link (?item=<runId>) opens that run, e.g. from a record's "Automation Runs" section.
  const [linked, setLinked] = useState(null);
  if (itemId && itemId !== linked && runs.length) {
    setLinked(itemId);
    const target = runs.find((r) => r.id === itemId);
    if (target) {
      setSelectedId(target.id);
      if (target.status === "skipped") setView("skipped");
    }
  }

  // Prefer the workflow's current name; fall back to the name the run snapshotted.
  const workflowName = useMemo(() => {
    const names = new Map(workflows.map((w) => [w.id, w.name]));
    return (run) => names.get(run.automationId) || run.automationName || "Deleted workflow";
  }, [workflows]);

  const workflowOptions = useMemo(
    () => [{ value: "all", label: "All workflows" }, ...workflows.map((w) => ({ value: w.id, label: w.name || "Untitled workflow" }))],
    [workflows],
  );

  const recordOptions = useMemo(() => {
    const seen = new Map();
    for (const r of runs) if (r.recordId && !seen.has(r.recordId)) seen.set(r.recordId, recordName(r));
    return [{ value: "all", label: "All records" }, ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))];
  }, [runs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      if ((view === "skipped") !== (r.status === "skipped")) return false;
      if (view === "runs" && status !== "all" && r.status !== status) return false;
      if (workflowFilter !== "all" && r.automationId !== workflowFilter) return false;
      if (recordFilter !== "all" && r.recordId !== recordFilter) return false;
      if (q && !`${workflowName(r)} ${recordName(r)} ${triggerLabel(r.eventType)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [runs, view, status, workflowFilter, recordFilter, search, workflowName]);

  const stats = useMemo(() => {
    const real = runs.filter((r) => r.status !== "skipped");
    const count = (s) => real.filter((r) => r.status === s).length;
    const completed = count("completed");
    const failed = count("failed");
    const finished = completed + failed;
    const active = real.filter((r) => IN_PROGRESS.includes(r.status)).length;
    return [
      { label: "Total runs", value: real.length.toLocaleString("en-US"), footer: `${runs.length - real.length} skipped evaluations` },
      { label: "Success rate", value: `${finished ? Math.round((completed / finished) * 100) : 0}%`, footer: `${completed} completed` },
      { label: "Failed", value: String(failed), footer: "Each one is in the Review Queue" },
      { label: "In progress", value: String(active), footer: `${count("waiting_approval") + count("waiting_review")} waiting on a person` },
    ];
  }, [runs]);

  const selected = selectedId ? runs.find((r) => r.id === selectedId) || null : null;

  const handleCancel = async (run) => {
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, status: "cancelled" } : r)));
    const ok = await cancelAutomationRun(run.id);
    if (!ok) {
      setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
      toast.error("Couldn't cancel the run.");
    } else toast.success("Run cancelled.");
  };

  // Retry goes through the run's review item, so the item and the run stay in step.
  const handleRetry = async (run) => {
    setRetryingId(run.id);
    const items = (await reviewItemsLayer.list({ dedupeKey: `run:${run.id}` })) || [];
    const open = items.find((i) => i.status === "open" || i.status === "snoozed");
    if (!open) {
      setRetryingId(null);
      toast.error("This run has no open review item to retry.");
      return;
    }
    const res = await reviewAction(open.id, "retry");
    setRetryingId(null);
    if (!res.ok) toast.error(res.error || "Couldn't retry the run.");
    else if (res.ok && res.run?.status === "failed") toast.error(res.message);
    else toast.success(res.message || "Retried.");
    load();
  };

  const exportCsv = () => {
    const columns = [
      { key: "workflow", header: "Workflow", value: (r) => workflowName(r) },
      { key: "record", header: "Record", value: (r) => recordName(r) },
      { key: "trigger", header: "Trigger", value: (r) => triggerLabel(r.eventType) },
      { key: "status", header: "Status", value: (r) => RUN_STATUS_MAP[r.status]?.label || r.status },
      { key: "startedAt", header: "Started", value: (r) => r.startedAt || "" },
      { key: "finishedAt", header: "Finished", value: (r) => r.finishedAt || "" },
      { key: "steps", header: "Steps done", value: (r) => `${stepsDone(r)}/${stepsOf(r).length}` },
      { key: "why", header: "Explanation", value: (r) => explainRun(r).headline },
      { key: "error", header: "Error", value: (r) => r.error || "" },
    ];
    downloadCsvText(view === "skipped" ? "automation-skipped-evaluations" : "automation-runs", tableCsv(columns, filtered));
  };

  const columns = [
    {
      key: "workflow",
      header: "Workflow",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{workflowName(r)}</span>
          <span className="line-clamp-1 text-xs text-text-secondary">{explainRun(r).headline}</span>
        </div>
      ),
    },
    { key: "record", header: "Record", className: "text-text-secondary", render: (r) => recordName(r) },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={RUN_STATUS_MAP} /> },
    { key: "started", header: "Started", className: "text-text-secondary", render: (r) => formatDateTime(r.startedAt) },
    {
      key: "duration",
      header: "Duration",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => formatDuration(durationMs(r)),
    },
    {
      key: "steps",
      header: "Steps",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => `${stepsDone(r)}/${stepsOf(r).length}`,
    },
  ];

  const filtersActive = status !== "all" || workflowFilter !== "all" || recordFilter !== "all" || search;
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setWorkflowFilter("all");
    setRecordFilter("all");
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Run History"
        description="Every time a workflow fires, its outcome lands here — why it ran, the record it ran for, timing, and a per-step log of what it did and touched."
        actions={
          canExport ? (
            <Button variant="outline" className={outlineButton} disabled={!filtered.length} onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          ) : null
        }
      />

      <StatsBar stats={stats} />

      <SegmentedTabs tabs={VIEWS} value={view} onChange={setView} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          {view === "runs" ? <FilterDropdown value={status} onValueChange={setStatus} options={STATUS_OPTIONS} height="h-9" /> : null}
          <FilterDropdown value={workflowFilter} onValueChange={setWorkflowFilter} options={workflowOptions} height="h-9" />
          <FilterDropdown value={recordFilter} onValueChange={setRecordFilter} options={recordOptions} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search runs…" />
      </Toolbar>

      {loading ? (
        <ListLoading label="Loading runs" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={History}
                title={filtersActive ? "No runs match your filters" : view === "skipped" ? "No skipped evaluations" : "No runs yet"}
                description={
                  filtersActive
                    ? "Try clearing the search or filters."
                    : view === "skipped"
                      ? "When a trigger fires but a workflow's conditions don't hold, the reason is kept here for 30 days."
                      : "Once a switched-on workflow's trigger fires, each run shows up here with its step-by-step outcome."
                }
                action={
                  filtersActive ? (
                    <Button variant="outline" className={outlineButton} onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : null
                }
              />
            </div>
          }
        />
      )}

      <RunDetailSheet
        run={selected}
        workflowName={selected ? workflowName(selected) : ""}
        onClose={() => {
          setSelectedId(null);
          if (itemId) closeItem();
        }}
        onCancel={canCancel ? handleCancel : null}
        onRetry={handleRetry}
        retrying={retryingId === selected?.id}
        onOpenWorkflow={(id) => openItemInTab(id, "All Workflows")}
      />
    </MainScreenWrapper>
  );
}

export default RunHistoryScreen;
