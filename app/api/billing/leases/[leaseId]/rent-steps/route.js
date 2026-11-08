import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { billingWindow, isPreLive } from "@/lib/billing/rent";
import { loadLease } from "@/lib/billing/service";
import { addRentStep, cancelRentStep } from "@/lib/billing/steps";

// POST — change a lease's rent schedule (CORE-01) and true up billed months; body { projectId, action: "create", step } or { projectId, action: "cancel", stepId }; property.lease.manage may only set a not-yet-billing lease's starting rent.

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const { projectId, action = "create", step, stepId } = await readJson(request);
  const gate = await billingAccess(request, projectId, ["property.rent.manage", "property.lease.manage"], "Your role can't change rent schedules.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const startingRent = action === "create" && step?.source === "initial" && isPreLive(lease) && !billingWindow(lease).billable;
    if (!gate.can("property.rent.manage") && !startingRent) throw Object.assign(new Error("Your role can't change rent schedules."), { status: 403 });
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
