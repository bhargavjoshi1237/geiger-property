import { portalError, portalJson } from "@/lib/portal/http";
import { residentContext, residentPermissions } from "@/lib/portal/resident";
import { residentStatementList } from "@/lib/portal/statements";
import { withPortal } from "@/lib/portal/session";

// GET — the resident's statement months per lease, newest first, each with its closing balance (CORE-12).
export const GET = withPortal(
  async (ctx) => {
    if (!residentPermissions(ctx).statements) return portalError(403, "Statements aren't shared in the portal for your account. Contact the office for a statement.");
    const rc = await residentContext(ctx);
    return portalJson({ leases: await residentStatementList(ctx, rc) });
  },
  { role: "resident" },
);
