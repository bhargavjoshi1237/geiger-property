import { listAnnouncements } from "@/lib/portal/common";
import { portalJson } from "@/lib/portal/http";
import { residentContext } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// GET — sent announcements addressed to this member's audience.
export const GET = withPortal(async (ctx) => {
  const rc = ctx.member.role === "resident" ? await residentContext(ctx) : null;
  const items = await listAnnouncements(ctx, { propertyId: rc?.property?.id, buildingId: rc?.buildingId });
  return portalJson({ items });
});
