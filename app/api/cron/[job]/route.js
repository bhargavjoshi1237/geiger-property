import { authorizeScheduler } from "@/lib/jobs/contract";
import { executeJob } from "@/lib/jobs/execute";
import { getJob } from "@/lib/jobs/registry";
import { adminClient } from "@/lib/supabase/admin";
import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";

// One scheduled job by key (lib/jobs/registry.js).
// GET  — Vercel Cron (`Authorization: Bearer ${CRON_SECRET}`), all projects.
// POST — signed-in staff "Run now", scoped to { projectId } from the body.

export const maxDuration = 300;

export async function GET(request, { params }) {
  const { job: key } = await params;
  if (!authorizeScheduler(request.headers.get("authorization"))) return jsonError(401, "Unauthorized");
  const job = getJob(key);
  if (!job) return jsonError(404, `Unknown job "${key}"`);
  const admin = adminClient();
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const result = await executeJob(job, { admin, trigger: "cron" });
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request, { params }) {
  const { job: key } = await params;
  const job = getJob(key);
  if (!job) return jsonError(404, `Unknown job "${key}"`);
  const body = await readJson(request);
  if (!body.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, body.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const result = await executeJob(job, {
    admin: auth.db,
    projectId: auth.projectId,
    trigger: "manual",
    actorId: auth.user.id,
  });
  return Response.json(result);
}
