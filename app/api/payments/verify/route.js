import { NextResponse } from "next/server";

import { fulfillCheckoutSession } from "@/lib/payments/fulfill";
import { isStripeConfigured } from "@/lib/stripe/server";
import { sameOriginUrl } from "@/lib/payments/http";

// GET ?session_id=…[&back=…] — Checkout return (mirrors geiger-events verify):
// fulfil the session now so the ledger updates even before the webhook lands.
// With `back` (same-origin) it redirects there with ?payment=<status>; else JSON.

export const maxDuration = 60;

function redirectBack(request, back, status) {
  const target = sameOriginUrl(request, back);
  if (!target) return null;
  const url = new URL(target);
  url.searchParams.set("payment", status);
  return NextResponse.redirect(url, 303);
}

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const sessionId = params.get("session_id");
  const back = params.get("back");
  if (!sessionId) return NextResponse.json({ ok: false, error: "Missing session id." }, { status: 400 });
  if (!isStripeConfigured()) return NextResponse.json({ ok: false, error: "Stripe isn't configured." }, { status: 503 });

  let result;
  try {
    result = await fulfillCheckoutSession(sessionId);
  } catch (error) {
    console.error("[payments.verify]", error);
    result = { ok: false, status: "error", error: "Couldn't verify this payment." };
  }
  if (back) {
    const res = redirectBack(request, back, result.status || (result.ok ? "succeeded" : "error"));
    if (res) return res;
  }
  return NextResponse.json(
    { ok: Boolean(result.ok), status: result.status || null, paymentId: result.paymentId || null, planId: result.planId || null, error: result.error },
    { status: result.ok || result.status ? 200 : 502 },
  );
}
