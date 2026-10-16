import { portalJson } from "@/lib/portal/http";
import { vendorPermissions, vendorWorkOrders } from "@/lib/portal/vendor";
import { withPortal } from "@/lib/portal/session";

// GET — work orders assigned to this vendor.
export const GET = withPortal(
  async (ctx) => portalJson({ workOrders: await vendorWorkOrders(ctx), permissions: vendorPermissions(ctx) }),
  { role: "vendor" },
);
