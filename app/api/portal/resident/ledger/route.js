import { portalJson } from "@/lib/portal/http";
import { autopayAvailable, autopayStatus, paymentOptions } from "@/lib/portal/payments";
import { homeView, residentContext, residentLedger, residentPayments, residentPermissions } from "@/lib/portal/resident";
import { withPortal } from "@/lib/portal/session";

// Pay options from the payments library, reduced to what the portal shows.
async function optionsFor(ctx, rc, permissions) {
  if (!permissions.payments || !rc.lease) return null;
  const res = await paymentOptions(ctx, rc).catch((e) => {
    console.error("[portal.pay.options]", e);
    return null;
  });
  if (!res?.ok) return { stripeConfigured: false, methods: [], allowed: false, reason: res?.error || "Online payments aren't available." };
  return {
    stripeConfigured: Boolean(res.stripeConfigured),
    methods: res.methods || [],
    fees: res.fees || {},
    allowPartial: res.allowPartial !== false,
    allowSaveMethod: res.allowSaveMethod !== false,
    allowed: Boolean(res.allowed),
    reason: res.reason || "",
  };
}

// GET — balance, full ledger, open charges, online payments, autopay and pay options.
export const GET = withPortal(
  async (ctx) => {
    const rc = await residentContext(ctx);
    const permissions = residentPermissions(ctx);
    const [ledger, payments, options, autopay] = await Promise.all([
      residentLedger(ctx, rc),
      residentPayments(ctx),
      optionsFor(ctx, rc, permissions),
      permissions.payments ? autopayStatus(ctx, rc).catch(() => null) : null,
    ]);
    return portalJson({
      home: homeView(rc),
      permissions,
      ledger: { ...ledger, rows: permissions.ledger ? ledger.rows : [] },
      payments: payments.payments,
      autopay: payments.autopay,
      autopayAvailable,
      autopayStatus: autopay
        ? {
            enabled: autopay.enabled !== false,
            enrolled: Boolean(autopay.enrolled),
            allowed: Boolean(autopay.allowed),
            reason: autopay.reason || "",
            nextChargeOn: autopay.plan?.nextChargeOn || null,
          }
        : null,
      options,
    });
  },
  { role: "resident" },
);
