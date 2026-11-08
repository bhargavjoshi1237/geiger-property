import { jsonError, requireStaff } from "@/lib/auth/staff";
import { turnCredentials } from "@/lib/chat/turn";

// GET — short-lived TURN credentials for a member who can open Communications (PLAT-01h); an empty list when TURN isn't configured.

export async function GET(request) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const auth = await requireStaff(request, projectId, { permission: "property.communications.view" });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const turn = turnCredentials(auth.user.id);
  return Response.json(
    {
      ok: true,
      iceServers: turn ? [{ urls: turn.urls, username: turn.username, credential: turn.credential }] : [],
      expiresAt: turn?.expiresAt || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
