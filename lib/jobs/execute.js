import { createHash } from "node:crypto";
import { raiseReview } from "@/lib/orchestration/review";
import { getModule, loadModuleCheck, moduleEnabled } from "@/lib/modules";
import { JOBS, getJob } from "./registry";
import { emptyResult } from "./contract";

// Server-only: run scheduled jobs and record each execution in property.job_runs
// (key, project scope, trigger, started/finished, result counts, errors).
// `projectId` narrows a staff "Run now" to one project; cron runs pass null.

const DAY_MINUTES = 1440;

// Runner errors already raise their own review items (one per failed run).
const HANDLED_ELSEWHERE = /see the Review Queue/;

// One review item per distinct job failure (ORCH-04): the same error on a retry bumps the open item; a clean run
// of the same job resolves that job's open items.
async function syncJobReviews(admin, job, { projectId, runId, errors, status, actorId }) {
  try {
    const failures = errors.filter((e) => !HANDLED_ELSEWHERE.test(e));
    for (const detail of failures.slice(0, 20)) {
      const hash = createHash("sha256").update(detail.toLowerCase().trim()).digest("hex").slice(0, 16);
      await raiseReview(admin, {
        projectId,
        dedupeKey: `job:${job.key}:${hash}`,
        kind: "exception",
        sourceType: "job_run",
        sourceId: runId,
        title: `${job.label || job.key} failed`,
        reasonCode: "job_failed",
        context: { jobLabel: job.label || job.key, detail },
        severity: status === "failed" ? "urgent" : "soon",
        details: detail,
        metadata: { jobKey: job.key },
      });
    }
    if (status !== "succeeded") return;
    let q = admin.from("review_items").select("*").eq("source_type", "job_run").like("dedupe_key", `job:${job.key}:%`).in("status", ["open", "snoozed"]).is("deleted_at", null);
    q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
    const { data: open } = await q;
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

// Settings → Modules gate: a one-project run of an off module is skipped (null); otherwise the per-project check.
async function moduleGate(admin, job, projectId) {
  if (!job.module) return () => true;
  if (projectId) return (await moduleEnabled(admin, projectId, job.module)) ? () => true : null;
  const check = await loadModuleCheck(admin);
  return (pid) => check(pid, job.module);
}

export async function executeJob(job, { admin, now = new Date(), projectId = null, trigger = "cron", actorId = null } = {}) {
  if (!job) return { ok: false, error: "Unknown job" };
  const moduleOn = await moduleGate(admin, job, projectId);
  if (!moduleOn) {
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

  const errors = (result.errors || []).map(String);
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
  await syncJobReviews(admin, job, { projectId, runId, errors, status, actorId });
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
