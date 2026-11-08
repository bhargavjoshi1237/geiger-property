import { JOBS, RETIRED_JOBS } from "@/lib/jobs/registry";
import { RUNBOOK } from "@/lib/jobs/runbook";
import { describeSchedule, intervalOf } from "@/lib/jobs/schedule";
import { projectJobStatus, setJobsPaused } from "@/lib/jobs/status";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";

// Staff with Manage settings: the Scheduled Jobs dialog.
// GET   — the job catalog (schedule, runbook) with this project's last run, next scheduled time and alert per job, its recent runs and the pause switch.
// PATCH — { projectId, paused } sets the jobs pause switch.

export async function GET(request) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const auth = await requireStaff(request, projectId, { permission: "property.settings.manage", denied: "Your role can't manage scheduled jobs." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  let status = null;
  if (projectId && isAdminConfigured()) {
    try {
      status = await projectJobStatus(auth.db, projectId);
    } catch (e) {
      console.error("[jobs.status]", e);
    }
  }
  return Response.json({
    ok: true,
    cronConfigured: Boolean(process.env.CRON_SECRET),
    adminConfigured: isAdminConfigured(),
    paused: status?.paused ?? false,
    schedulerLive: status?.schedulerLive ?? false,
    jobs: JOBS.map((j) => ({
      key: j.key,
      label: j.label || j.key,
      description: j.description || "",
      schedule: j.schedule || "",
      scheduleLabel: describeSchedule(j.schedule),
      intervalMinutes: intervalOf(j),
      asOf: Boolean(j.asOf),
      runbook: RUNBOOK[j.key] || null,
      ...(status?.jobs[j.key] || { last: null, lastOkAt: null, nextRunAt: null, moduleOff: null, alert: null }),
    })),
    recent: status?.recent || [],
    retired: Object.entries(RETIRED_JOBS).map(([key, j]) => ({ key, label: j.label })),
  });
}

export async function PATCH(request) {
  const body = await readJson(request);
  if (typeof body.paused !== "boolean") return jsonError(400, "paused must be true or false.");
  const auth = await requireStaff(request, body.projectId, { permission: "property.settings.manage", denied: "Pausing scheduled jobs needs the Manage settings permission." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  try {
    return Response.json({ ok: true, paused: await setJobsPaused(auth.db, auth.projectId, body.paused) });
  } catch (e) {
    console.error("[jobs.pause]", e);
    return jsonError(500, "Couldn't save the pause switch.");
  }
}
