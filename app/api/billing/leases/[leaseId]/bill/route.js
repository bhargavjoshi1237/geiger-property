import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { billCurrentPeriod, loadLease } from "@/lib/billing/service";

// POST — "Bill now" (CORE-01): bill or true up the lease's current month. Body { projectId }.

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const { projectId } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Your role can't post rent.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const res = await billCurrentPeriod(gate.admin, lease, { actor: gate.auth.user });
    return Response.json({ ok: true, period: res.period, computed: res.computed, billed: res.billed, entries: entryView(res.entries) });
  } catch (e) {
    return billingError(e, "Couldn't bill the rent.");
  }
}
