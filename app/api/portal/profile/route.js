import { profileView, updateProfile } from "@/lib/portal/common";
import { portalError, portalJson, readBody } from "@/lib/portal/http";
import { withPortal } from "@/lib/portal/session";

// GET — the member's contact details and preferences.
export const GET = withPortal(async (ctx) => portalJson({ profile: profileView(ctx) }));

// PATCH { phone?, prefs? } — update contact details on the member's own record.
export const PATCH = withPortal(async (ctx, request) => {
  const res = await updateProfile(ctx, await readBody(request));
  if (!res.ok) return portalError(400, res.error);
  return portalJson({ saved: true });
});
