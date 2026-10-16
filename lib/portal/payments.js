import { createPaymentCheckout, getPaymentOptions } from "@/lib/payments/checkout";
import { cancelAutopay, enrollAutopay, getAutopayStatus } from "@/lib/payments/autopay";

// Server-only bridge from the resident portal to the online-payments library
// (lib/payments/*, owned by the payments area). The portal only ever passes the
// session's own tenant + lease; the library applies every policy gate.

const NO_LEASE = { ok: false, error: "You don't have a lease to pay against yet." };

const leaseLabel = (rc) => [rc.property?.name, rc.unit?.label].filter(Boolean).join(" ") || rc.lease?.name || "Lease";

export async function paymentOptions(ctx, rc, amount) {
  if (!rc.lease) return NO_LEASE;
  return getPaymentOptions({ projectId: ctx.projectId, leaseId: rc.lease.id, tenantId: ctx.party.id, amount });
}

export async function startCheckout(ctx, rc, { amount, method, savePaymentMethod, baseUrl }) {
  if (!rc.lease) return NO_LEASE;
  return createPaymentCheckout({
    projectId: ctx.projectId,
    leaseId: rc.lease.id,
    tenantId: ctx.party.id,
    amount,
    method: method || undefined,
    payerEmail: ctx.party.email || ctx.member.email,
    description: `Rent payment · ${leaseLabel(rc)}`,
    successUrl: `${baseUrl}/portal?tab=payments&payment=success`,
    cancelUrl: `${baseUrl}/portal?tab=payments&payment=canceled`,
    savePaymentMethod: Boolean(savePaymentMethod),
    source: "portal",
    createdBy: ctx.user.id,
  });
}

export async function autopayStatus(ctx, rc) {
  if (!rc.lease) return null;
  const res = await getAutopayStatus({ projectId: ctx.projectId, leaseId: rc.lease.id, tenantId: ctx.party.id });
  return res?.ok ? res : null;
}

export async function startAutopay(ctx, rc, { baseUrl }) {
  if (!rc.lease) return NO_LEASE;
  return enrollAutopay({
    projectId: ctx.projectId,
    leaseId: rc.lease.id,
    tenantId: ctx.party.id,
    payerEmail: ctx.party.email || ctx.member.email,
    returnUrl: `${baseUrl}/portal?tab=payments&autopay=setup`,
    createdBy: ctx.user.id,
  });
}

export async function stopAutopay(ctx, rc) {
  if (!rc.lease) return NO_LEASE;
  return cancelAutopay({ projectId: ctx.projectId, leaseId: rc.lease.id, actorName: ctx.actorName });
}

export const autopayAvailable = true;
