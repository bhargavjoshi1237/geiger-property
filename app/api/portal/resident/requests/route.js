import { portalError, portalJson, readBody } from "@/lib/portal/http";
import { createRequest, listRequests, residentContext, residentPermissions } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// GET — the resident's maintenance requests.
export const GET = withPortal(
  async (ctx) => portalJson({ requests: await listRequests(ctx), permissions: residentPermissions(ctx) }),
  { role: "resident" },
);

// POST — submit a maintenance request (photos must be the resident's own uploads).
export const POST = withPortal(
  async (ctx, request) => {
    if (!residentPermissions(ctx).requests) return portalError(403, "Maintenance requests are turned off for your account.");
    const rc = await residentContext(ctx);
    const res = await createRequest(ctx, rc, await readBody(request));
    if (!res.ok) return portalError(400, res.error);
    return portalJson({ request: res.request });
  },
  { role: "resident" },
);
