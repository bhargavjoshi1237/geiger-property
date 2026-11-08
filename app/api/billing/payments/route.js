import { jsonError, readJson } from "@/lib/auth/staff";
import { staffCan } from "@/lib/auth/permissions";
import { billingAccess } from "@/lib/billing/http";
import { recordManualPayment } from "@/lib/billing/payments";
import { OVERRIDE_PERMISSION } from "@/lib/billing/payment_rules";

// POST — record an office payment (CORE-11): Dr cash / Cr AR once under pay:<requestId>, then activity, payment.received and the receipt.
// Body { projectId, requestId, leaseId | tenantId, payer?, amount, date, method, reference, bankAccountId | undeposited, allocations?, memo, sendReceipt, receiptTo?, override?: { reason } }.

export async function POST(request) {
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.post", "Your role can't record payments.");
  if (gate.response) return gate.response;
  try {
    const canOverride = body.override?.reason ? await staffCan(gate.auth, OVERRIDE_PERMISSION) : false;
    const res = await recordManualPayment(gate.admin, body, gate.auth.user, { canOverride });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    // A restricted payment comes back with what it broke, so the dialog can ask for an override reason.
    if (e?.restrictions) return Response.json({ ok: false, error: e.message, restrictions: e.restrictions }, { status: Number(e.status) || 409 });
    return jsonError(Number(e?.status) || 400, e?.message || "Couldn't record the payment.");
  }
}
