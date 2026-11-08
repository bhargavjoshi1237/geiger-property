import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { loadLease, onLeaseActivated } from "@/lib/billing/service";

// POST — a lease went live (CORE-01): rent steps, current rent, rent account, first (prorated) period. Body { projectId }.

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const { projectId } = await readJson(request);
  const gate = await billingAccess(request, projectId, "accounting.post", "Billing the first rent posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const res = await onLeaseActivated(gate.admin, lease, { actor: gate.auth.user });
    return Response.json({ ok: true, entries: entryView(res.entries), rent: res.rent, rentAccountId: res.rentAccountId, firstCharge: res.firstCharge });
  } catch (e) {
    return billingError(e, "Couldn't bill the lease.");
  }
}
