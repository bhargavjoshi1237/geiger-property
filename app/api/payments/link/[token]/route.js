import { NextResponse } from "next/server";

import { isStripeConfigured } from "@/lib/stripe/server";
import { openPaymentLink } from "@/lib/payments/checkout";
import { openAutopayLink } from "@/lib/payments/autopay";
import { fulfillCheckoutSession } from "@/lib/payments/fulfill";
import { requestBase, resultPage } from "@/lib/payments/http";

// GET /api/payments/link/<token> — public, token-gated payer link from an email.
// Opens a fresh Stripe Checkout (payment or autopay setup), re-checking the
// lease's payment policies on every click; Stripe returns here with the result.

export const maxDuration = 60;

export async function GET(request, { params }) {
  const { token } = await params;
  const search = request.nextUrl.searchParams;
  const baseUrl = requestBase(request);
  const self = `${baseUrl}/api/payments/link/${encodeURIComponent(token)}`;

  if (!isStripeConfigured()) {
    return resultPage({ title: "Payments unavailable", message: "Online payments aren't available right now. Please contact the office." }, 503);
  }

  // Back from Stripe.
  const sessionId = search.get("session_id");
  if (sessionId) {
    let result = {};
    try {
      result = await fulfillCheckoutSession(sessionId);
    } catch (e) {
      console.error("[payments.link.return]", e);
    }
    if (result.planId) {
      return resultPage({ title: "Autopay is set up", message: "Rent will be paid automatically from your saved method on the due day each month." });
    }
    if (result.status === "processing") {
      return resultPage({ title: "Payment submitted", message: "Your bank payment is processing and usually settles in 3–5 business days. We'll email a receipt when it does." });
    }
    if (result.ok) return resultPage({ title: "Payment received", message: "Thank you! A receipt is on its way to your email." });
    return resultPage({ title: "We couldn't confirm the payment", message: result.error || "If you were charged, the office will see it shortly.", actionUrl: self, actionLabel: "Try again" });
  }
  if (search.get("result") === "canceled" || search.get("autopay") === "canceled") {
    return resultPage({ title: "Nothing was charged", message: "You left checkout before finishing.", actionUrl: self, actionLabel: "Return to checkout" });
  }

  const opened = (await openAutopayLink(token, { baseUrl })) || (await openPaymentLink(token, { baseUrl }));
  if (opened.ok && opened.url) return NextResponse.redirect(opened.url, 303);
  const title = opened.paid || opened.done ? "All set" : "This link can't be used";
  return resultPage({ title, message: opened.error || "This link isn't valid." }, opened.paid || opened.done ? 200 : 410);
}
