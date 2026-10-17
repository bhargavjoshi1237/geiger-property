"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, History, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { automationsData } from "@/lib/supabase/automations";
import { cancelAutomationRun, listAutomationRuns } from "@/lib/supabase/automation_runs";
import { RECORD_TYPES, stepSummary, triggerLabel } from "@/lib/automations/catalog";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { RUN_STATUS_MAP, STEP_LOG_STATUS_MAP, filterOptions, formatDateTime } from "./shared";

// Run History — every automation run across all workflows (reads property.automation_runs, written by the runner),
// with a per-step log sheet; queued / waiting runs can be cancelled from here too.

const IN_PROGRESS = ["pending", "running", "waiting"];
const STATUS_OPTIONS = filterOptions(RUN_STATUS_MAP);

const stepsOf = (run) => (Array.isArray(run?.steps) ? run.steps : []);
const logOf = (run) => (Array.isArray(run?.log) ? run.log : []);
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

function RunDetailSheet({ run, workflowName, onClose, onCancel, onOpenWorkflow }) {
  const steps = stepsOf(run);
  const log = logOf(run);
  return (
    <Sheet open={Boolean(run)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
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
                {stepsDone(run)}/{steps.length} steps
              </Badge>
            </div>

            {run.error ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">{run.error}</div>
            ) : null}

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
                <p className="text-xs text-text-tertiary">{run.status === "waiting" ? "Resumes" : "Finished"}</p>
                <p className="text-foreground">{formatDateTime(run.status === "waiting" ? run.resumeAt : run.finishedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Trigger</p>
                <p className="truncate text-foreground">{triggerLabel(run.eventType)}</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Steps</p>
              {steps.length ? (
                <ol className="space-y-2">
                  {steps.map((s, i) => {
                    const entry = [...log].reverse().find((l) => l.step === i);
                    return (
                      <li key={s.id || i} className="flex items-start gap-3 rounded-lg border border-border bg-surface-subtle p-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[10px] text-text-secondary">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{stepSummary(s)}</p>
                          {entry?.message ? <p className="mt-0.5 text-xs text-text-secondary">{entry.message}</p> : null}
                        </div>
                        {entry ? <StatusPill status={entry.status} map={STEP_LOG_STATUS_MAP} /> : <Badge variant="outline">Not run</Badge>}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-text-secondary">No step-level detail was recorded for this run.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {run.automationId ? (
                <Button
                  variant="outline"
                  className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  onClick={() => onOpenWorkflow(run.automationId)}
                >
                  <Pencil className="h-4 w-4" /> Open workflow
                </Button>
              ) : null}
              {["pending", "waiting"].includes(run.status) ? (
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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const { openItemInTab } = useWorkspaceUrl();

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

  // Prefer the workflow's current name; fall back to the name the run snapshotted.
  const workflowName = useMemo(() => {
    const names = new Map(workflows.map((w) => [w.id, w.name]));
    return (run) => names.get(run.automationId) || run.automationName || "Deleted workflow";
  }, [workflows]);

  const workflowOptions = useMemo(
    () => [{ value: "all", label: "All workflows" }, ...workflows.map((w) => ({ value: w.id, label: w.name || "Untitled workflow" }))],
    [workflows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (workflowFilter !== "all" && r.automationId !== workflowFilter) return false;
      if (q && !`${workflowName(r)} ${recordName(r)} ${triggerLabel(r.eventType)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [runs, status, workflowFilter, search, workflowName]);

  const stats = useMemo(() => {
    const count = (s) => runs.filter((r) => r.status === s).length;
    const completed = count("completed");
    const failed = count("failed");
    const finished = completed + failed;
    const active = runs.filter((r) => IN_PROGRESS.includes(r.status)).length;
    return [
      { label: "Total runs", value: runs.length.toLocaleString("en-US"), footer: "All time" },
      { label: "Success rate", value: `${finished ? Math.round((completed / finished) * 100) : 0}%`, footer: `${completed} completed` },
      { label: "Failed", value: String(failed), footer: "Needs attention" },
      { label: "In progress", value: String(active), footer: `${count("waiting")} waiting on a delay` },
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

  const columns = [
    {
      key: "workflow",
      header: "Workflow",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{workflowName(r)}</span>
          <span className="text-xs text-text-secondary">When {triggerLabel(r.eventType).toLowerCase()}</span>
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

  const filtersActive = status !== "all" || workflowFilter !== "all" || search;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Run History"
        description="Every time a workflow fires, its outcome lands here — the trigger, the record it ran for, timing, and a per-step log of what happened."
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={status} onValueChange={setStatus} options={STATUS_OPTIONS} height="h-9" />
          <FilterDropdown value={workflowFilter} onValueChange={setWorkflowFilter} options={workflowOptions} height="h-9" />
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
                title={runs.length ? "No runs match your filters" : "No runs yet"}
                description={
                  runs.length
                    ? "Try clearing the search or filters."
                    : "Once a switched-on workflow's trigger fires, each run shows up here with its step-by-step outcome."
                }
                action={
                  filtersActive && runs.length ? (
                    <Button
                      variant="outline"
                      className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      onClick={() => {
                        setSearch("");
                        setStatus("all");
                        setWorkflowFilter("all");
                      }}
                    >
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
        onClose={() => setSelectedId(null)}
        onCancel={handleCancel}
        onOpenWorkflow={(id) => openItemInTab(id, "All Workflows")}
      />
    </MainScreenWrapper>
  );
}

export default RunHistoryScreen;
