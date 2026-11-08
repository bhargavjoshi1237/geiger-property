import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { makeBillingContext } from "@/lib/billing/context";
import { cancelPlan } from "@/lib/billing/payment_plans";

// POST { projectId, reason } — cancel a payment plan (CORE-14): a draft just closes; an active plan's deferred remainder posts back to AR (plan:<id>:accelerate).

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.payment_plans", "Your role can't cancel payment plans.");
  if (gate.response) return gate.response;
  try {
    const res = await cancelPlan(gate.admin, makeBillingContext(gate.admin), id, { projectId: body.projectId, reason: body.reason, actor: gate.auth.user });
    return Response.json({ ok: true, plan: res.plan, entries: entryView(res.entries), replay: Boolean(res.replay) });
  } catch (e) {
    return billingError(e, "Couldn't cancel the payment plan.");
  }
}
