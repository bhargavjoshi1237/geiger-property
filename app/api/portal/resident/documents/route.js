import { portalJson } from "@/lib/portal/http";
import { homeView, residentContext, residentDocuments, residentPermissions } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// GET — lease details plus documents on the resident's file and leases.
export const GET = withPortal(
  async (ctx) => {
    const rc = await residentContext(ctx);
    const permissions = residentPermissions(ctx);
    return portalJson({
      home: homeView(rc),
      documents: permissions.documents ? await residentDocuments(ctx, rc) : [],
      documentsDisabled: !permissions.documents,
    });
  },
  { role: "resident" },
);
