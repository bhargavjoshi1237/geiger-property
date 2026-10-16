import { JOBS } from "@/lib/jobs/registry";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { jsonError, requireStaff } from "@/lib/messaging/auth";

// Signed-in staff: the scheduled-job catalog (labels + schedules) and whether
// the scheduler is configured. Run history is read from property.job_runs.

export async function GET(request) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const auth = await requireStaff(request, projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  return Response.json({
    ok: true,
    cronConfigured: Boolean(process.env.CRON_SECRET),
    adminConfigured: isAdminConfigured(),
    jobs: JOBS.map((j) => ({
      key: j.key,
      label: j.label || j.key,
      description: j.description || "",
      schedule: j.schedule || "",
      intervalMinutes: j.intervalMinutes || 1440,
    })),
  });
}
