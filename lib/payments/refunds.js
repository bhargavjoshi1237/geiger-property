import { adminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/ledger/postings";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { meta } from "./context";
import { logPaymentActivity, postRefundEntry, refundsOf, updatePayment, voidIfPosted } from "./posting";

// Server-only refunds. refundPayment() issues the Stripe refund; applyRefund()
// books one Stripe refund on the ledger exactly once (shared with the
// charge.refunded webhook, which also catches Dashboard refunds): a single
// refund of the whole payment voids its entries, anything else re-opens the
// refunded amount on the lease (Dr AR / Cr cash, key stripe-refund:<re_id>).
// A refund landing on a returned / disputed payment is only recorded (deferred):
// the payment is already reversed, and a won dispute re-books it.

const REFUNDABLE = ["succeeded", "partially_refunded"];
const REVERSED = ["returned", "disputed"];

export async function applyRefund(admin, row, refund) {
  const done = refundsOf(row);
  if (done.some((r) => r.id === refund.id)) return row;
  const amount = round2((Number(refund.amount) || 0) / 100);
  const total = round2(row.total || row.amount);
  const prior = round2(row.refunded_amount);
  const refunded = round2(prior + amount);
  const deferred = REVERSED.includes(row.status);
  const whole = !deferred && prior === 0 && amount + 0.005 >= total;
  let entryId = null;
  if (deferred) {
    // Nothing to post: the reversal already re-opened the full payment.
  } else if (whole) {
    await voidIfPosted(admin, row.ledger_entry_id, "Refunded online payment");
    await voidIfPosted(admin, row.fee_entry_id, "Refunded online payment");
  } else {
    entryId = await postRefundEntry(admin, row, refund);
  }
  const next = await updatePayment(admin, row.id, {
    refunded_amount: refunded,
    status: deferred ? row.status : refunded + 0.005 >= total ? "refunded" : "partially_refunded",
    metadata: {
      ...meta(row),
      refunds: [...done, { id: refund.id, amount, reason: refund.reason || refund.metadata?.reason || "", at: new Date().toISOString(), entryId, ...(deferred ? { deferred: true } : {}) }],
    },
  });
  await logPaymentActivity(admin, next, "payment", `Refunded $${amount.toFixed(2)} of an online payment`, { refundId: refund.id });
  return next;
}

// refundPayment({ projectId, paymentId, amount?, reason?, actorName? })
// → { ok, refundId, amount, status } | { ok:false, error }. Omit amount for a full refund.
export async function refundPayment({ projectId, paymentId, amount, reason = "", actorName = "" } = {}) {
  if (!isStripeConfigured()) return { ok: false, code: "stripe_not_configured", error: "Stripe isn't configured." };
  const admin = adminClient();
  if (!admin) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured." };
  const { data: row } = await admin.from("online_payments").select("*").eq("id", paymentId).is("deleted_at", null).maybeSingle();
  if (!row || (projectId && row.project_id !== projectId)) return { ok: false, error: "Payment not found." };
  if (!REFUNDABLE.includes(row.status) || !row.stripe_payment_intent_id) {
    return { ok: false, error: "Only settled payments can be refunded." };
  }
  const left = round2(round2(row.total || row.amount) - round2(row.refunded_amount));
  const amt = amount === undefined || amount === null || amount === "" ? left : round2(amount);
  if (!(amt > 0) || amt - left > 0.005) return { ok: false, error: `Refund between $0.01 and $${left.toFixed(2)}.` };
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: row.stripe_payment_intent_id,
        amount: Math.round(amt * 100),
        metadata: { app: "geiger-property", paymentId: row.id, reason: String(reason).slice(0, 200), by: String(actorName).slice(0, 100) },
      },
      { idempotencyKey: `refund:${row.id}:${Math.round(round2(row.refunded_amount) * 100)}:${Math.round(amt * 100)}` },
    );
    const next = await applyRefund(admin, row, { ...refund, reason: reason || refund.reason });
    return { ok: true, refundId: refund.id, amount: amt, status: next.status };
  } catch (e) {
    console.error("[payments.refund]", e);
    return { ok: false, error: e?.raw?.message || "Couldn't refund the payment." };
  }
}
