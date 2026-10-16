import { portalError, portalJson, readBody } from "@/lib/portal/http";
import { updateRequest } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// PATCH { action: comment|cancel, … } — follow up on one of the resident's requests.
export const PATCH = withPortal(
  async (ctx, request, { params }) => {
    const { id } = await params;
    const res = await updateRequest(ctx, id, await readBody(request));
    if (!res.ok) return portalError(res.status || 400, res.error);
    return portalJson({ request: res.request });
  },
  { role: "resident" },
);
