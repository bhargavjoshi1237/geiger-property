"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Play, PlayCircle, TriangleAlert } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Button } from "@geiger/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import { DataTable, EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
import { listJobRuns } from "@/lib/supabase/job_runs";
import { listScheduledJobs, runDueJobsNow, runJobNow } from "@/lib/messaging/api";
import { JOB_RUN_STATUS_MAP, formatDateTime } from "./shared";

// Scheduled jobs panel (Automations header): every registered job with its
// last run, a signed-in "Run now" (scoped to this project), and recent history
// from property.job_runs. Cron runs come from Vercel Cron via /api/cron/*.

const counts = (r) => `${r.processed} processed · ${r.created} sent/created · ${r.skipped} skipped`;

function JobRow({ job, last, busy, onRun }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{job.label}</p>
          {last ? <StatusPill status={last.status} map={JOB_RUN_STATUS_MAP} /> : null}
        </div>
        <p className="mt-0.5 text-xs text-text-secondary">{job.description}</p>
        <p className="mt-1 text-xs text-text-tertiary">
          {last ? `Last run ${formatDateTime(last.startedAt)} (${last.triggerSource}) — ${counts(last)}` : "Never run"}
          {last?.errorCount ? ` · ${last.errorCount} error${last.errorCount === 1 ? "" : "s"}` : ""}
        </p>
        {last?.errorCount && Array.isArray(last.errors) ? (
          <p className="mt-1 truncate text-xs text-red-600 dark:text-red-400">{last.errors[0]}</p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 border-border bg-surface-card hover:bg-surface-hover"
        disabled={busy}
        onClick={() => onRun(job)}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        Run Now
      </Button>
    </div>
  );
}

const HISTORY_COLUMNS = (labels) => [
  { key: "jobKey", header: "Job", render: (r) => <span className="text-sm text-foreground">{labels[r.jobKey] || r.jobKey}</span> },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={JOB_RUN_STATUS_MAP} /> },
  { key: "triggerSource", header: "Trigger", className: "text-sm capitalize text-muted-foreground", render: (r) => r.triggerSource },
  { key: "counts", header: "Result", className: "text-xs text-text-secondary", render: counts },
  { key: "startedAt", header: "Started", align: "right", className: "text-right text-sm text-muted-foreground", render: (r) => formatDateTime(r.startedAt) },
];

export function ScheduledJobsDialog({ open, onOpenChange }) {
  const [catalog, setCatalog] = useState(null);
  const [runs, setRuns] = useState(null);
  const [busy, setBusy] = useState(null);

  const loadRuns = useCallback(() => listJobRuns().then((rows) => setRuns(rows ?? [])), []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([listScheduledJobs(), listJobRuns()]).then(([c, r]) => {
      if (!alive) return;
      setCatalog(c);
      setRuns(r ?? []);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const report = (res, label) => {
    if (!res.ok) return toast.error(res.error || `Couldn't run ${label}.`);
    if (res.status === "failed") return toast.error(`${label} failed — ${res.errors?.[0] || "see history"}.`);
    toast.success(`${label}: ${res.processed ?? 0} processed, ${res.created ?? 0} sent/created.`);
  };

  const run = async (job) => {
    setBusy(job.key);
    report(await runJobNow(job.key), job.label);
    setBusy(null);
    loadRuns();
  };

  const runAll = async () => {
    setBusy("all");
    const res = await runDueJobsNow();
    setBusy(null);
    if (!res.ok) toast.error(res.error || "Couldn't run due jobs.");
    else {
      const ran = (res.results || []).filter((r) => r.status !== "not_due").length;
      toast.success(ran ? `Ran ${ran} due job${ran === 1 ? "" : "s"}.` : "Nothing was due.");
    }
    loadRuns();
  };

  const jobs = catalog?.ok ? catalog.jobs : [];
  const labels = Object.fromEntries(jobs.map((j) => [j.key, j.label]));
  const lastOf = (key) => (runs || []).find((r) => r.jobKey === key) || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Scheduled jobs</DialogTitle>
          <DialogDescription>
            Reminders, scheduled announcements, and the automation runner. Vercel Cron runs them daily; &ldquo;Run now&rdquo; runs one for this project.
          </DialogDescription>
        </DialogHeader>

        {catalog === null ? (
          <div className="flex justify-center py-12">
            <LogoLoading size={40} aria-label="Loading jobs" />
          </div>
        ) : !catalog.ok ? (
          <EmptyState icon={TriangleAlert} title="Scheduled jobs are unavailable" description={catalog.error} />
        ) : (
          <div className="space-y-4">
            {!catalog.cronConfigured || !catalog.adminConfigured ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {!catalog.cronConfigured ? "CRON_SECRET isn't set, so jobs only run when you press Run now. " : ""}
                {!catalog.adminConfigured ? "SUPABASE_SERVICE_ROLE_KEY isn't set — manual runs use your own access." : ""}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy)} onClick={runAll}>
                {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Run Everything Due
              </Button>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
              {jobs.map((j) => (
                <JobRow key={j.key} job={j} last={lastOf(j.key)} busy={busy === j.key || busy === "all"} onRun={run} />
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Recent runs</p>
              {runs === null ? null : (
                <DataTable
                  columns={HISTORY_COLUMNS(labels)}
                  data={runs.slice(0, 25)}
                  getRowKey={(r) => r.id}
                  empty={
                    <div className="rounded-xl border border-border bg-surface-subtle">
                      <EmptyState icon={CalendarClock} title="No runs yet" description="Runs appear after the first cron call or Run now." />
                    </div>
                  }
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ScheduledJobsDialog;
