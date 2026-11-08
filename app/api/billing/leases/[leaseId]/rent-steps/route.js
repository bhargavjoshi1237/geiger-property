import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { addRentStep, cancelRentStep, loadLease } from "@/lib/billing/service";

// POST — change a lease's rent schedule (CORE-01) and true up billed months. Body { projectId, action: "create", step } or { projectId, action: "cancel", stepId }.

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const { projectId, action = "create", step, stepId } = await readJson(request);
  const gate = await billingAccess(request, projectId, "rent.manage", "Your role can't change rent schedules.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const opts = { actor: gate.auth.user };
    let res;
    if (action === "cancel") res = await cancelRentStep(gate.admin, lease, stepId, opts);
    else if (action === "create") res = await addRentStep(gate.admin, lease, step || {}, opts);
    else return billingError({ message: `Unknown action "${action}".` });
    return Response.json({ ok: true, step: res.step, rent: res.rent, entries: entryView(res.entries) });
  } catch (e) {
    return billingError(e, "Couldn't change the rent schedule.");
  }
}
