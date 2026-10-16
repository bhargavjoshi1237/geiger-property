import { portalBaseUrl } from "@/lib/portal/auth";
import { portalError, portalJson } from "@/lib/portal/http";
import { startAutopay, stopAutopay } from "@/lib/portal/payments";
import { residentContext, residentPermissions } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// POST — enroll in autopay (returns a hosted setup URL).
export const POST = withPortal(
  async (ctx, request) => {
    const perms = residentPermissions(ctx);
    if (!perms.payments) return portalError(403, perms.paymentsBlockedReason || "Online payments are turned off for your account.");
    const rc = await residentContext(ctx);
    const res = await startAutopay(ctx, rc, { baseUrl: portalBaseUrl(request) });
    if (!res?.ok) return portalError(res?.code === "stripe_not_configured" ? 503 : 400, res?.error || "Couldn't start autopay.");
    return portalJson({ url: res.url || null });
  },
  { role: "resident" },
);

// DELETE — cancel autopay.
export const DELETE = withPortal(
  async (ctx) => {
    const rc = await residentContext(ctx);
    const res = await stopAutopay(ctx, rc);
    if (!res?.ok) return portalError(400, res?.error || "Couldn't cancel autopay.");
    return portalJson({ canceled: true });
  },
  { role: "resident" },
);
