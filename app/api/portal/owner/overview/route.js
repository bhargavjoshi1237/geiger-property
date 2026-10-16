import { listAnnouncements } from "@/lib/portal/common";
import { portalJson } from "@/lib/portal/http";
import { ownerPermissions, ownerPortfolio, ownerWorkOrders } from "@/lib/portal/owner";
import { withPortal } from "@/lib/portal/session";

// GET — owner dashboard: properties, occupancy, rent roll, pending approvals, notices.
export const GET = withPortal(
  async (ctx) => {
    const permissions = ownerPermissions(ctx);
    const [portfolio, workOrders, announcements] = await Promise.all([
      ownerPortfolio(ctx),
      permissions.workOrders || permissions.approve ? ownerWorkOrders(ctx) : [],
      listAnnouncements(ctx),
    ]);
    return portalJson({
      permissions,
      properties: portfolio.properties,
      rentRoll: portfolio.rentRoll,
      pendingApprovals: workOrders.filter((w) => w.approval?.status === "Pending").length,
      openWorkOrders: workOrders.filter((w) => !["Completed", "Cancelled", "Converted", "Rejected"].includes(w.status)).length,
      announcements: announcements.slice(0, 3),
    });
  },
  { role: "owner" },
);
