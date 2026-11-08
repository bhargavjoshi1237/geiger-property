import { loadModuleCheck, getModule } from "@/lib/modules";
import { forProject } from "@/lib/supabase/scope";
import { BILLING_SETTINGS_KEY } from "@/lib/billing/settings";
import { JOBS, MANUAL_JOBS } from "./registry";
import { jobRunStatus } from "./execute";
import { jobsPausedFor } from "./business_date";
import { jobAlertOf, nextCronTime } from "./schedule";

// Server-only reads and writes behind the Scheduled Jobs dialog (CORE-10): each job's last run, next scheduled time and alert in one project, the project's recent runs, and the jobs pause switch.

const DAY = 86400000;
const LIVE_WINDOW = 26 * 3600000;
const RUN_COLS = "id, job_key, trigger_source, status, started_at, finished_at, processed, created, skipped, error_count, errors, metadata";

const runView = (r) =>
  r && {
    id: r.id,
    jobKey: r.job_key,
    triggerSource: r.trigger_source,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    processed: Number(r.processed) || 0,
    created: Number(r.created) || 0,
    skipped: Number(r.skipped) || 0,
    errorCount: Number(r.error_count) || 0,
    errors: Array.isArray(r.errors) ? r.errors.slice(0, 5) : [],
    asOf: r.metadata?.asOf || null,
    reason: r.metadata?.reason || "",
  };

// The scheduler is live once an operator cron row (any job, or the watchdog) started within about a day.
async function schedulerLiveAt(admin, now) {
  const { data } = await admin
    .from("job_runs")
    .select("started_at")
    .is("project_id", null)
    .eq("trigger_source", "cron")
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1);
  const at = data?.[0]?.started_at || null;
  return { live: Boolean(at && now.getTime() - new Date(at).getTime() < LIVE_WINDOW), at };
}

export async function projectJobStatus(admin, projectId, now = new Date()) {
  const [status, scheduler, paused, modules, recent] = await Promise.all([
    jobRunStatus(admin, { projectId, since: new Date(now.getTime() - 45 * DAY) }),
    schedulerLiveAt(admin, now),
    jobsPausedFor(admin, projectId),
    loadModuleCheck(admin, projectId),
    forProject(admin.from("job_runs").select(RUN_COLS), projectId)
      .is("deleted_at", null)
      .or("processed.gt.0,created.gt.0,skipped.gt.0,error_count.gt.0,status.neq.succeeded")
      .order("started_at", { ascending: false })
      .limit(25),
  ]);
  const ids = [...status.values()].map((s) => s.runId).filter(Boolean);
  const { data: lastRows } = ids.length ? await admin.from("job_runs").select(RUN_COLS).in("id", ids) : { data: [] };
  const byId = new Map((lastRows || []).map((r) => [r.id, r]));
  const jobs = {};
  for (const job of [...JOBS, ...MANUAL_JOBS]) {
    const st = status.get(`${projectId}|${job.key}`) || null;
    const off = job.module && !modules(projectId, job.module) ? getModule(job.module)?.label || job.module : null;
    jobs[job.key] = {
      last: st ? runView(byId.get(st.runId)) || { id: st.runId, status: st.lastStatus, triggerSource: st.lastTrigger, startedAt: st.lastStartedAt } : null,
      lastOkAt: st?.lastOkAt || null,
      nextRunAt: scheduler.live && !off && !job.manual ? nextCronTime(job.schedule, now)?.toISOString() || null : null,
      moduleOff: off,
      alert: off || job.manual ? null : jobAlertOf(st, job, now, { schedulerLive: scheduler.live, paused }),
    };
  }
  return { paused, schedulerLive: scheduler.live, schedulerLastAt: scheduler.at, jobs, recent: (recent.data || []).map(runView) };
}

// Settings → the jobs pause switch (billing_settings.jobsPaused), merged into the stored value; settings_project_key_uidx also covers a soft-deleted row, which is restored.
export async function setJobsPaused(admin, projectId, paused) {
  const read = () => forProject(admin.from("settings").select("id, value, deleted_at").eq("key", BILLING_SETTINGS_KEY), projectId).limit(1);
  let { data, error } = await read();
  if (error) throw new Error(`billing_settings: ${error.message}`);
  if (!data?.[0]) {
    const { error: insertError } = await admin.from("settings").insert({ project_id: projectId, key: BILLING_SETTINGS_KEY, value: { jobsPaused: paused } });
    if (!insertError) return paused;
    // A concurrent first write inserted the row: update it instead.
    if (insertError.code !== "23505") throw new Error(`billing_settings: ${insertError.message}`);
    ({ data, error } = await read());
    if (error || !data?.[0]) throw new Error(`billing_settings: ${error?.message || "not found"}`);
  }
  const row = data[0];
  const value = { ...(row.deleted_at ? {} : row.value || {}), jobsPaused: paused };
  const { error: updateError } = await admin.from("settings").update({ value, deleted_at: null }).eq("id", row.id);
  if (updateError) throw new Error(`billing_settings: ${updateError.message}`);
  return paused;
}
