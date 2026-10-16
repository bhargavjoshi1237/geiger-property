import { getPortalSession } from "@/lib/portal/session";
import { portalError, portalJson } from "@/lib/portal/http";

// GET — the signed-in user and the portal memberships they can open.
export async function GET() {
  const session = await getPortalSession();
  if (!session.user) return portalError(401, "Sign in to continue.");
  return portalJson({
    user: { id: session.user.id, email: session.user.email || "" },
    members: session.members,
    hidden: session.hidden,
    notConfigured: Boolean(session.notConfigured),
  });
}
