import { portalError, portalJson, readBody } from "@/lib/portal/http";
import { updateWorkOrder } from "@/lib/portal/vendor";
import { withPortal } from "@/lib/portal/session";

// PATCH { action: accept|decline|status|note|photos|complete, … } — update an assigned job.
export const PATCH = withPortal(
  async (ctx, request, { params }) => {
    const { id } = await params;
    const res = await updateWorkOrder(ctx, id, await readBody(request));
    if (!res.ok) return portalError(res.status || 400, res.error);
    return portalJson({ updated: true });
  },
  { role: "vendor" },
);
