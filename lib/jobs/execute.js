import { createHash } from "node:crypto";
import { raiseReview } from "@/lib/orchestration/review";
import { getModule, loadModuleCheck } from "@/lib/modules";
import { JOBS, getJob } from "./registry";
import { emptyResult, errorMessage, errorProject } from "./contract";
import { forProject } from "@/lib/supabase/scope";

// Server-only: run scheduled jobs and record each execution in property.job_runs
// (key, project scope, trigger, started/finished, result counts, errors).
// `projectId` narrows a staff "Run now" to one project; cron runs pass null.

const DAY_MINUTES = 1440;

// Runner errors already raise their own review items (one per failed run).
const HANDLED_ELSEWHERE = /see the Review Queue/;

// One review item per distinct failure, in the failing project's queue only (ORCH-04, PLAT-01b); a cleanly covered scope is cleared.
async function syncJobReviews(admin, job, { projectId, runId, failures, status, actorId }) {
  try {
    const failed = new Set(failures.map((f) => f.projectId || ""));
    for (const f of failures.filter((x) => !HANDLED_ELSEWHERE.test(x.message)).slice(0, 50)) {
      const hash = createHash("sha256").update(f.message.toLowerCase().trim()).digest("hex").slice(0, 16);
      // TODO(PLAT-01h): an operator-only view for project-less failures; members never see them, so they stay redacted.
      const detail = f.projectId ? f.message : "";
      await raiseReview(admin, {
        projectId: f.projectId,
        dedupeKey: `job:${job.key}:${hash}`,
        kind: "exception",
        sourceType: "job_run",
        sourceId: runId,
        title: `${job.label || job.key} failed`,
        reasonCode: "job_failed",
        context: { jobLabel: job.label || job.key, detail },
        severity: status === "failed" ? "urgent" : "soon",
        details: detail || undefined,
        metadata: { jobKey: job.key },
      });
    }
    // A project run covers its project; a cron run covers every scope unless a project-less failure broke it.
    if (!projectId && failed.has("")) return;
    let q = admin.from("review_items").select("*").eq("source_type", "job_run").like("dedupe_key", `job:${job.key}:%`).in("status", ["open", "snoozed"]).is("deleted_at", null);
    if (projectId) q = forProject(q, projectId);
    const { data: open } = await q;
    for (const row of open || []) {
      if (failed.has(row.project_id || "")) continue;
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

export async function executeJob(job, { admin, now = new Date(), projectId = null, trigger = "cron", actorId = null } = {}) {
  if (!job) return { ok: false, error: "Unknown job" };
  // Settings → Modules: `moduleOn(projectId, key = job.module)`; a one-project run reads only its project and skips while off.
  const check = await loadModuleCheck(admin, projectId);
  const moduleOn = (pid, key = job.module) => check(pid || projectId, key);
  if (job.module && projectId && !moduleOn(projectId)) {
    const label = getModule(job.module)?.label || job.module;
    return { ok: true, key: job.key, status: "skipped", module: job.module, reason: `${label} is off in Settings → Modules`, ...emptyResult() };
  }
  let runId = null;
  try {
    const { data } = await admin
      .from("job_runs")
      .insert({
        project_id: projectId,
        job_key: job.key,
        trigger_source: trigger,
        status: "running",
        started_at: now.toISOString(),
        created_by: actorId,
      })
      .select("id")
      .single();
    runId = data?.id ?? null;
  } catch (e) {
    console.error("[jobs.log.start]", e);
  }

  let result = emptyResult();
  try {
    result = { ...emptyResult(), ...((await job.run({ admin, now, projectId, moduleOn })) || {}) };
  } catch (e) {
    console.error(`[jobs.${job.key}]`, e);
    result.errors = [...(result.errors || []), e?.message || String(e)];
  }

  // Unattributed errors of a one-project run are that project's; of a cron run, project-less.
  const failures = (result.errors || []).map((e) => ({ projectId: errorProject(e) || projectId, message: errorMessage(e) }));
  const errors = failures.map((f) => (f.projectId && f.projectId !== projectId ? `${f.message} (project ${f.projectId})` : f.message));
  const status = errors.length ? (result.processed || result.created ? "partial" : "failed") : "succeeded";
  if (runId) {
    try {
      await admin
        .from("job_runs")
        .update({
          status,
          finished_at: new Date().toISOString(),
          processed: Number(result.processed) || 0,
          created: Number(result.created) || 0,
          skipped: Number(result.skipped) || 0,
          error_count: errors.length,
          errors: errors.slice(0, 50),
        })
        .eq("id", runId);
    } catch (e) {
      console.error("[jobs.log.finish]", e);
    }
  }
  await syncJobReviews(admin, job, { projectId, runId, failures, status, actorId });
  return { ok: status !== "failed", key: job.key, runId, status, ...result, errors };
}

export const executeJobByKey = (key, opts) => executeJob(getJob(key), opts);

// A job is due when nothing finished for its scope within its interval.
async function isDue(admin, job, now, projectId) {
  const minutes = Number(job.intervalMinutes) || DAY_MINUTES;
  const since = new Date(now.getTime() - minutes * 60000 + 60000).toISOString();
  try {
    let q = admin
      .from("job_runs")
      .select("id")
      .eq("job_key", job.key)
      .in("status", ["succeeded", "partial", "running"])
      .gte("started_at", since)
      .limit(1);
    // A cron run (no project) covers every project, so it also counts toward a project's interval (bookkeeping only).
    q = projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q.is("project_id", null);
    const { data, error } = await q;
    if (error) return true;
    return !data?.length;
  } catch {
    return true;
  }
}

export async function runDueJobs({ admin, now = new Date(), projectId = null, trigger = "cron", actorId = null } = {}) {
  const results = [];
  for (const job of JOBS) {
    if (!(await isDue(admin, job, now, projectId))) {
      results.push({ key: job.key, status: "not_due" });
      continue;
    }
    results.push(await executeJob(job, { admin, now, projectId, trigger, actorId }));
  }
  return results;
}
