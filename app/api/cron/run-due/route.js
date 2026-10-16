import { authorizeScheduler } from "@/lib/jobs/contract";
import { runDueJobs } from "@/lib/jobs/execute";
import { adminClient } from "@/lib/supabase/admin";
import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";

// Runs every job that hasn't completed within its interval (daily by default).
// GET  — Vercel Cron / any external scheduler with `Bearer ${CRON_SECRET}`.
// POST — signed-in staff "Run all due" for { projectId }.

export const maxDuration = 300;

export async function GET(request) {
  if (!authorizeScheduler(request.headers.get("authorization"))) return jsonError(401, "Unauthorized");
  const admin = adminClient();
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const results = await runDueJobs({ admin, trigger: "cron" });
  return Response.json({ ok: true, results });
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
