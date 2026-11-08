import { createHash } from "node:crypto";
import { raiseReview } from "@/lib/orchestration/review";
import { getModule, loadModuleCheck } from "@/lib/modules";
import { JOBS, getJob } from "./registry";
import { emptyResult, errorMessage, errorProject } from "./contract";
import { forProject } from "@/lib/supabase/scope";
import { businessDate } from "@/lib/billing/periods";
import { LOCK_STALE_MINUTES, STALE_FACTOR, asOfProblem, intervalOf, isDueNow, isOverdue, isStale, parentStatus, zonedNoon } from "./schedule";
import { jobsPausedFor, pausedProjects, projectTimeZone } from "./business_date";
import { alertJobOutcome, alertMissedRun, alertOps } from "./alerts";
import { recordOperatorEvent, resolveOperatorEvents } from "@/lib/operator/events";

// Server-only: run scheduled jobs and record each execution in property.job_runs (CORE-10, PLAT-01b).
// Every run is one project's: a cron call writes a project-less parent row (operator-only) and fans out to one child row per
// project (trigger cron, its own status, timestamps and errors), so each project's Scheduled Jobs screen shows its runs.
// A running row is the lock (job_runs_running_lock): a second start for the same job and scope is logged as skipped_locked.

const MINUTE = 60000;
const SCHEDULED = new Set(["cron", "watchdog"]);
export const PAUSED_REASON = "Scheduled jobs are paused for this project";
export const WATCHDOG = { key: "run-due", label: "Watchdog" };

// Runner errors already raise their own review items (one per failed run).
const HANDLED_ELSEWHERE = /see the Review Queue/;

const scopeOf = (q, projectId) => (projectId ? q.eq("project_id", projectId) : q.is("project_id", null));

// One review item per distinct failure in the failing project's queue (ORCH-04, PLAT-01b); a project-less failure (a broken fan-out)
// is no member's, so it goes to the operator store (/operator, PLAT-01h). A clean run clears its own scope only (a parent: the operator's).
async function syncJobReviews(admin, job, { projectId, runId, failures, status, actorId }) {
  try {
    const failed = new Set(failures.map((f) => f.projectId || ""));
    for (const f of failures.filter((x) => !HANDLED_ELSEWHERE.test(x.message)).slice(0, 50)) {
      const hash = createHash("sha256").update(f.message.toLowerCase().trim()).digest("hex").slice(0, 16);
      const title = `${job.label || job.key} failed`;
      if (!f.projectId) {
        const detail = { jobKey: job.key, runId, status, message: f.message };
        await recordOperatorEvent(admin, { kind: "job_failure", source: job.key, summary: title, detail, dedupeKey: `job:${job.key}:${hash}` });
        continue;
      }
      await raiseReview(admin, {
        projectId: f.projectId,
        dedupeKey: `job:${job.key}:${hash}`,
        kind: "exception",
        sourceType: "job_run",
        sourceId: runId,
        title,
        reasonCode: "job_failed",
        context: { jobLabel: job.label || job.key, detail: f.message },
        severity: status === "failed" ? "urgent" : "soon",
        details: f.message,
        metadata: { jobKey: job.key },
      });
    }
    if (failed.has(projectId || "")) return;
    if (!projectId) await resolveOperatorEvents(admin, { kind: "job_failure", source: job.key });
    const q = admin.from("review_items").select("*").eq("source_type", "job_run").like("dedupe_key", `job:${job.key}:%`).in("status", ["open", "snoozed"]).is("deleted_at", null);
    const { data: open } = await (projectId ? forProject(q, projectId) : q.is("project_id", null));
    for (const row of open || []) {
      const at = new Date().toISOString();
      const resolution = { action: "cleared", note: "The job ran cleanly", by: actorId ? "Run now" : "Scheduler", at };
      await admin
        .from("review_items")
        .update({ status: "resolved", resolved_at: at, resolution, history: [...(row.history || []), { at, action: "cleared", note: resolution.note }] })
        .eq("id", row.id);
    }
  } catch (e) {
    console.error("[jobs.review]", e);
  }
}

// The status of the last finished run in a scope (the run before a skipped_locked).
async function previousStatus(admin, jobKey, projectId) {
  const { data } = await scopeOf(admin.from("job_runs").select("status").eq("job_key", jobKey).neq("status", "running").is("deleted_at", null), projectId)
    .order("started_at", { ascending: false })
    .limit(1);
  return data?.[0]?.status || null;
}

// Take the lock: abandon running rows older than LOCK_STALE_MINUTES (a dead worker), then insert the running row; a held lock logs skipped_locked.
async function startRun(admin, job, { projectId, trigger, actorId = null, metadata = {} }) {
  const at = new Date();
  try {
    const cutoff = new Date(at.getTime() - LOCK_STALE_MINUTES * MINUTE).toISOString();
    await scopeOf(
      admin
        .from("job_runs")
        .update({ status: "abandoned", finished_at: at.toISOString(), error_count: 1, errors: ["The run stopped part-way (the worker was interrupted)"] })
        .eq("job_key", job.key)
        .eq("status", "running")
        .lt("started_at", cutoff)
        .is("deleted_at", null),
      projectId,
    );
  } catch (e) {
    console.error("[jobs.lock.abandon]", e);
  }
  const row = { project_id: projectId, job_key: job.key, trigger_source: trigger, status: "running", started_at: at.toISOString(), created_by: actorId, metadata };
  try {
    const { data, error } = await admin.from("job_runs").insert(row).select("id").single();
    if (!error) return { runId: data?.id ?? null };
    if (error.code !== "23505") {
      console.error("[jobs.log.start]", error.message);
      return { runId: null };
    }
    const prevStatus = await previousStatus(admin, job.key, projectId);
    const reason = "An earlier run of this job was still in progress";
    const { data: locked } = await admin
      .from("job_runs")
      .insert({ ...row, status: "skipped_locked", finished_at: at.toISOString(), metadata: { ...metadata, reason } })
      .select("id")
      .single();
    return { locked: true, runId: locked?.id ?? null, prevStatus, reason };
  } catch (e) {
    console.error("[jobs.log.start]", e);
    return { runId: null };
  }
}

async function finishRun(admin, runId, fields) {
  if (!runId) return;
  try {
    await admin.from("job_runs").update({ finished_at: new Date().toISOString(), ...fields }).eq("id", runId);
  } catch (e) {
    console.error("[jobs.log.finish]", e);
  }
}

// A skip that doesn't run the job (paused project): logged once a day per job and project so the screen shows why.
async function logSkip(admin, job, { projectId, trigger, actorId, metadata, reason }) {
  const out = { ok: true, key: job.key, status: "skipped", reason, ...emptyResult() };
  try {
    const since = new Date(Date.now() - 1440 * MINUTE).toISOString();
    const { data: prior } = await admin
      .from("job_runs")
      .select("id")
      .eq("job_key", job.key)
      .eq("project_id", projectId)
      .eq("status", "skipped")
      .eq("metadata->>reason", reason)
      .gte("started_at", since)
      .is("deleted_at", null)
      .limit(1);
    if (prior?.length) return { ...out, runId: prior[0].id };
    const at = new Date().toISOString();
    const { data } = await admin
      .from("job_runs")
      .insert({ project_id: projectId, job_key: job.key, trigger_source: trigger, status: "skipped", started_at: at, finished_at: at, created_by: actorId, metadata: { ...metadata, reason } })
      .select("id")
      .single();
    return { ...out, runId: data?.id ?? null };
  } catch (e) {
    console.error("[jobs.log.skip]", e);
    return out;
  }
}

// One project's run. A paused project is skipped on a scheduled trigger, and on a manual one unless the job sets manualWhilePaused;
// a scheduled run alerts on a bad outcome. opts.asOf (jobs with asOf: true) runs as of noon on that business date; opts.overrides.jobsPaused stands in for the setting (tests).
async function runProject(job, { admin, now = new Date(), projectId, trigger = "manual", actorId = null, parentRunId = null, asOf = null, overrides = {}, deps = {} }) {
  const scheduled = SCHEDULED.has(trigger);
  const metadata = parentRunId ? { parentRunId } : {};
  if (asOf) {
    if (!job.asOf) return { ok: false, key: job.key, error: `${job.label || job.key} can't run as of a past date.` };
    const timeZone = await projectTimeZone(admin, projectId);
    const problem = asOfProblem(asOf, businessDate(new Date(), timeZone));
    if (problem) return { ok: false, key: job.key, error: problem };
    now = zonedNoon(asOf, timeZone);
    metadata.asOf = asOf;
  }
  // Settings → Modules: a module job skips (no row) while its module is off; run gets `moduleOn(projectId, key = job.module)`.
  const check = await loadModuleCheck(admin, projectId);
  const moduleOn = (pid, key = job.module) => check(pid || projectId, key);
  if (job.module && !moduleOn(projectId)) {
    const label = getModule(job.module)?.label || job.module;
    return { ok: true, key: job.key, status: "skipped", module: job.module, reason: `${label} is off in Settings → Modules`, ...emptyResult() };
  }
  const paused = overrides.jobsPaused ?? (await jobsPausedFor(admin, projectId));
  if (paused && (scheduled || !job.manualWhilePaused)) return logSkip(admin, job, { projectId, trigger, actorId, metadata, reason: PAUSED_REASON });

  const start = await startRun(admin, job, { projectId, trigger, actorId, metadata });
  if (start.locked) {
    if (scheduled) await alertJobOutcome(admin, { job, projectId, runId: start.runId, status: "skipped_locked", prevStatus: start.prevStatus, now }, deps);
    return { ok: true, key: job.key, runId: start.runId, status: "skipped_locked", reason: start.reason, ...emptyResult() };
  }

  let result = emptyResult();
  try {
    result = { ...emptyResult(), ...((await job.run({ admin, now, projectId, moduleOn })) || {}) };
  } catch (e) {
    console.error(`[jobs.${job.key}]`, e);
    result.errors = [...(result.errors || []), e?.message || String(e)];
  }
  // A project run's unattributed errors are its project's.
  const failures = (result.errors || []).map((e) => ({ projectId: errorProject(e) || projectId, message: errorMessage(e) }));
  const errors = failures.map((f) => (f.projectId !== projectId ? `${f.message} (project ${f.projectId})` : f.message));
  const status = errors.length ? (result.processed || result.created ? "partial" : "failed") : "succeeded";
  await finishRun(admin, start.runId, {
    status,
    processed: Number(result.processed) || 0,
    created: Number(result.created) || 0,
    skipped: Number(result.skipped) || 0,
    error_count: errors.length,
    errors: errors.slice(0, 50),
  });
  await syncJobReviews(admin, job, { projectId, runId: start.runId, failures, status, actorId });
  if (scheduled) await alertJobOutcome(admin, { job, projectId, runId: start.runId, status, errors, now }, deps);
  return { ok: status !== "failed", key: job.key, runId: start.runId, status, ...result, errors, ...(asOf ? { asOf } : {}) };
}

// Live projects with Property data (property.job_projects).
export async function listJobProjects(admin) {
  const { data, error } = await admin.rpc("job_projects");
  if (error) throw new Error(`job_projects: ${error.message}`);
  return (data || []).map((r) => (typeof r === "string" ? r : r?.job_projects)).filter(Boolean);
}

const childSummary = (c) => `project ${c.projectId}: ${c.errors?.[0] || c.status}${(c.errors?.length || 0) > 1 ? ` (+${c.errors.length - 1} more)` : ""}`;

// The cross-project run: a parent row (the job's global lock, operator-only), then one child run per project. `projects` narrows the
// fan-out (watchdog retries, operator reruns); `deadline` (epoch ms) stops starting projects before the function times out.
export async function runScheduledJob(job, { admin, now = new Date(), trigger = "cron", actorId = null, projects = null, deadline = null, deps = {} } = {}) {
  if (!job) return { ok: false, error: "Unknown job" };
  const label = job.label || job.key;
  const narrowed = projects ? { narrowed: projects.length } : {};
  const start = await startRun(admin, job, { projectId: null, trigger, actorId, metadata: narrowed });
  if (start.locked) {
    if (start.prevStatus === "skipped_locked") {
      const paragraphs = [`Two ${label} runs in a row found an earlier run still in progress.`, "Check the function logs for the run that never finished; a running row older than 15 minutes is abandoned on the next start."];
      await alertOps(admin, { jobKey: job.key, runId: start.runId, now, subject: `${label} is stuck`, paragraphs }, deps);
    }
    return { ok: true, key: job.key, runId: start.runId, status: "skipped_locked", reason: start.reason, ...emptyResult(), projects: [] };
  }
  const res = emptyResult();
  const children = [];
  const own = [];
  let ids = [];
  let left = 0;
  try {
    ids = projects || (await listJobProjects(admin));
    for (let i = 0; i < ids.length; i += 1) {
      if (deadline && Date.now() > deadline) {
        left = ids.length - i;
        own.push(`Out of time before ${left} project${left === 1 ? "" : "s"}; the watchdog runs them later`);
        break;
      }
      const out = await runProject(job, { admin, now, projectId: ids[i], trigger, actorId, parentRunId: start.runId, deps });
      children.push({ projectId: ids[i], status: out.status || "failed", runId: out.runId || null, errors: out.errors || (out.error ? [out.error] : []) });
      for (const k of ["processed", "created", "skipped"]) res[k] += Number(out[k]) || 0;
    }
    // Housekeeping-style jobs also sweep project-less rows (operator rows, snoozed project-less review items).
    if (job.projectless) {
      const sweep = (await job.projectless({ admin, now })) || {};
      for (const k of ["processed", "created", "skipped"]) res[k] += Number(sweep[k]) || 0;
      own.push(...(sweep.errors || []).map(errorMessage));
    }
  } catch (e) {
    console.error(`[jobs.${job.key}]`, e);
    own.push(e?.message || String(e));
  }
  let status = own.length && !children.length ? "failed" : parentStatus(children);
  if (status === "succeeded" && own.length) status = "partial";
  const errors = [...own, ...children.filter((c) => c.errors?.length || c.status === "failed").map(childSummary)];
  const count = (s) => children.filter((c) => c.status === s).length;
  await finishRun(admin, start.runId, {
    status,
    processed: res.processed,
    created: res.created,
    skipped: res.skipped,
    error_count: errors.length,
    errors: errors.slice(0, 50),
    metadata: { ...narrowed, projects: ids.length, failed: count("failed"), partial: count("partial"), locked: count("skipped_locked"), paused: count("skipped"), left },
  });
  await syncJobReviews(admin, job, { projectId: null, runId: start.runId, failures: own.map((message) => ({ projectId: null, message })), status, actorId });
  if (status === "failed") {
    const paragraphs = [`The ${label} run (${trigger}) failed${children.length ? " in every project" : ""}.`, ...errors.slice(0, 5)];
    await alertOps(admin, { jobKey: job.key, runId: start.runId, now, subject: `${label} failed`, paragraphs }, deps);
  }
  return { ok: status !== "failed", key: job.key, runId: start.runId, status, ...res, errors, projects: children };
}

// A run for one project ("Run now", as-of, review retry) or, without a project, the cross-project fan-out.
export async function executeJob(job, opts = {}) {
  if (!job) return { ok: false, error: "Unknown job" };
  return opts.projectId ? runProject(job, opts) : runScheduledJob(job, opts);
}

export const executeJobByKey = (key, opts) => executeJob(getJob(key), opts);

// Latest run facts per project and job (property.job_run_status), keyed "<projectId>|<jobKey>" ("" for operator rows).
export async function jobRunStatus(admin, { projectId = null, since }) {
  const { data, error } = await admin.rpc("job_run_status", { p_project: projectId, p_since: since.toISOString() });
  if (error) throw new Error(`job_run_status: ${error.message}`);
  const out = new Map();
  for (const r of data || []) {
    out.set(`${r.project_id || ""}|${r.job_key}`, {
      runId: r.last_run_id,
      lastStatus: r.last_status,
      lastTrigger: r.last_trigger,
      lastStartedAt: r.last_started_at,
      prevStatus: r.prev_status,
      lastOkAt: r.last_ok_at,
      lastScheduledOkAt: r.last_scheduled_ok_at,
      lastScheduledAt: r.last_scheduled_at,
    });
  }
  return out;
}

const DAYS_3 = 3 * 1440 * MINUTE;

// "Run everything due" for one project: each job with nothing handled within its interval.
async function runDueForProject({ admin, now, projectId, trigger, actorId, deps }) {
  const status = await jobRunStatus(admin, { projectId, since: new Date(now.getTime() - DAYS_3) });
  const results = [];
  for (const job of JOBS) {
    if (!isDueNow(status.get(`${projectId}|${job.key}`), job, now)) {
      results.push({ key: job.key, status: "not_due" });
      continue;
    }
    results.push(await runProject(job, { admin, now, projectId, trigger, actorId, deps }));
  }
  return results;
}

const utcStamp = (at) => (at ? `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC` : "never");

// The run-due watchdog (Vercel Cron, daily): reruns each job for the projects it is overdue in (trigger watchdog), alerts each project whose
// last scheduled success is older than 1.5 intervals, and emails operators about jobs the scheduler stopped triggering.
export async function runWatchdog({ admin, now = new Date(), projects = null, deadline = null, deps = {} } = {}) {
  const narrowed = projects ? { narrowed: projects.length } : {};
  const start = await startRun(admin, WATCHDOG, { projectId: null, trigger: "cron", metadata: narrowed });
  if (start.locked) return { ok: true, status: "skipped_locked", runId: start.runId, results: [], missed: [], notTriggered: [], errors: [] };
  const results = [];
  const missed = [];
  const notTriggered = [];
  const own = [];
  try {
    const ids = projects || (await listJobProjects(admin));
    const paused = await pausedProjects(admin, ids);
    const live = ids.filter((id) => !paused.has(id));
    const modules = await loadModuleCheck(admin);
    const status = await jobRunStatus(admin, { since: new Date(now.getTime() - DAYS_3) });
    for (const job of JOBS) {
      const scope = live.filter((pid) => !job.module || modules(pid, job.module));
      const due = scope.filter((pid) => isOverdue(status.get(`${pid}|${job.key}`), job, now));
      const stale = scope.filter((pid) => isStale(status.get(`${pid}|${job.key}`), job, now));
      let run = null;
      if (due.length && deadline && Date.now() > deadline) results.push({ key: job.key, status: "out_of_time", due: due.length });
      else if (due.length) run = await runScheduledJob(job, { admin, now, trigger: "watchdog", projects: due, deadline, deps });
      if (run) results.push({ key: job.key, status: run.status, due: due.length, runId: run.runId });
      else if (!due.length) results.push({ key: job.key, status: "not_due" });
      for (const pid of stale) {
        const rerun = run?.projects?.find((p) => p.projectId === pid)?.status || "";
        missed.push({ key: job.key, projectId: pid });
        await alertMissedRun(admin, { job, projectId: pid, since: status.get(`${pid}|${job.key}`)?.lastScheduledOkAt, rerun, now }, deps);
      }
    }
    // Operators: once the scheduler is live (an operator cron row within about a day), every job's own cron must keep firing.
    const parents = JOBS.map((job) => ({ job, at: status.get(`|${job.key}`)?.lastScheduledAt || null }));
    const age = (at) => (at ? now.getTime() - new Date(at).getTime() : Infinity);
    if (parents.some((p) => age(p.at) < 26 * 60 * MINUTE)) {
      for (const { job, at } of parents) if (age(at) > STALE_FACTOR * intervalOf(job) * MINUTE) notTriggered.push({ key: job.key, label: job.label || job.key, at });
    }
  } catch (e) {
    console.error("[jobs.watchdog]", e);
    own.push(e?.message || String(e));
  }
  const ran = results.filter((r) => r.status !== "not_due");
  const status = own.length ? "failed" : ran.some((r) => ["failed", "partial", "out_of_time"].includes(r.status)) ? "partial" : "succeeded";
  await finishRun(admin, start.runId, {
    status,
    processed: ran.length,
    created: missed.length,
    error_count: own.length,
    errors: own,
    metadata: { ...narrowed, ran: ran.map((r) => r.key), missed, notTriggered: notTriggered.map((n) => n.key) },
  });
  if (notTriggered.length || own.length) {
    const lines = notTriggered.map((n) => `• ${n.label} (${n.key}): last triggered ${utcStamp(n.at)}`);
    const subject = own.length ? "The scheduled-jobs watchdog failed" : `${notTriggered.length} scheduled job${notTriggered.length === 1 ? "" : "s"} stopped running`;
    const paragraphs = own.length ? own : ["Vercel Cron hasn't triggered these jobs on schedule (check the crons in vercel.json and CRON_SECRET):", lines.join("\n")];
    await alertOps(admin, { jobKey: WATCHDOG.key, runId: start.runId, now, subject, paragraphs }, deps);
  }
  return { ok: !own.length, status, runId: start.runId, results, missed, notTriggered: notTriggered.map((n) => n.key), errors: own };
}

// Manual "Run everything due" (one project) or, without a project, the watchdog's results.
export async function runDueJobs({ admin, now = new Date(), projectId = null, trigger = "manual", actorId = null, deadline = null, deps = {} } = {}) {
  if (projectId) return runDueForProject({ admin, now, projectId, trigger, actorId, deps });
  return (await runWatchdog({ admin, now, deadline, deps })).results;
}
