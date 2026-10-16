import { JOBS, getJob } from "./registry";
import { emptyResult } from "./contract";

// Server-only: run scheduled jobs and record each execution in property.job_runs
// (key, project scope, trigger, started/finished, result counts, errors).
// `projectId` narrows a staff "Run now" to one project; cron runs pass null.

const DAY_MINUTES = 1440;

export async function executeJob(job, { admin, now = new Date(), projectId = null, trigger = "cron", actorId = null } = {}) {
  if (!job) return { ok: false, error: "Unknown job" };
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
    result = { ...emptyResult(), ...((await job.run({ admin, now, projectId })) || {}) };
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
