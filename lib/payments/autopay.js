import { randomBytes } from "node:crypto";

import { adminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/ledger/postings";
import { sendNotificationEmail } from "@/lib/email/notifications";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { ONLINE_METHODS } from "./constants";
import { assessPayment, loadPaymentContext, payerOf, quoteFees } from "./context";
import { findOrCreateCustomer } from "./customers";
import { handlePaymentFailure, syncPaymentIntent } from "./fulfill";
import { logPaymentActivity } from "./posting";
import { STRIPE_NOT_CONFIGURED, paymentLinkUrl } from "./checkout";

// Server-only autopay: enroll a lease (Stripe Checkout in setup mode saves a card
// or bank account to the tenant's customer), cancel, read status, and charge a
// plan off-session for the open balance (used by the `autopay` job). Never throws.

const LIVE = ["pending_setup", "active", "paused"];
const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
const isHttpUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || ""));
const iso = (d) => d.toISOString().slice(0, 10);

function dueDateIn(today, day) {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${today.slice(0, 7)}-${String(Math.min(Math.max(1, Number(day) || 1), last)).padStart(2, "0")}`;
}

function nextMonth(today) {
  const [y, m] = today.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m, 1)));
}

const chargeDayOf = (plan, ctx) =>
  Number(plan.charge_day) || (Number(ctx.policies.rentDueDay) || 1) + (Number(ctx.settings.autopayDayOffset) || 0);

// Live (pending / active / paused) plan for a lease.
async function livePlan(admin, leaseId) {
  const { data } = await admin
    .from("autopay_plans")
    .select("*")
    .eq("lease_id", leaseId)
    .in("status", LIVE)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] || null;
}

// Start (or restart) enrollment → Checkout in setup mode.
// enrollAutopay({ projectId, leaseId, tenantId, payerEmail, returnUrl, method?, amountMode?,
//   fixedAmount?, maxAmount?, chargeDay?, createdBy?, planId? })
// → { ok, url, sessionId, planId } | { ok:false, error, code? }
// returnUrl gets `session_id={CHECKOUT_SESSION_ID}` (success) or `autopay=canceled`.
export async function enrollAutopay({
  projectId,
  leaseId,
  tenantId,
  payerEmail,
  returnUrl,
  method,
  amountMode = "balance",
  fixedAmount = null,
  maxAmount = null,
  chargeDay = null,
  createdBy = null,
  planId = null,
} = {}) {
  if (!isStripeConfigured()) return STRIPE_NOT_CONFIGURED;
  const admin = adminClient();
  if (!admin) return fail("SUPABASE_SERVICE_ROLE_KEY is not configured.", { code: "admin_not_configured" });
  if (!isHttpUrl(returnUrl)) return fail("returnUrl must be an absolute URL.");
  if (method && !ONLINE_METHODS[method]) return fail(`Unknown payment method "${method}".`);
  const ctx = await loadPaymentContext(admin, { projectId, leaseId, tenantId });
  if (!ctx.ok) return fail(ctx.error);
  if (ctx.settings.autopayEnabled === false) return fail("Autopay is turned off.", { code: "policy" });
  const gate = assessPayment(ctx, { method, setupOnly: true });
  if (!gate.ok) return fail(gate.error, { code: "policy" });
  if (amountMode === "fixed" && !(round2(fixedAmount) > 0)) return fail("Enter the fixed autopay amount.");

  const payer = payerOf(ctx, payerEmail);
  const methods = method ? [method] : ctx.methods;
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
      name: `Autopay · ${ctx.lease.name || ctx.lease.unit || "Lease"}`,
      payer_email: payer.email || null,
      amount_mode: amountMode === "fixed" ? "fixed" : "balance",
      fixed_amount: amountMode === "fixed" ? round2(fixedAmount) : null,
      max_amount: round2(maxAmount) > 0 ? round2(maxAmount) : null,
      charge_day: Number(chargeDay) >= 1 && Number(chargeDay) <= 28 ? Number(chargeDay) : null,
      stripe_customer_id: customer,
    };
    let plan = planId ? (await admin.from("autopay_plans").select("*").eq("id", planId).maybeSingle()).data : null;
    if (!plan) {
      const existing = await livePlan(admin, leaseId);
      plan = existing?.status === "pending_setup" ? existing : null;
    }
    if (plan) {
      const { data, error } = await admin.from("autopay_plans").update(fields).eq("id", plan.id).select("*").single();
      if (error) throw new Error(error.message);
      plan = data;
    } else {
      const { data, error } = await admin
        .from("autopay_plans")
        .insert({ ...fields, status: "pending_setup", created_by: createdBy })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      plan = data;
    }

    const metadata = {
      app: "geiger-property",
      kind: "autopay_setup",
      planId: plan.id,
      projectId: ctx.projectId || "",
      leaseId,
      tenantId: ctx.tenant?.id || "",
    };
    const types = methods.map((m) => ONLINE_METHODS[m].stripeType);
    const sep = returnUrl.includes("?") ? "&" : "?";
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      currency: "usd",
      customer,
      client_reference_id: plan.id,
      payment_method_types: types,
      success_url: `${returnUrl}${sep}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}${sep}autopay=canceled`,
      metadata,
      setup_intent_data: { metadata, description: plan.name },
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
    await admin.from("autopay_plans").update({ setup_session_id: session.id }).eq("id", plan.id);
    return { ok: true, url: session.url, sessionId: session.id, planId: plan.id };
  } catch (e) {
    console.error("[payments.autopay.enroll]", e);
    return fail(e?.raw?.message || "Couldn't start autopay setup.", { code: "stripe_error" });
  }
}

// Staff: an emailed enrollment link (long-lived; opens a fresh setup Checkout).
// createAutopayLink({ projectId, leaseId, tenantId?, payerEmail?, amountMode?, fixedAmount?,
//   maxAmount?, chargeDay?, createdBy?, baseUrl, sendEmail? }) → { ok, url, planId, emailed }
export async function createAutopayLink({ baseUrl, sendEmail = false, ...input } = {}) {
  if (!isStripeConfigured()) return STRIPE_NOT_CONFIGURED;
  const admin = adminClient();
  if (!admin) return fail("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const ctx = await loadPaymentContext(admin, input);
  if (!ctx.ok) return fail(ctx.error);
  if (ctx.settings.autopayEnabled === false) return fail("Autopay is turned off.", { code: "policy" });
  const gate = assessPayment(ctx, { setupOnly: true });
  if (!gate.ok) return fail(gate.error, { code: "policy" });
  const payer = payerOf(ctx, input.payerEmail);
  const token = randomBytes(24).toString("base64url");
  const existing = await livePlan(admin, input.leaseId);
  const fields = {
    project_id: ctx.projectId,
    lease_id: input.leaseId,
    tenant_id: ctx.tenant?.id || null,
    property_id: ctx.lease.property_id || null,
    unit_id: ctx.lease.unit_id || null,
    name: `Autopay · ${ctx.lease.name || ctx.lease.unit || "Lease"}`,
    payer_email: payer.email || null,
    amount_mode: input.amountMode === "fixed" ? "fixed" : "balance",
    fixed_amount: input.amountMode === "fixed" ? round2(input.fixedAmount) : null,
    max_amount: round2(input.maxAmount) > 0 ? round2(input.maxAmount) : null,
    charge_day: Number(input.chargeDay) >= 1 && Number(input.chargeDay) <= 28 ? Number(input.chargeDay) : null,
    link_token: token,
  };
  const q = existing?.status === "pending_setup"
    ? admin.from("autopay_plans").update(fields).eq("id", existing.id)
    : admin.from("autopay_plans").insert({ ...fields, status: "pending_setup", created_by: input.createdBy || null });
  const { data: plan, error } = await q.select("*").single();
  if (error) {
    console.error("[payments.autopay.link]", error.message);
    return fail("Couldn't create the autopay link.");
  }
  const url = paymentLinkUrl(baseUrl, token);
  let emailed = false;
  if (sendEmail && payer.email) {
    const res = await sendNotificationEmail({
      projectId: ctx.projectId,
      notification: "message",
      to: payer.email,
      db: admin,
      subject: "Set up autopay for rent",
      data: {
        recipientName: String(payer.name || "").split(" ")[0] || "there",
        subject: "Set up autopay",
        body: "Save a card or bank account and rent will be paid automatically on the due day each month. You can turn autopay off any time by contacting the office.",
        ctaUrl: url,
      },
    });
    emailed = Boolean(res?.ok);
  }
  return { ok: true, url, planId: plan.id, emailed };
}

// Resolve an autopay link token → setup Checkout URL. → { ok, url } | { ok:false, error, done? } | null (not an autopay token)
export async function openAutopayLink(token, { baseUrl } = {}) {
  const admin = adminClient();
  if (!admin || !token) return null;
  const { data: plan } = await admin.from("autopay_plans").select("*").eq("link_token", token).is("deleted_at", null).maybeSingle();
  if (!plan) return null;
  if (plan.status === "active") return fail("Autopay is already set up. Thank you!", { done: true });
  if (plan.status !== "pending_setup") return fail("This autopay link is no longer active.");
  const back = paymentLinkUrl(baseUrl, token);
  return enrollAutopay({
    projectId: plan.project_id,
    leaseId: plan.lease_id,
    tenantId: plan.tenant_id,
    payerEmail: plan.payer_email,
    returnUrl: back,
    amountMode: plan.amount_mode,
    fixedAmount: plan.fixed_amount,
    maxAmount: plan.max_amount,
    chargeDay: plan.charge_day,
    planId: plan.id,
  });
}

// cancelAutopay({ projectId, leaseId, planId?, actorName? }) → { ok, canceled } | { ok:false, error }
export async function cancelAutopay({ projectId, leaseId, planId = null, actorName = "" } = {}) {
  const admin = adminClient();
  if (!admin) return fail("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  if (!leaseId && !planId) return fail("A lease is required.");
  let q = admin.from("autopay_plans").select("*").in("status", LIVE).is("deleted_at", null);
  q = planId ? q.eq("id", planId) : q.eq("lease_id", leaseId);
  const { data: plans, error } = await q;
  if (error) return fail("Couldn't read autopay.");
  const mine = (plans || []).filter((p) => !projectId || !p.project_id || p.project_id === projectId);
  if (!mine.length) return { ok: true, canceled: 0 };
  const now = new Date().toISOString();
  const { error: e2 } = await admin
    .from("autopay_plans")
    .update({ status: "canceled", canceled_at: now, link_token: null })
    .in("id", mine.map((p) => p.id));
  if (e2) return fail("Couldn't cancel autopay.");
  const lease = leaseId || mine[0].lease_id;
  if (lease) await admin.from("rent_accounts").update({ autopay: false }).eq("lease_id", lease).is("deleted_at", null);
  await logPaymentActivity(admin, mine[0], "autopay", `Autopay turned off${actorName ? ` by ${actorName}` : ""}`, { autopayPlanId: mine[0].id });
  return { ok: true, canceled: mine.length };
}

const planView = (p) =>
  p && {
    id: p.id,
    status: p.status,
    method: p.method || "",
    methodLabel: p.method_label || "",
    amountMode: p.amount_mode,
    fixedAmount: p.fixed_amount === null ? null : Number(p.fixed_amount),
    maxAmount: p.max_amount === null ? null : Number(p.max_amount),
    chargeDay: p.charge_day,
    payerEmail: p.payer_email || "",
    lastRunOn: p.last_run_on,
    lastStatus: p.last_status || "",
    lastError: p.last_error || "",
    failureCount: Number(p.failure_count) || 0,
    activatedAt: p.activated_at,
  };

// getAutopayStatus({ projectId, leaseId, tenantId? })
// → { ok, stripeConfigured, enrolled, plan: {…, nextChargeOn} | null, allowed, reason }
export async function getAutopayStatus({ projectId, leaseId, tenantId } = {}) {
  const admin = adminClient();
  const ctx = await loadPaymentContext(admin, { projectId, leaseId, tenantId });
  if (!ctx.ok) return fail(ctx.error);
  const plan = await livePlan(admin, leaseId);
  const gate = assessPayment(ctx, { setupOnly: true });
  let nextChargeOn = null;
  if (plan?.status === "active") {
    const today = iso(new Date());
    const thisMonth = dueDateIn(today, chargeDayOf(plan, ctx));
    nextChargeOn = plan.last_run_period === today.slice(0, 7) || thisMonth < today
      ? dueDateIn(nextMonth(today), chargeDayOf(plan, ctx))
      : thisMonth;
  }
  return {
    ok: true,
    stripeConfigured: isStripeConfigured(),
    enabled: ctx.settings.autopayEnabled !== false,
    required: Boolean(ctx.policies.autopayRequired),
    enrolled: plan?.status === "active",
    plan: plan ? { ...planView(plan), nextChargeOn } : null,
    allowed: gate.ok,
    reason: gate.ok ? "" : gate.error,
  };
}

// Charge one active plan for `now`'s period (autopay job).
// → "created" | "skipped" | "failed" (+ message); idempotent per plan + month.
export async function chargeAutopayPlan(admin, plan, { now = new Date() } = {}) {
  const today = iso(now);
  const period = today.slice(0, 7);
  if (plan.status !== "active" || !plan.stripe_payment_method_id || !plan.stripe_customer_id) return { result: "skipped" };
  if (plan.last_run_period === period) return { result: "skipped" };
  const ctx = await loadPaymentContext(admin, { projectId: plan.project_id, leaseId: plan.lease_id, tenantId: plan.tenant_id });
  if (!ctx.ok) return { result: "failed", message: ctx.error };
  if (ctx.settings.autopayEnabled === false) return { result: "skipped" };
  if (today < dueDateIn(today, chargeDayOf(plan, ctx))) return { result: "skipped" };

  const markRun = (patch) =>
    admin.from("autopay_plans").update({ last_run_on: today, last_run_period: period, ...patch }).eq("id", plan.id);

  let amount = plan.amount_mode === "fixed" ? round2(plan.fixed_amount) : round2(ctx.balance);
  if (round2(plan.max_amount) > 0) amount = Math.min(amount, round2(plan.max_amount));
  if (!(amount > 0)) {
    await markRun({ last_status: "nothing_due", last_error: null });
    return { result: "skipped" };
  }
  const gate = assessPayment(ctx, { amount, method: plan.method || undefined });
  if (!gate.ok) {
    await markRun({ last_status: "blocked", last_error: gate.error });
    return { result: "skipped", message: gate.error };
  }

  const key = `autopay:${plan.id}:${period}`;
  const { data: dup } = await admin.from("online_payments").select("id").eq("idempotency_key", key).limit(1);
  if (dup?.length) {
    await markRun({});
    return { result: "skipped" };
  }
  const fee = round2(quoteFees(ctx, amount)[plan.method] || 0);
  const total = round2(amount + fee);
  const payer = payerOf(ctx, plan.payer_email);
  const { data: row, error } = await admin
    .from("online_payments")
    .insert({
      project_id: ctx.projectId,
      lease_id: plan.lease_id,
      tenant_id: plan.tenant_id || ctx.tenant?.id || null,
      property_id: ctx.lease.property_id || null,
      unit_id: ctx.lease.unit_id || null,
      autopay_plan_id: plan.id,
      description: `Autopay · ${period}`,
      payer_name: payer.name,
      payer_email: payer.email || null,
      source: "autopay",
      method: plan.method || null,
      method_label: plan.method_label || null,
      status: "pending",
      amount,
      convenience_fee: fee,
      total,
      stripe_customer_id: plan.stripe_customer_id,
      stripe_payment_method_id: plan.stripe_payment_method_id,
      idempotency_key: key,
    })
    .select("*")
    .single();
  if (error) return { result: "failed", message: error.message };
  await markRun({ last_status: "charging", last_error: null });

  const stripeType = ONLINE_METHODS[plan.method]?.stripeType || "card";
  let pi = null;
  try {
    pi = await getStripe().paymentIntents.create(
      {
        amount: Math.round(total * 100),
        currency: "usd",
        customer: plan.stripe_customer_id,
        payment_method: plan.stripe_payment_method_id,
        payment_method_types: [stripeType],
        off_session: true,
        confirm: true,
        description: `Autopay · ${ctx.lease.name || "Lease"} · ${period}`,
        metadata: {
          app: "geiger-property",
          kind: "autopay_charge",
          paymentId: row.id,
          planId: plan.id,
          projectId: ctx.projectId || "",
          leaseId: plan.lease_id,
          tenantId: row.tenant_id || "",
          amount: String(amount),
          fee: String(fee),
          source: "autopay",
        },
      },
      { idempotencyKey: key },
    );
  } catch (e) {
    pi = e?.raw?.payment_intent || null;
    if (!pi) {
      await handlePaymentFailure(admin, row, { kind: "failed", reason: e?.raw?.message || e.message });
      return { result: "failed", message: `autopay ${plan.id}: ${e?.raw?.message || e.message}` };
    }
  }
  const res = await syncPaymentIntent(admin, pi.id, { row });
  if (res.status === "failed") return { result: "failed", message: `autopay ${plan.id}: ${res.error || "declined"}` };
  return { result: "created" };
}
