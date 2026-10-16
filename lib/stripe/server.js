import Stripe from "stripe";

// Server-only Stripe client (mirrors geiger-events). Every caller checks
// isStripeConfigured() first; with no STRIPE_SECRET_KEY the app shows a clear
// "Stripe not configured" state instead of failing.

let cached = null;

export function stripeSecretKey() {
  return process.env.GEIGER_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "";
}

export function isStripeConfigured() {
  return Boolean(stripeSecretKey());
}

export function stripeWebhookSecret() {
  return process.env.GEIGER_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || "";
}

export const stripePublishableKey = () => process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

// "test" | "live" | null, read from the secret key prefix.
export function stripeMode() {
  const key = stripeSecretKey();
  if (!key) return null;
  return /^(sk|rk)_live_/.test(key) ? "live" : "test";
}

export function getStripe() {
  if (!isStripeConfigured()) return null;
  if (!cached) cached = new Stripe(stripeSecretKey());
  return cached;
}

// Configuration snapshot for the settings screen (no secrets).
export function stripeStatus() {
  return {
    configured: isStripeConfigured(),
    webhookConfigured: Boolean(stripeWebhookSecret()),
    publishableKey: Boolean(stripePublishableKey()),
    mode: stripeMode(),
  };
}
