import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { actOnReview, actOnReviews } from "@/lib/orchestration/review_actions";
import { staffCan } from "@/lib/auth/permissions";

// POST — staff actions on review queue items (ORCH-04). Runs server-side so retries, approvals and suggested
// actions execute with the service role, and every change is audited with the signed-in user as the actor.
// Body: { projectId, action, id | ids, input? }

export const maxDuration = 300;

export async function POST(request) {
  const { projectId, action, id, ids, input } = await readJson(request);
  if (!projectId || !action || (!id && !Array.isArray(ids))) return jsonError(400, "projectId, action and id (or ids) are required.");
  const auth = await requireStaff(request, projectId, { permission: "property.review.resolve", denied: "Your role can't act on review items." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = auth.admin;
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so review actions can't run.");
  const [canPostLedger, canRunJobs] = await Promise.all([staffCan(auth, "property.accounting.post"), staffCan(auth, "property.settings.manage")]);
  try {
    const res = Array.isArray(ids)
      ? await actOnReviews(admin, { projectId, ids, action, input: input || {}, actor: auth.user, canPostLedger })
      : await actOnReview(admin, { projectId, id, action, input: input || {}, actor: auth.user, canPostLedger, canRunJobs });
    return Response.json(res);
  } catch (e) {
    return jsonError(400, e?.message || "Couldn't complete that action.");
  }
}
