import { portalError, portalJson, readBody } from "@/lib/portal/http";
import { decideApproval, ownerPermissions } from "@/lib/portal/owner";
import { withPortal } from "@/lib/portal/session";

// POST { decision: Approved|Rejected, notes } — decide a pending work-order approval.
export const POST = withPortal(
  async (ctx, request, { params }) => {
    if (!ownerPermissions(ctx).approve) return portalError(403, "Approvals are handled by the office for your account.");
    const { id } = await params;
    const res = await decideApproval(ctx, id, await readBody(request));
    if (!res.ok) return portalError(res.status || 400, res.error);
    return portalJson({ decided: true });
  },
  { role: "owner" },
);
