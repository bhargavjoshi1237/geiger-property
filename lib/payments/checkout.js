import { randomBytes } from "node:crypto";

import { adminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/ledger/postings";
import { sendNotificationEmail } from "@/lib/email/notifications";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { ONLINE_METHODS } from "./constants";
import { assessPayment, loadPaymentContext, payerOf, quoteFees } from "./context";
import { findOrCreateCustomer } from "./customers";
import { updatePayment } from "./posting";

// Server-only Stripe Checkout for rent and charges. Callers (the resident portal,
// staff routes) authorize the user first; these functions then enforce the
// lease's payment policies and never throw — they resolve { ok:false, error, code? }.

const LINK_DAYS = 14;

export const STRIPE_NOT_CONFIGURED = {
  ok: false,
  code: "stripe_not_configured",
  error: "Online payments aren't set up yet — add the Stripe keys to enable card and ACH payments.",
};

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
const isHttpUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || ""));
const cents = (n) => Math.round(round2(n) * 100);

// Sanitized statement descriptor suffix (≤ 22 chars).
const descriptorOf = (settings) =>
  String(settings.statementDescriptor || "").replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 22).trim();

// Methods + fee for a checkout: an explicit method, or every allowed method when
// their fees are equal; otherwise the caller must pick (code "method_required").
function chooseMethods(ctx, method, amount) {
  const fees = quoteFees(ctx, amount);
  if (method) return { ok: true, methods: [method], fee: fees[method] || 0, fees };
  const methods = ctx.methods;
  const distinct = new Set(methods.map((m) => fees[m] || 0));
  if (distinct.size > 1) {
    return fail("Choose card or bank account — the convenience fee differs by method.", { code: "method_required", fees, methods });
  }
  return { ok: true, methods, fee: fees[methods[0]] || 0, fees };
}

// Balance, accepted methods and fee quote for a lease (portal pay screen / staff dialog).
// getPaymentOptions({ projectId, leaseId, tenantId, amount? })
// → { ok, stripeConfigured, balance, methods, fees, allowed, reason, openItems }
export async function getPaymentOptions({ projectId, leaseId, tenantId, amount } = {}) {
  const admin = adminClient();
  const ctx = await loadPaymentContext(admin, { projectId, leaseId, tenantId });
  if (!ctx.ok) return fail(ctx.error, { status: ctx.status });
  const quoteAmount = amount ?? Math.max(0, ctx.balance);
  const gate = assessPayment(ctx, { amount: quoteAmount > 0 ? quoteAmount : 1 });
  return {
    ok: true,
    stripeConfigured: isStripeConfigured(),
    balance: ctx.balance,
    methods: ctx.methods,
    fees: quoteFees(ctx, quoteAmount),
    allowPartial: ctx.policies.allowPartialPayments !== false && !ctx.tenant?.metadata?.restrictNoPartial,
    allowSaveMethod: ctx.settings.allowSaveMethod !== false,
    allowed: gate.ok,
    reason: gate.ok ? "" : gate.error,
    openItems: ctx.items.map((i) => ({ entryId: i.entryId, date: i.date, memo: i.memo, open: i.open })),
  };
}

// Create a Stripe Checkout session for a lease payment.
// createPaymentCheckout({ projectId, leaseId, tenantId, amount, payerEmail, description,
//   successUrl, cancelUrl, savePaymentMethod, method?, source?, createdBy?, paymentId? })
// → { ok:true, url, sessionId, paymentId, amount, fee, total } | { ok:false, error, code? }
// `method` "card" | "ach" (required when the two carry different fees); `source`
// "portal" (default) | "staff_checkout" | "staff_link"; `paymentId` reuses a link row.
// `successUrl` gets `session_id={CHECKOUT_SESSION_ID}` appended.
export async function createPaymentCheckout({
  projectId,
  leaseId,
  tenantId,
  amount,
  payerEmail,
  description,
  successUrl,
  cancelUrl,
  savePaymentMethod = false,
  method,
  source = "portal",
  createdBy = null,
  paymentId = null,
} = {}) {
  if (!isStripeConfigured()) return STRIPE_NOT_CONFIGURED;
  const admin = adminClient();
  if (!admin) return fail("SUPABASE_SERVICE_ROLE_KEY is not configured.", { code: "admin_not_configured" });
  if (!isHttpUrl(successUrl) || !isHttpUrl(cancelUrl)) return fail("successUrl and cancelUrl must be absolute URLs.");
  if (method && !ONLINE_METHODS[method]) return fail(`Unknown payment method "${method}".`);

  const ctx = await loadPaymentContext(admin, { projectId, leaseId, tenantId });
  if (!ctx.ok) return fail(ctx.error);
  const amt = round2(amount);
  const gate = assessPayment(ctx, { amount: amt, method });
  if (!gate.ok) return fail(gate.error, { code: "policy" });
  const choice = chooseMethods(ctx, method, amt);
  if (!choice.ok) return choice;

  const payer = payerOf(ctx, payerEmail);
  const fee = round2(choice.fee);
  const total = round2(amt + fee);
  const currency = "usd";
  const label = description || `Payment · ${ctx.lease.name || ctx.lease.unit || "Lease"}`;
  const stripe = getStripe();

  try {
    const customer = await findOrCreateCustomer(admin, stripe, {
      projectId: ctx.projectId,
      tenant: ctx.tenant,
      leaseId,
      email: payer.email,
      name: payer.name,
    });

    const fields = {
      project_id: ctx.projectId,
      lease_id: leaseId,
      tenant_id: ctx.tenant?.id || null,
      property_id: ctx.lease.property_id || null,
      unit_id: ctx.lease.unit_id || null,
      description: label,
      payer_name: payer.name,
      payer_email: payer.email || null,
      method: choice.methods.length === 1 ? choice.methods[0] : null,
      amount: amt,
      convenience_fee: fee,
      total,
      currency,
      stripe_customer_id: customer,
      status: "pending",
    };
    let row;
    if (paymentId) {
      row = await updatePayment(admin, paymentId, fields);
    } else {
      const { data, error } = await admin
        .from("online_payments")
        .insert({ ...fields, source, created_by: createdBy })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      row = data;
    }

    const metadata = {
      kind: "lease_payment",
      app: "geiger-property",
      paymentId: row.id,
      projectId: ctx.projectId || "",
      leaseId,
      tenantId: ctx.tenant?.id || "",
      amount: String(amt),
      fee: String(fee),
      source: row.source || source,
    };
    const types = choice.methods.map((m) => ONLINE_METHODS[m].stripeType);
    const lineItems = [
      { price_data: { currency, product_data: { name: label }, unit_amount: cents(amt) }, quantity: 1 },
    ];
    if (fee > 0) {
      lineItems.push({
        price_data: { currency, product_data: { name: "Convenience fee" }, unit_amount: cents(fee) },
        quantity: 1,
      });
    }
    const descriptor = descriptorOf(ctx.settings);
    const save = Boolean(savePaymentMethod) && ctx.settings.allowSaveMethod !== false;
    const sep = successUrl.includes("?") ? "&" : "?";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      client_reference_id: row.id,
      payment_method_types: types,
      line_items: lineItems,
      success_url: `${successUrl}${sep}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata,
      payment_intent_data: {
        description: label,
        metadata,
        ...(save ? { setup_future_usage: "off_session" } : {}),
        ...(descriptor && types.length === 1 && types[0] === "card" ? { statement_descriptor_suffix: descriptor } : {}),
      },
      ...(types.includes("us_bank_account")
        ? {
            payment_method_options: {
              us_bank_account: {
                verification_method: "automatic",
                financial_connections: { permissions: ["payment_method"] },
              },
            },
          }
        : {}),
    });

    await updatePayment(admin, row.id, { stripe_session_id: session.id });
    return { ok: true, url: session.url, sessionId: session.id, paymentId: row.id, amount: amt, fee, total };
  } catch (e) {
    console.error("[payments.checkout]", e);
    return fail(e?.raw?.message || "Couldn't start checkout.", { code: "stripe_error" });
  }
}

// Absolute base for links in emails: NEXT_PUBLIC_APP_URL, else the request origin + basePath.
export function publicBaseUrl(origin) {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (env) return env;
  return `${String(origin || "").replace(/\/$/, "")}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
}

export const paymentLinkUrl = (base, token) => `${base}/api/payments/link/${token}`;

// Staff payment link: a long-lived URL that opens a fresh Checkout on click.
// createPaymentLink({ projectId, leaseId, tenantId?, amount, method?, payerEmail?, description?,
//   createdBy?, baseUrl, sendEmail? }) → { ok, url, paymentId, emailed } | { ok:false, error, code? }
export async function createPaymentLink({
  projectId,
  leaseId,
  tenantId,
  amount,
  method,
  payerEmail,
  description,
  createdBy = null,
  baseUrl,
  sendEmail = false,
} = {}) {
  if (!isStripeConfigured()) return STRIPE_NOT_CONFIGURED;
  const admin = adminClient();
  if (!admin) return fail("SUPABASE_SERVICE_ROLE_KEY is not configured.", { code: "admin_not_configured" });
  const ctx = await loadPaymentContext(admin, { projectId, leaseId, tenantId });
  if (!ctx.ok) return fail(ctx.error);
  const amt = round2(amount);
  const gate = assessPayment(ctx, { amount: amt, method });
  if (!gate.ok) return fail(gate.error, { code: "policy" });
  const choice = chooseMethods(ctx, method, amt);
  if (!choice.ok) return choice;

  const payer = payerOf(ctx, payerEmail);
  const token = randomBytes(24).toString("base64url");
  const fee = round2(choice.fee);
  const label = description || `Payment · ${ctx.lease.name || ctx.lease.unit || "Lease"}`;
  try {
    const { data: row, error } = await admin
      .from("online_payments")
      .insert({
        project_id: ctx.projectId,
        lease_id: leaseId,
        tenant_id: ctx.tenant?.id || null,
        property_id: ctx.lease.property_id || null,
        unit_id: ctx.lease.unit_id || null,
        description: label,
        payer_name: payer.name,
        payer_email: payer.email || null,
        source: "staff_link",
        method: method || (choice.methods.length === 1 ? choice.methods[0] : null),
        status: "link_sent",
        amount: amt,
        convenience_fee: fee,
        total: round2(amt + fee),
        link_token: token,
        link_expires_at: new Date(Date.now() + LINK_DAYS * 86400000).toISOString(),
        created_by: createdBy,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const url = paymentLinkUrl(baseUrl, token);

    let emailed = false;
    if (sendEmail && payer.email) {
      const res = await sendNotificationEmail({
        projectId: ctx.projectId,
        notification: "message",
        to: payer.email,
        db: admin,
        subject: `Payment request — $${round2(amt + fee).toFixed(2)}`,
        data: {
          recipientName: String(payer.name || "").split(" ")[0] || "there",
          subject: "Payment request",
          body: `${label}: $${amt.toFixed(2)}${fee > 0 ? ` plus a $${fee.toFixed(2)} convenience fee` : ""}. Use the button below to pay securely by ${choice.methods.map((m) => ONLINE_METHODS[m].label.toLowerCase()).join(" or ")}. This link stays open for ${LINK_DAYS} days.`,
          ctaUrl: url,
        },
      });
      emailed = Boolean(res?.ok);
    }
    return { ok: true, url, paymentId: row.id, amount: amt, fee, emailed };
  } catch (e) {
    console.error("[payments.link]", e);
    return fail("Couldn't create the payment link.");
  }
}

// Resolve a link token → Checkout URL (re-checking policies at click time).
// → { ok, url } | { ok:false, error, paid? }
export async function openPaymentLink(token, { baseUrl } = {}) {
  if (!isStripeConfigured()) return STRIPE_NOT_CONFIGURED;
  const admin = adminClient();
  if (!admin || !token) return fail("This payment link isn't valid.");
  const { data: row } = await admin
    .from("online_payments")
    .select("*")
    .eq("link_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return fail("This payment link isn't valid.");
  if (["succeeded", "processing", "partially_refunded", "refunded"].includes(row.status)) {
    return fail("This payment has already been made. Thank you!", { paid: true });
  }
  if (row.status === "canceled") return fail("This payment link was canceled.");
  if (row.link_expires_at && Date.parse(row.link_expires_at) < Date.now()) return fail("This payment link has expired. Ask the office for a new one.");
  const back = paymentLinkUrl(baseUrl, token);
  return createPaymentCheckout({
    projectId: row.project_id,
    leaseId: row.lease_id,
    tenantId: row.tenant_id,
    amount: row.amount,
    payerEmail: row.payer_email,
    description: row.description,
    method: row.method || undefined,
    successUrl: `${back}?result=success`,
    cancelUrl: `${back}?result=canceled`,
    source: "staff_link",
    paymentId: row.id,
  });
}

// Cancel an unpaid link / pending checkout row (staff).
export async function cancelPaymentLink({ projectId, paymentId }) {
  const admin = adminClient();
  if (!admin) return fail("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const { data: row } = await admin.from("online_payments").select("*").eq("id", paymentId).maybeSingle();
  if (!row || (projectId && row.project_id !== projectId)) return fail("Payment not found.");
  if (!["link_sent", "pending"].includes(row.status)) return fail("Only unpaid links can be canceled.");
  try {
    if (row.stripe_session_id && isStripeConfigured()) {
      await getStripe().checkout.sessions.expire(row.stripe_session_id).catch(() => null);
    }
    await updatePayment(admin, row.id, { status: "canceled", link_token: null });
    return { ok: true };
  } catch (e) {
    console.error("[payments.cancelLink]", e);
    return fail("Couldn't cancel the link.");
  }
}
