import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { makeBillingContext } from "@/lib/billing/context";
import { defaultPlan } from "@/lib/billing/payment_plans";

// POST { projectId, reason } — default an active payment plan by hand (CORE-14): its deferred remainder comes due at once (plan:<id>:accelerate).

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.payment_plans", "Your role can't default payment plans.");
  if (gate.response) return gate.response;
  try {
    const res = await defaultPlan(gate.admin, makeBillingContext(gate.admin), id, { projectId: body.projectId, reason: body.reason, actor: gate.auth.user });
    return Response.json({ ok: true, plan: res.plan, entries: entryView(res.entries), replay: Boolean(res.replay) });
  } catch (e) {
    return billingError(e, "Couldn't default the payment plan.");
  }
}
