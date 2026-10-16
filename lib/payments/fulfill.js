import { adminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/ledger/postings";
import { getStripe } from "@/lib/stripe/server";
import { methodFromStripeType } from "./constants";
import { meta, readPaymentSettings } from "./context";
import { describePaymentMethod } from "./customers";
import {
  emitPaymentEvent,
  flagTenantReturn,
  logPaymentActivity,
  postNsfFee,
  postPaymentToLedger,
  rebookRefundEntries,
  refundsOf,
  sendPaymentReceipt,
  updatePayment,
  voidIfPosted,
  voidRefundEntries,
} from "./posting";
import { applyRefund } from "./refunds";

// Server-only fulfillment shared by the Stripe webhook, the checkout return
// (verify) route and the autopay job. Every step is idempotent: the payment row
// is looked up by our id / Stripe ids, ledger posts carry idempotency keys and
// status transitions never move backwards. Events that aren't ours (other suite
// apps on the same Stripe account) are ignored.

const APP = "geiger-property";
const usd = (n) => `$${round2(n).toFixed(2)}`;
const SETTLED = ["succeeded", "partially_refunded", "refunded"];
const REVERSED = ["returned", "disputed"];
const idOf = (v) => (typeof v === "string" ? v : v?.id || null);

export async function findPaymentRow(admin, { paymentId, paymentIntentId, sessionId, chargeId } = {}) {
  const tries = [
    ["id", paymentId],
    ["stripe_payment_intent_id", paymentIntentId],
    ["stripe_session_id", sessionId],
    ["stripe_charge_id", chargeId],
  ];
  for (const [col, value] of tries) {
    if (!value) continue;
    const { data } = await admin.from("online_payments").select("*").eq(col, value).is("deleted_at", null).limit(1);
    if (data?.length) return data[0];
  }
  return null;
}

async function retrieveIntent(pi) {
  const id = idOf(pi);
  if (!id) return null;
  return getStripe().paymentIntents.retrieve(id, { expand: ["latest_charge.balance_transaction", "payment_method"] });
}

// Bump the lease's autopay plan after a charge succeeded / failed.
async function touchAutopayPlan(admin, row, ok, reason = "") {
  if (!row.autopay_plan_id) return;
  const { data: plan } = await admin.from("autopay_plans").select("*").eq("id", row.autopay_plan_id).maybeSingle();
  if (!plan) return;
  if (ok) {
    await admin.from("autopay_plans").update({ failure_count: 0, last_status: "succeeded", last_error: null }).eq("id", plan.id);
    return;
  }
  const settings = await readPaymentSettings(admin, row.project_id || null);
  const failures = (Number(plan.failure_count) || 0) + 1;
  const max = Number(settings.autopayMaxFailures) || 0;
  await admin
    .from("autopay_plans")
    .update({
      failure_count: failures,
      last_status: "failed",
      last_error: reason || "Payment failed",
      ...(max > 0 && failures >= max && plan.status === "active" ? { status: "paused" } : {}),
    })
    .eq("id", plan.id);
}

// Move a row to `patch.status` only if it isn't already in one of `blocked`
// (atomic claim, so concurrent webhooks run the side effects once) → row | null.
async function claim(admin, id, patch, blocked) {
  const { data, error } = await admin
    .from("online_payments")
    .update(patch)
    .eq("id", id)
    .not("status", "in", `(${blocked.join(",")})`)
    .select("*");
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

// Payment failed, returned (ACH return / late failure) or disputed → reverse it.
// kind: "failed" | "returned" | "disputed".
export async function handlePaymentFailure(admin, row, { kind = "failed", reason = "" } = {}) {
  if (REVERSED.includes(row.status) || (row.status === "failed" && kind === "failed")) return row;
  if (["refunded", "canceled", "expired"].includes(row.status)) return row;
  const credited = Boolean(row.ledger_entry_id);
  const status = kind === "failed" && (credited || row.status === "succeeded") ? "returned" : kind;
  const now = new Date().toISOString();
  const blocked = [...REVERSED, "refunded", "canceled", "expired", ...(status === "failed" ? ["failed"] : [])];
  const claimed = await claim(
    admin,
    row.id,
    { status, return_reason: reason || null, ...(status === "failed" ? { failed_at: now } : { returned_at: now }) },
    blocked,
  );
  if (!claimed) return row;

  const memo = `Returned payment${reason ? `: ${reason}` : ""}`.slice(0, 200);
  let base = claimed;
  if (credited) {
    await voidIfPosted(admin, row.ledger_entry_id, memo);
    await voidIfPosted(admin, row.fee_entry_id, memo);
  }
  // Voiding the payment re-opens its full amount, so void the partial-refund
  // re-opens too — otherwise the refunded part lands on the lease twice.
  if (refundsOf(claimed).some((r) => r.entryId && !r.voidedAt)) {
    const refunds = await voidRefundEntries(admin, claimed, memo);
    base = await updatePayment(admin, row.id, { metadata: { ...meta(claimed), refunds } });
  }
  const ach = row.method === "ach";
  const isReturn = credited || ach || kind !== "failed";
  // NSF applies to bank returns; a card decline or card dispute carries no NSF fee.
  let nsfEntryId = row.nsf_entry_id || null;
  if (ach && !nsfEntryId) {
    try {
      nsfEntryId = await postNsfFee(admin, row);
    } catch (e) {
      console.error("[payments.nsf]", e);
    }
  }
  const next = nsfEntryId && nsfEntryId !== base.nsf_entry_id ? await updatePayment(admin, row.id, { nsf_entry_id: nsfEntryId }) : base;
  if (isReturn) await flagTenantReturn(admin, next);
  await touchAutopayPlan(admin, next, false, reason);
  const label = status === "failed" ? "failed" : status === "disputed" ? "was disputed" : "was returned";
  await logPaymentActivity(
    admin,
    next,
    "payment",
    `Online payment of ${usd(next.amount)} ${label}${reason ? ` (${reason})` : ""}${credited ? " — reversed on the ledger" : ""}${nsfEntryId ? "; NSF fee charged" : ""}`,
    { status },
  );
  if (status !== "failed") await emitPaymentEvent(admin, next, "payment.returned");
  return next;
}

// Bring a payment row in line with its PaymentIntent (succeeded / processing / failed).
export async function syncPaymentIntent(admin, piOrId, { row: known = null } = {}) {
  const pi = typeof piOrId === "string" || !piOrId?.latest_charge?.id ? await retrieveIntent(piOrId) : piOrId;
  if (!pi) return { ok: false, error: "Payment not found." };
  const md = pi.metadata || {};
  let row = known || (await findPaymentRow(admin, { paymentId: md.paymentId, paymentIntentId: pi.id }));
  if (!row) return { ok: md.app === APP ? false : true, ignored: md.app !== APP, error: md.app === APP ? "No payment row for this intent." : undefined };

  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const pm = typeof pi.payment_method === "object" ? pi.payment_method : null;
  const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  const base = {
    stripe_payment_intent_id: pi.id,
    ...(charge ? { stripe_charge_id: charge.id } : {}),
    ...(pm ? { stripe_payment_method_id: pm.id, method: methodFromStripeType(pm.type), method_label: describePaymentMethod(pm) } : {}),
    ...(bt ? { processor_fee: round2((Number(bt.fee) || 0) / 100) } : {}),
    ...(idOf(pi.customer) ? { stripe_customer_id: idOf(pi.customer) } : {}),
  };

  if (pi.status === "succeeded") {
    if (REVERSED.includes(row.status)) return { ok: true, status: row.status, paymentId: row.id };
    const paidAt = row.paid_at || new Date((pi.created || Date.now() / 1000) * 1000).toISOString();
    const won = await claim(admin, row.id, { ...base, status: "succeeded", paid_at: paidAt }, [...SETTLED, ...REVERSED]);
    const first = Boolean(won);
    row = won || (await updatePayment(admin, row.id, base));
    if (REVERSED.includes(row.status)) return { ok: true, status: row.status, paymentId: row.id };
    row = await postPaymentToLedger(admin, row);
    if (first) {
      await touchAutopayPlan(admin, row, true);
      await logPaymentActivity(admin, row, "payment", `Online payment of ${usd(row.amount)} received${row.method_label ? ` · ${row.method_label}` : ""}`, { status: "succeeded" });
      await emitPaymentEvent(admin, row, "payment.received");
      await sendPaymentReceipt(admin, row);
    }
    return { ok: true, status: row.status, paymentId: row.id, amount: Number(row.amount) };
  }

  if (pi.status === "processing") {
    if (SETTLED.includes(row.status) || REVERSED.includes(row.status)) return { ok: true, status: row.status, paymentId: row.id };
    const won = await claim(admin, row.id, { ...base, status: "processing" }, ["processing", ...SETTLED, ...REVERSED]);
    const first = Boolean(won);
    row = won || (await updatePayment(admin, row.id, base));
    if (row.status !== "processing") return { ok: true, status: row.status, paymentId: row.id };
    const settings = await readPaymentSettings(admin, row.project_id || null);
    if (settings.achCreditOnSubmit) row = await postPaymentToLedger(admin, row);
    if (first) await logPaymentActivity(admin, row, "payment", `ACH payment of ${usd(row.amount)} submitted — settles in a few business days`, { status: "processing" });
    return { ok: true, status: "processing", paymentId: row.id, amount: Number(row.amount) };
  }

  if (pi.status === "requires_payment_method" && pi.last_payment_error) {
    const err = pi.last_payment_error;
    row = await updatePayment(admin, row.id, base);
    row = await handlePaymentFailure(admin, row, { kind: "failed", reason: err.decline_code || err.code || err.message || "" });
    return { ok: false, status: row.status, paymentId: row.id, error: err.message || "The payment failed." };
  }

  if (pi.status === "canceled" && !SETTLED.includes(row.status)) {
    row = await updatePayment(admin, row.id, { ...base, status: "canceled" });
  }
  return { ok: false, status: row.status, paymentId: row.id };
}

// A saved method from a payment checkout activates the lease's pending autopay plan.
async function adoptSavedMethod(admin, row, pi) {
  const pm = typeof pi?.payment_method === "object" ? pi.payment_method : null;
  if (!pm || !pi.setup_future_usage || !row.lease_id) return;
  const { data: plans } = await admin
    .from("autopay_plans")
    .select("*")
    .eq("lease_id", row.lease_id)
    .eq("status", "pending_setup")
    .is("deleted_at", null)
    .limit(1);
  if (plans?.length) await activatePlan(admin, plans[0], pm, idOf(pi.customer));
}

// Activate an autopay plan with a saved PaymentMethod.
export async function activatePlan(admin, plan, pm, customerId) {
  if (!pm) return plan;
  const method = methodFromStripeType(pm.type);
  const { data: next, error } = await admin
    .from("autopay_plans")
    .update({
      status: "active",
      stripe_payment_method_id: pm.id,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      method,
      method_label: describePaymentMethod(pm),
      activated_at: plan.activated_at || new Date().toISOString(),
      failure_count: 0,
      last_error: null,
      link_token: null,
    })
    .eq("id", plan.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  // One live plan per lease.
  await admin
    .from("autopay_plans")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("lease_id", plan.lease_id)
    .neq("id", plan.id)
    .in("status", ["active", "paused", "pending_setup"]);
  if (plan.lease_id) {
    await admin
      .from("rent_accounts")
      .update({ autopay: true, payment_method: method === "ach" ? "ACH" : "Card" })
      .eq("lease_id", plan.lease_id)
      .is("deleted_at", null);
  }
  if (plan.status !== "active") {
    await logPaymentActivity(admin, { ...next, id: next.id }, "autopay", `Autopay turned on · ${next.method_label || method}`, { autopayPlanId: next.id });
  }
  return next;
}

// Setup-mode checkout / setup_intent.succeeded → active autopay plan.
export async function completeAutopaySetup(admin, { planId, setupIntent }) {
  const stripe = getStripe();
  const si = typeof setupIntent === "string" ? await stripe.setupIntents.retrieve(setupIntent, { expand: ["payment_method"] }) : setupIntent;
  const id = planId || si?.metadata?.planId;
  if (!id || !si || si.status !== "succeeded") return { ok: false, error: "Setup isn't complete." };
  const { data: plan } = await admin.from("autopay_plans").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!plan) return { ok: false, error: "Autopay enrollment not found." };
  if (plan.status === "canceled") return { ok: false, error: "This autopay enrollment was canceled." };
  const pm = typeof si.payment_method === "object" ? si.payment_method : await stripe.paymentMethods.retrieve(si.payment_method);
  const next = await activatePlan(admin, plan, pm, idOf(si.customer));
  return { ok: true, status: next.status, planId: next.id };
}

// checkout.session.completed / async_payment_* / the verify route.
export async function fulfillCheckoutSession(sessionOrId, { admin = adminClient() } = {}) {
  if (!admin) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured." };
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(idOf(sessionOrId), {
    expand: ["payment_intent.latest_charge.balance_transaction", "payment_intent.payment_method", "setup_intent.payment_method"],
  });
  const md = session.metadata || {};
  if (md.app !== APP) return { ok: true, ignored: true };

  if (session.mode === "setup") {
    if (session.status !== "complete") return { ok: false, status: session.status };
    return completeAutopaySetup(admin, { planId: md.planId, setupIntent: session.setup_intent });
  }

  let row = await findPaymentRow(admin, { paymentId: md.paymentId, sessionId: session.id });
  if (!row) return { ok: false, error: "No payment row for this checkout." };
  if (row.stripe_session_id !== session.id) row = await updatePayment(admin, row.id, { stripe_session_id: session.id });
  const pi = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
  if (!pi) return { ok: false, status: session.payment_status, paymentId: row.id };
  const result = await syncPaymentIntent(admin, pi, { row });
  await adoptSavedMethod(admin, row, pi);
  return result;
}

// Abandoned checkout: a staff link goes back to "link sent", others expire.
export async function expireCheckoutSession(admin, session) {
  const md = session.metadata || {};
  if (md.app !== APP) return { ok: true, ignored: true };
  if (session.mode === "setup") return { ok: true };
  const row = await findPaymentRow(admin, { paymentId: md.paymentId, sessionId: session.id });
  if (!row || row.status !== "pending" || row.stripe_session_id !== session.id) return { ok: true };
  await updatePayment(admin, row.id, { status: row.link_token ? "link_sent" : "expired" });
  return { ok: true };
}

// charge.failed after the intent succeeded (late ACH return).
export async function handleChargeFailed(admin, charge) {
  const row = await findPaymentRow(admin, { paymentIntentId: idOf(charge.payment_intent), chargeId: charge.id });
  if (!row) return { ok: true, ignored: true };
  const reason = charge.failure_code || charge.outcome?.reason || charge.failure_message || "";
  await handlePaymentFailure(admin, row, { kind: SETTLED.includes(row.status) ? "returned" : "failed", reason });
  return { ok: true };
}

// charge.refunded (including refunds made in the Stripe Dashboard).
export async function handleChargeRefunded(admin, charge) {
  const row = await findPaymentRow(admin, { paymentIntentId: idOf(charge.payment_intent), chargeId: charge.id });
  if (!row) return { ok: true, ignored: true };
  let current = row;
  for await (const refund of getStripe().refunds.list({ charge: charge.id, limit: 100 })) {
    if (refund.status === "succeeded" || refund.status === "pending") current = await applyRefund(admin, current, refund);
  }
  return { ok: true };
}

// charge.dispute.created / closed.
export async function handleDispute(admin, dispute, { closed = false } = {}) {
  const row = await findPaymentRow(admin, { paymentIntentId: idOf(dispute.payment_intent), chargeId: idOf(dispute.charge) });
  if (!row) return { ok: true, ignored: true };
  if (!closed) {
    await handlePaymentFailure(admin, row, { kind: "disputed", reason: dispute.reason || "dispute" });
    return { ok: true };
  }
  if (dispute.status === "won" && row.status === "disputed") {
    // Reinstate the payment under a fresh idempotency key, then re-book the
    // refunds the return voided (or that arrived while it was disputed).
    const total = round2(row.total || row.amount);
    const refunded = round2(row.refunded_amount);
    let next = await updatePayment(admin, row.id, {
      status: refunded > 0 ? (refunded + 0.005 >= total ? "refunded" : "partially_refunded") : "succeeded",
      ledger_entry_id: null,
      metadata: { ...meta(row), reinstatedAt: new Date().toISOString(), voidedEntryId: row.ledger_entry_id },
    });
    next = await postPaymentToLedger(admin, next, { keySuffix: ":reinstated", skipFee: true });
    if (refundsOf(next).some((r) => (r.entryId && r.voidedAt) || r.deferred)) {
      const refunds = await rebookRefundEntries(admin, next);
      next = await updatePayment(admin, row.id, { metadata: { ...meta(next), refunds } });
    }
    await logPaymentActivity(admin, next, "payment", `Dispute won — online payment of ${usd(next.amount)} reinstated`, { status: "succeeded" });
  } else {
    await logPaymentActivity(admin, row, "payment", `Dispute closed (${dispute.status}) on a ${usd(row.amount)} online payment`, { dispute: dispute.status });
  }
  return { ok: true };
}

// payout.paid / payout.failed → stamp the payout on every charge it carried.
export async function handlePayout(admin, payout) {
  if (payout.status === "failed") {
    await admin.from("online_payments").update({ payout_id: null, payout_arrival_date: null }).eq("payout_id", payout.id);
    return { ok: true };
  }
  const arrival = payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10) : null;
  const charges = [];
  for await (const bt of getStripe().balanceTransactions.list({ payout: payout.id, limit: 100 })) {
    const src = idOf(bt.source);
    if (src && /^(ch|py)_/.test(src)) charges.push(src);
  }
  for (let i = 0; i < charges.length; i += 100) {
    await admin
      .from("online_payments")
      .update({ payout_id: payout.id, payout_arrival_date: arrival })
      .in("stripe_charge_id", charges.slice(i, i + 100));
  }
  return { ok: true, charges: charges.length };
}
