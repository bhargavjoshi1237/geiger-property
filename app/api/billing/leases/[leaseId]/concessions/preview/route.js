import { billingAccess, billingError } from "@/lib/billing/http";
import { loadLease } from "@/lib/billing/service";
import { concessionPreview } from "@/lib/billing/concessions_server";

// GET ?projectId= — a lease's per-period concession schedule (CORE-05): { ok, rows: [{ concessionId, name, period, label, rent, credit, posted, state }], concessions: [{ id, posted, scheduled }] }.

export async function GET(request, { params }) {
  const { leaseId } = await params;
  const projectId = new URL(request.url).searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.leases.view", "property.rent.manage"], "Your role can't see this lease's concessions.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    return Response.json({ ok: true, ...(await concessionPreview(gate.admin, lease)) });
  } catch (e) {
    return billingError(e, "Couldn't load the concession schedule.");
  }
}
