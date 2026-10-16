import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { portalBaseUrl } from "@/lib/portal/auth";
import { disablePortalMember, invitePortalMember } from "@/lib/portal/invite";

// POST — signed-in staff manage portal access for a tenant / owner / vendor.
// Body: { projectId, action: invite|disable, partyType: tenant|owner|vendor, partyId, email? }
export async function POST(request) {
  const input = await readJson(request);
  if (!input.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, input.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const args = { db: auth.db, projectId: auth.projectId, actor: auth.user, partyType: input.partyType, partyId: input.partyId };
  const result =
    input.action === "disable"
      ? await disablePortalMember(args)
      : input.action === "invite"
        ? await invitePortalMember({ ...args, email: input.email, baseUrl: portalBaseUrl(request) })
        : { ok: false, status: 400, error: "Unknown action." };
  if (!result.ok) return jsonError(result.status || 400, result.error);
  return Response.json(result);
}
