"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, CalendarClock, CalendarDays, Loader2, PauseCircle, Play, PlayCircle, TriangleAlert } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@geiger/ui/popover";
import { DataTable, EmptyState, SettingRow, StatusPill } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { listScheduledJobs, runDueJobsNow, runJobAsOf, runJobNow, setScheduledJobsPaused } from "@/lib/messaging/api";
import { JOB_RUN_STATUS_MAP, JOB_TRIGGER_LABEL, formatDate, formatDateTime } from "./shared";

// Scheduled jobs panel (Automations header, CORE-10): each job's schedule, last run in this project, next scheduled time, alert and runbook;
// "Run now" for this project, "Run as of…" and the pause switch for admins (Manage settings), and this project's recent runs.

const OUTLINE = "border-border bg-surface-card hover:bg-surface-hover";
const counts = (r) => `${r.processed} processed · ${r.created} sent/created · ${r.skipped} skipped`;
const triggerLabel = (r) => `${JOB_TRIGGER_LABEL[r.triggerSource] || r.triggerSource}${r.asOf ? ` as of ${formatDate(r.asOf)}` : ""}`;
const localToday = () => new Date().toLocaleDateString("en-CA");

const RUNBOOK_FIELDS = [
  ["writes", "Writes"],
  ["rerun", "Safe to re-run"],
  ["catchUp", "Catch-up"],
  ["fix", "Typical failure → fix"],
];

function Runbook({ runbook }) {
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-lg border border-border bg-surface-card px-4 py-3 sm:grid-cols-2">
      {RUNBOOK_FIELDS.map(([key, label]) => (
        <div key={key} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</dt>
          <dd className="mt-0.5 text-xs text-text-secondary">{runbook[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

function RunAsOf({ job, busy, onRun }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const onOpenChange = (next) => {
    setOpen(next);
    if (next) setDate(localToday());
  };
  const submit = () => {
    setOpen(false);
    onRun(job, date);
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={OUTLINE} disabled={busy}>
          <CalendarDays className="h-3.5 w-3.5" />
          Run as of…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-border bg-surface-subtle">
        <p className="text-sm font-medium text-foreground">Run {job.label} as of</p>
        <p className="mt-0.5 text-xs text-text-secondary">Runs as of noon on that date in the company time zone. Anything already posted is never posted again.</p>
        <Input type="date" aria-label="As-of date" className="mt-3" max={localToday()} value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="mt-3 flex justify-end">
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!date} onClick={submit}>
            <Play className="h-3.5 w-3.5" />
            Run
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function JobRow({ job, busy, canManage, onRun, onRunAsOf }) {
  const [showRunbook, setShowRunbook] = useState(false);
  const last = job.last;
  return (
    <div className="px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{job.label}</p>
            {last ? <StatusPill status={last.status} map={JOB_RUN_STATUS_MAP} /> : null}
            {job.alert ? (
              <Badge variant="danger">
                <TriangleAlert />
                {job.alert.message}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-text-secondary">{job.description}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {job.scheduleLabel}
            {job.nextRunAt ? ` · next ${formatDateTime(job.nextRunAt)}` : ""}
            {" · "}
            {job.moduleOff
              ? `${job.moduleOff} is off in Settings → Modules`
              : last
                ? `Last run ${formatDateTime(last.startedAt)} (${triggerLabel(last)}) — ${counts(last)}`
                : "Never run"}
            {last?.errorCount ? ` · ${last.errorCount} error${last.errorCount === 1 ? "" : "s"}` : ""}
          </p>
          {last?.reason ? <p className="mt-1 text-xs text-text-tertiary">{last.reason}.</p> : null}
          {last?.errorCount && last.errors?.length ? <p className="mt-1 truncate text-xs text-red-600 dark:text-red-400">{last.errors[0]}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {job.runbook ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" aria-expanded={showRunbook} onClick={() => setShowRunbook((v) => !v)}>
              <BookOpen className="h-3.5 w-3.5" />
              Runbook
            </Button>
          ) : null}
          {job.asOf && canManage ? <RunAsOf job={job} busy={busy} onRun={onRunAsOf} /> : null}
          <Button variant="outline" size="sm" className={OUTLINE} disabled={busy} onClick={() => onRun(job)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run Now
          </Button>
        </div>
      </div>
      {showRunbook && job.runbook ? <Runbook runbook={job.runbook} /> : null}
    </div>
  );
}

const HISTORY_COLUMNS = (labels) => [
  { key: "jobKey", header: "Job", render: (r) => <span className="text-sm text-foreground">{labels[r.jobKey] || r.jobKey}</span> },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={JOB_RUN_STATUS_MAP} /> },
  { key: "triggerSource", header: "Trigger", className: "text-sm text-muted-foreground", render: triggerLabel },
  { key: "counts", header: "Result", className: "text-xs text-text-secondary", render: (r) => (r.reason && !r.processed ? r.reason : counts(r)) },
  { key: "startedAt", header: "Started", align: "right", className: "text-right text-sm text-muted-foreground", render: (r) => formatDateTime(r.startedAt) },
];

function Notice({ children }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function ScheduledJobsDialog({ open, onOpenChange }) {
  const canManage = usePermission("settings.manage");
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => listScheduledJobs().then(setCatalog), []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listScheduledJobs().then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, [open]);

  const report = (res, label) => {
    if (res.status === "skipped_locked") return toast.info(`${label} is already running — try again in a few minutes.`);
    if (res.status === "skipped") return toast.info(`${label} skipped — ${res.reason || "nothing to do"}.`);
    if (res.status === "failed") return toast.error(`${label} failed — ${res.errors?.[0] || "see recent runs"}.`);
    if (!res.status) return toast.error(res.error || `Couldn't run ${label}.`);
    toast.success(`${label}: ${res.processed ?? 0} processed, ${res.created ?? 0} sent/created${res.status === "partial" ? `, ${res.errors?.length || 0} failed` : ""}.`);
  };

  const run = async (job) => {
    setBusy(job.key);
    report(await runJobNow(job.key), job.label);
    setBusy(null);
    load();
  };

  const runAsOf = async (job, asOf) => {
    setBusy(job.key);
    report(await runJobAsOf(job.key, asOf), `${job.label} as of ${formatDate(asOf)}`);
    setBusy(null);
    load();
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
    load();
  };

  const togglePause = async (paused) => {
    setBusy("pause");
    const res = await setScheduledJobsPaused(paused);
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Couldn't save the pause switch.");
    toast.success(paused ? "Scheduled jobs are paused for this project." : "Scheduled jobs resumed.");
    load();
  };

  const jobs = catalog?.ok ? catalog.jobs : [];
  const labels = Object.fromEntries([...(catalog?.retired || []), ...jobs].map((j) => [j.key, j.label]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Scheduled jobs</DialogTitle>
          <DialogDescription>
            Billing, late fees, reminders, the automation runner and the other jobs that keep this project current. Once scheduling is on, each job runs on its own schedule
            (times in UTC) and a daily watchdog retries missed runs; &ldquo;Run now&rdquo; runs one for this project.
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
            {!catalog.cronConfigured ? <Notice>CRON_SECRET isn&rsquo;t set, so jobs only run when you press Run now.</Notice> : null}
            {catalog.cronConfigured && !catalog.schedulerLive ? (
              <Notice>No scheduled run in the last day — until scheduling is switched on, jobs run only when you press Run now.</Notice>
            ) : null}
            {!catalog.adminConfigured ? <Notice>SUPABASE_SERVICE_ROLE_KEY isn&rsquo;t set — manual runs use your own access.</Notice> : null}
            <div className="rounded-xl border border-border bg-surface-subtle px-5 py-4">
              <SettingRow
                icon={PauseCircle}
                title="Pause scheduled jobs"
                description={
                  catalog.paused
                    ? "Paused: scheduled runs skip this project and Run now won't post or send. Signals, impact and housekeeping still run by hand."
                    : "Stops every scheduled run for this project (logged as skipped): billing, late fees, autopay, reminders and the rest."
                }
                control={
                  <span className="flex items-center gap-2">
                    {busy === "pause" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
                    <Switch aria-label="Pause scheduled jobs" checked={Boolean(catalog.paused)} disabled={!canManage || busy === "pause"} onCheckedChange={togglePause} />
                  </span>
                }
              />
            </div>
            <div className="flex justify-end">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={Boolean(busy)} onClick={runAll}>
                {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Run Everything Due
              </Button>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
              {jobs.map((j) => (
                <JobRow key={j.key} job={j} canManage={canManage} busy={busy === j.key || busy === "all"} onRun={run} onRunAsOf={runAsOf} />
              ))}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Recent runs</p>
              <DataTable
                columns={HISTORY_COLUMNS(labels)}
                data={catalog.recent || []}
                getRowKey={(r) => r.id}
                empty={
                  <div className="rounded-xl border border-border bg-surface-subtle">
                    <EmptyState icon={CalendarClock} title="No runs yet" description="Scheduled runs and the ones you start with Run now appear here; runs that found nothing to do are left out." />
                  </div>
                }
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ScheduledJobsDialog;
