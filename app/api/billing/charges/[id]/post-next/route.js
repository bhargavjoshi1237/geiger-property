import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { loadCharge, postNextCharge } from "@/lib/billing/charges";

// POST — "Post next charge" (CORE-03): post a recurring charge's next occurrence to its lease's ledger now and advance it. Body { projectId }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Your role can't post charges.");
  if (gate.response) return gate.response;
  try {
    const charge = await loadCharge(gate.admin, id, projectId);
    const res = await postNextCharge(gate.admin, charge, { actor: gate.auth.user });
    return Response.json({ ok: true, next: res.next, status: res.status, covered: res.covered, entries: entryView(res.entries) });
  } catch (e) {
    return billingError(e, "Couldn't post the charge.");
  }
}
