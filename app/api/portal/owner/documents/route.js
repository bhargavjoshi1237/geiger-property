import { portalFilesJson } from "@/lib/portal/http";
import { ownerDocuments, ownerPermissions } from "@/lib/portal/owner";
import { withPortal } from "@/lib/portal/session";

// GET — documents on the owner's file and their properties.
export const GET = withPortal(
  async (ctx) => {
    if (!ownerPermissions(ctx).documents) return portalFilesJson(ctx, { documents: [], documentsDisabled: true });
    return portalFilesJson(ctx, { documents: await ownerDocuments(ctx) });
  },
  { role: "owner" },
);
