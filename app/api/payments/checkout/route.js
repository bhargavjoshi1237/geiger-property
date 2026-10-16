import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { createPaymentCheckout, createPaymentLink } from "@/lib/payments/checkout";
import { requestBase, sameOriginUrl, verifyReturnUrl } from "@/lib/payments/http";

// POST — signed-in staff collect a lease payment through Stripe.
// Body: { projectId, leaseId, tenantId?, amount, method?: "card"|"ach", payerEmail?, description?,
//         mode: "link" (emailable link, default) | "checkout" (take it now), sendEmail?, returnUrl? }
// → link: { ok, url, paymentId, emailed } · checkout: { ok, url, sessionId, paymentId }

export const maxDuration = 60;

export async function POST(request) {
  const input = await readJson(request);
  if (!input.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, input.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const common = {
    projectId: auth.projectId,
    leaseId: input.leaseId,
    tenantId: input.tenantId || undefined,
    amount: input.amount,
    method: input.method || undefined,
    payerEmail: input.payerEmail || undefined,
    description: input.description || undefined,
    createdBy: auth.user.id,
  };

  let result;
  if (input.mode === "checkout") {
    const back = sameOriginUrl(request, input.returnUrl);
    if (!back) return jsonError(400, "returnUrl must point back to this app.");
    const sep = back.includes("?") ? "&" : "?";
    result = await createPaymentCheckout({
      ...common,
      source: "staff_checkout",
      successUrl: verifyReturnUrl(request, back),
      cancelUrl: `${back}${sep}payment=canceled`,
    });
  } else {
    result = await createPaymentLink({ ...common, baseUrl: requestBase(request), sendEmail: Boolean(input.sendEmail) });
  }
  if (!result.ok) {
    const status = result.code === "stripe_not_configured" || result.code === "admin_not_configured" ? 503 : 400;
    return Response.json(result, { status });
  }
  return Response.json(result);
}
