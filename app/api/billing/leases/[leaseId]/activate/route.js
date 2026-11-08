import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { loadLease, onLeaseActivated } from "@/lib/billing/service";

// POST — a lease went live (CORE-01): rent steps, current rent, rent account, first (prorated) period, then its deposits (CORE-04). Body { projectId, billDeposits? }.

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const { projectId, billDeposits } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Billing the first rent posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const res = await onLeaseActivated(gate.admin, lease, { actor: gate.auth.user, billDeposits: billDeposits !== false });
    return Response.json({ ok: true, entries: entryView(res.entries), rent: res.rent, rentAccountId: res.rentAccountId, firstCharge: res.firstCharge, deposits: res.deposits, depositWarning: res.depositWarning });
  } catch (e) {
    return billingError(e, "Couldn't bill the lease.");
  }
}
