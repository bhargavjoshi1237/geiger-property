import { portalError, portalFilesJson, readBody } from "@/lib/portal/http";
import { addInsurance, listInsurance } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// GET — renters insurance requirement and policies on file.
export const GET = withPortal(async (ctx) => portalFilesJson(ctx, await listInsurance(ctx)), { role: "resident" });

// POST — upload a policy for staff review.
export const POST = withPortal(
  async (ctx, request) => {
    const res = await addInsurance(ctx, await readBody(request));
    if (!res.ok) return portalError(400, res.error);
    return portalFilesJson(ctx, { policy: res.policy });
  },
  { role: "resident" },
);
