import { authorizeScheduler } from "@/lib/jobs/contract";
import { runDueJobs, runWatchdog } from "@/lib/jobs/execute";
import { adminClient } from "@/lib/supabase/admin";
import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";

// The run-due watchdog and "Run everything due".
// GET  — Vercel Cron (`Bearer ${CRON_SECRET}`), daily: reruns overdue jobs per project, alerts missed runs, emails operators about jobs the scheduler stopped triggering.
// POST — signed-in staff "Run everything due" for { projectId }.

export const maxDuration = 300;

const deadline = () => Date.now() + (maxDuration - 30) * 1000;

export async function GET(request) {
  if (!authorizeScheduler(request.headers.get("authorization"))) return jsonError(401, "Unauthorized");
  const admin = adminClient({ source: "job:run-due" });
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const result = await runWatchdog({ admin, deadline: deadline() });
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request) {
  const body = await readJson(request);
  if (!body.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, body.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const results = await runDueJobs({
    admin: auth.db,
    projectId: auth.projectId,
    trigger: "manual",
    actorId: auth.user.id,
  });
  return Response.json({ ok: true, results });
}
