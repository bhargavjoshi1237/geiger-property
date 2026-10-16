import { portalError, portalJson, readBody } from "@/lib/portal/http";
import { addCompliance, vendorCompliance, vendorPermissions } from "@/lib/portal/vendor";
import { withPortal } from "@/lib/portal/session";

// GET — insurance certificates and licenses on file.
export const GET = withPortal(
  async (ctx) => portalJson({ items: await vendorCompliance(ctx), permissions: vendorPermissions(ctx) }),
  { role: "vendor" },
);

// POST { kind: insurance_policy|license, … } — upload a COI or license for review.
export const POST = withPortal(
  async (ctx, request) => {
    const res = await addCompliance(ctx, await readBody(request));
    if (!res.ok) return portalError(400, res.error);
    return portalJson({ item: res.item });
  },
  { role: "vendor" },
);
