import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { deliverAnnouncement } from "@/lib/messaging/announcements";

// POST — signed-in staff "Send now" for an announcement: resolves the audience,
// delivers per recipient (idempotent per recipient) and stamps it Sent with stats.
// Body: { projectId, announcementId }

export const maxDuration = 300;

export async function POST(request) {
  const { projectId, announcementId } = await readJson(request);
  if (!projectId || !announcementId) return jsonError(400, "projectId and announcementId are required.");
  const auth = await requireStaff(request, projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const { data: a, error } = await auth.db.from("announcements").select("*").eq("id", announcementId).maybeSingle();
  if (error || !a || a.deleted_at) return jsonError(404, "Announcement not found.");
  if (a.project_id && a.project_id !== projectId) return jsonError(403, "Announcement belongs to another project.");
  if (!String(a.body || "").trim()) return jsonError(400, "Write the message before sending.");
  if (a.audience === "Property tenants" && !a.property_id) return jsonError(400, "Pick a property for this audience.");
  if (a.audience === "Building tenants" && !a.building_id) return jsonError(400, "Pick a building for this audience.");

  const result = await deliverAnnouncement(auth.db, a, { actor: auth.user });
  return Response.json(result);
}
