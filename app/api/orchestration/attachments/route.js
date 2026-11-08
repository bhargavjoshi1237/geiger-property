import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { signedAttachmentUrl } from "@/lib/orchestration/intake";

// POST — a short-lived link to a privately stored intake attachment (ORCH-10). Paths are scoped per project.
// Body: { projectId, path }

export async function POST(request) {
  const { projectId, path } = await readJson(request);
  if (!projectId || !path) return jsonError(400, "projectId and path are required.");
  const auth = await requireStaff(request, projectId, { permission: "property.review_queue.view" });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!String(path).startsWith(`intake/${projectId}/`) || String(path).includes("..")) return jsonError(403, "That file belongs to another project.");
  const url = await signedAttachmentUrl(auth.admin, path);
  if (!url) return jsonError(404, "File not found.");
  return Response.json({ url });
}
