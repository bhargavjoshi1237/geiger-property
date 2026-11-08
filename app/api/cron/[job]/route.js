import { authorizeScheduler } from "@/lib/jobs/contract";
import { executeJob, runScheduledJob } from "@/lib/jobs/execute";
import { getJob } from "@/lib/jobs/registry";
import { adminClient } from "@/lib/supabase/admin";
import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";

// One scheduled job by key (lib/jobs/registry.js).
// GET  — Vercel Cron (`Authorization: Bearer ${CRON_SECRET}`): one child run per project under an operator row; `?project=<id>` narrows it (operator rerun).
// POST — staff "Run now" (Manage settings) for { projectId }; with { asOf } (ledger jobs) it runs as of noon on that business date.

export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Stop starting new projects 30 seconds before the function's limit; the watchdog picks up the rest.
const deadline = () => Date.now() + (maxDuration - 30) * 1000;

export async function GET(request, { params }) {
  const { job: key } = await params;
  if (!authorizeScheduler(request.headers.get("authorization"))) return jsonError(401, "Unauthorized");
  const job = getJob(key);
  if (!job) return jsonError(404, `Unknown job "${key}"`);
  const project = request.nextUrl.searchParams.get("project");
  if (project && !UUID.test(project)) return jsonError(400, "project must be a project id.");
  const admin = adminClient({ source: `job:${job.key}` });
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const result = await runScheduledJob(job, { admin, trigger: "cron", projects: project ? [project] : null, deadline: deadline() });
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request, { params }) {
  const { job: key } = await params;
  const job = getJob(key);
  if (!job) return jsonError(404, `Unknown job "${key}"`);
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: "property.settings.manage", denied: "Your role can't run scheduled jobs." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const asOf = body.asOf ? String(body.asOf) : null;
  if (asOf && !job.asOf) return jsonError(400, `${job.label || job.key} can't run as of a past date.`);
  const result = await executeJob(job, {
    admin: auth.db,
    projectId: auth.projectId,
    trigger: "manual",
    actorId: auth.user.id,
    asOf,
  });
  if (result.error && !result.status) return jsonError(400, result.error);
  return Response.json(result);
}
