"use client";

import { callApi } from "@/lib/messaging/api";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";

// Browser helpers for the staff payment routes (/api/payments/*). Resolve
// { ok:false, error, code? } instead of throwing; screens own the toasts.
// code "stripe_not_configured" means the Stripe keys aren't set yet.

const PLAYGROUND = { ok: false, code: "sandbox", error: "Online payments aren't available in the playground." };

const call = (path, opts) => (isSandbox() ? Promise.resolve(PLAYGROUND) : callApi(path, opts));

export const getPaymentsStatus = () => call("/api/payments/status", { method: "GET" });

// { leaseId, tenantId?, amount? } → balance, methods, fees, allowed/reason, autopay.
export const getLeasePaymentOptions = (body) => call("/api/payments/options", { body });

// { leaseId, tenantId?, amount, method?, payerEmail?, description?, sendEmail? } → { url, paymentId, emailed }
export const createPaymentLinkApi = (body) => call("/api/payments/checkout", { body: { ...body, mode: "link" } });

// Take a payment now: opens Stripe Checkout, returning to the current page.
export const startStaffCheckout = (body) =>
  call("/api/payments/checkout", { body: { ...body, mode: "checkout", returnUrl: window.location.href } });

export const refundOnlinePayment = (body) => call("/api/payments/refund", { body });
export const cancelOnlinePayment = (paymentId) => call("/api/payments/cancel", { body: { paymentId } });
export const syncOnlinePayment = (paymentId) => call("/api/payments/sync", { body: { paymentId } });

// Autopay: action "status" | "link" | "enroll" | "cancel".
export const autopayAction = (action, body) =>
  call("/api/payments/autopay", {
    body: { ...body, action, ...(action === "enroll" ? { returnUrl: window.location.href } : {}) },
  });
