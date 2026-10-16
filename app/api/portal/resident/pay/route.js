import { portalBaseUrl } from "@/lib/portal/auth";
import { amountOf, portalError, portalJson, readBody } from "@/lib/portal/http";
import { startCheckout } from "@/lib/portal/payments";
import { residentContext, residentPermissions } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// POST { amount, method?, savePaymentMethod? } — open a hosted checkout for the resident's lease.
export const POST = withPortal(
  async (ctx, request) => {
    const perms = residentPermissions(ctx);
    if (!perms.payments) return portalError(403, perms.paymentsBlockedReason || "Online payments are turned off for your account.");
    const body = await readBody(request);
    const amount = amountOf(body.amount);
    if (!amount) return portalError(400, "Enter an amount to pay.");
    const rc = await residentContext(ctx);
    const res = await startCheckout(ctx, rc, {
      amount,
      method: ["card", "ach"].includes(body.method) ? body.method : "",
      savePaymentMethod: Boolean(body.savePaymentMethod),
      baseUrl: portalBaseUrl(request),
    });
    if (!res?.ok) return portalError(res?.code === "stripe_not_configured" ? 503 : 400, res?.error || "Couldn't start the payment.");
    return portalJson({ url: res.url });
  },
  { role: "resident" },
);
