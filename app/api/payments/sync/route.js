import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { isStripeConfigured } from "@/lib/stripe/server";
import { syncPaymentIntent } from "@/lib/payments/fulfill";

// POST — signed-in staff "Refresh from Stripe" for one payment (re-reads its
// PaymentIntent and applies any missed status change; idempotent).
// Body: { projectId, paymentId } → { ok, status }

export const maxDuration = 60;

export async function POST(request) {
  const input = await readJson(request);
  if (!input.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, input.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!isStripeConfigured()) return jsonError(503, "Stripe isn't configured.");
  const { data: row } = await auth.db.from("online_payments").select("*").eq("id", input.paymentId).maybeSingle();
  if (!row || row.project_id !== auth.projectId) return jsonError(404, "Payment not found.");
  if (!row.stripe_payment_intent_id) return Response.json({ ok: true, status: row.status });
  try {
    const result = await syncPaymentIntent(auth.db, row.stripe_payment_intent_id, { row });
    return Response.json({ ok: true, status: result.status || row.status });
  } catch (e) {
    console.error("[payments.sync]", e);
    return jsonError(502, "Couldn't refresh from Stripe.");
  }
}
