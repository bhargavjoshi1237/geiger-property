import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { loadLease } from "@/lib/billing/service";
import { closeOutLease } from "@/lib/billing/close_out";

// POST — close a lease out through its move-out (CORE-02): records the date and posts the final rent and charge true-ups now. Body { projectId, through? }.

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const { projectId, through } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Your role can't post to the ledger; the next billing run posts the final rent.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const res = await closeOutLease(gate.admin, lease, through || "", { actor: gate.auth.user });
    return Response.json({ ok: true, ...res, entries: entryView(res.entries) });
  } catch (e) {
    return billingError(e, "Couldn't close out the lease.");
  }
}
