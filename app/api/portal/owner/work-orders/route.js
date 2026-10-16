import { portalJson } from "@/lib/portal/http";
import { ownerPermissions, ownerWorkOrders } from "@/lib/portal/owner";
import { withPortal } from "@/lib/portal/session";

// GET — work orders on the owner's properties, with any approval requests.
export const GET = withPortal(
  async (ctx) => {
    const permissions = ownerPermissions(ctx);
    const rows = await ownerWorkOrders(ctx);
    // Without work-order visibility the owner still sees jobs that need their decision.
    const workOrders = permissions.workOrders ? rows : rows.filter((w) => w.approval);
    return portalJson({ workOrders, permissions });
  },
  { role: "owner" },
);
