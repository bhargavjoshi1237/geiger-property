import { NextResponse } from "next/server";

import { adminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured, stripeWebhookSecret } from "@/lib/stripe/server";
import {
  completeAutopaySetup,
  expireCheckoutSession,
  fulfillCheckoutSession,
  handleChargeFailed,
  handleChargeRefunded,
  handleDispute,
  handlePayout,
  syncPaymentIntent,
} from "@/lib/payments/fulfill";

// Stripe webhook (mirrors geiger-events): verify the signature, record the event
// in property.stripe_events (dedupe + audit), then fulfil. Subscribe the endpoint
// to the events in HANDLED below. Events for other suite apps are ignored.

export const maxDuration = 60;

const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "charge.failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "setup_intent.succeeded",
  "payout.paid",
  "payout.failed",
]);

async function dispatch(admin, event) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
      return fulfillCheckoutSession(obj.id, { admin });
    case "checkout.session.expired":
      return expireCheckoutSession(admin, obj);
    case "payment_intent.succeeded":
    case "payment_intent.processing":
    case "payment_intent.payment_failed":
      if (obj.metadata?.app !== "geiger-property") return { ignored: true };
      return syncPaymentIntent(admin, obj.id);
    case "charge.failed":
      return handleChargeFailed(admin, obj);
    case "charge.refunded":
      return handleChargeRefunded(admin, obj);
    case "charge.dispute.created":
      return handleDispute(admin, obj);
    case "charge.dispute.closed":
      return handleDispute(admin, obj, { closed: true });
    case "setup_intent.succeeded":
      if (obj.metadata?.app !== "geiger-property") return { ignored: true };
      return completeAutopaySetup(admin, { planId: obj.metadata.planId, setupIntent: obj.id });
    case "payout.paid":
    case "payout.failed":
      return handlePayout(admin, obj);
    default:
      return { ignored: true };
  }
}

export async function POST(request) {
  const secret = stripeWebhookSecret();
  if (!isStripeConfigured() || !secret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch (error) {
    console.error("[stripe.webhook] signature verification failed", error.message);
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }
  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });

  const obj = event.data.object || {};
  const projectId = obj.metadata?.projectId || null;
  const { data: logged } = await admin
    .from("stripe_events")
    .upsert(
      {
        event_id: event.id,
        event_type: event.type,
        livemode: Boolean(event.livemode),
        object_id: obj.id || null,
        project_id: projectId,
        metadata: { app: obj.metadata?.app || null },
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (!logged?.length) {
    const { data: prior } = await admin.from("stripe_events").select("status").eq("event_id", event.id).maybeSingle();
    if (prior?.status === "processed" || prior?.status === "ignored") return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const result = (await dispatch(admin, event)) || {};
    await admin
      .from("stripe_events")
      .update({ status: result.ignored ? "ignored" : "processed", processed_at: new Date().toISOString(), error: null })
      .eq("event_id", event.id);
  } catch (error) {
    console.error(`[stripe.webhook] ${event.type} failed`, error);
    await admin.from("stripe_events").update({ status: "failed", error: String(error?.message || error).slice(0, 500) }).eq("event_id", event.id);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
