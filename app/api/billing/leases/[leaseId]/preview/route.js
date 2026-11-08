import { billingAccess, billingError } from "@/lib/billing/http";
import { loadLease } from "@/lib/billing/service";
import { previewCloseOut } from "@/lib/billing/close_out";

// GET ?projectId=&through=YYYY-MM-DD — the move-out close-out's final rent, charges and credits, without posting (CORE-02).

export async function GET(request, { params }) {
  const { leaseId } = await params;
  const search = request.nextUrl.searchParams;
  const projectId = search.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.post", "property.leases.view"], "Your role can't see this lease's billing.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const res = await previewCloseOut(gate.admin, lease, search.get("through") || "");
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return billingError(e, "Couldn't preview the final rent.");
  }
}
