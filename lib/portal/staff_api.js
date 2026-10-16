"use client";

import { toast } from "sonner";

import { callApi } from "@/lib/messaging/api";

// Staff-side portal access calls (tenant / owner / vendor editors). Resolve
// { ok, emailed, emailError, portalEnabled, loginUrl } | { ok:false, error }.

export const invitePortalAccess = ({ partyType, partyId, email }) =>
  callApi("/api/portal/staff/access", { body: { action: "invite", partyType, partyId, email } });

export const disablePortalAccess = ({ partyType, partyId }) =>
  callApi("/api/portal/staff/access", { body: { action: "disable", partyType, partyId } });

// One toast-ready sentence describing an invite result.
export function inviteOutcome(res, email) {
  if (!res?.ok) return { level: "error", message: res?.error || "Couldn't send the invite." };
  const off = res.portalEnabled ? "" : " The portal is switched off — turn it on in Settings → Branding & Portals.";
  if (res.emailed) return { level: off ? "warning" : "success", message: `Invite emailed to ${email}.${off}` };
  const why =
    res.emailError === "not_configured"
      ? "email delivery isn't configured (GEIGER_EMAIL_API_KEY) — the sign-in link is copied, share it with them"
      : "the email couldn't be sent";
  return { level: "warning", message: `Access granted to ${email}, but ${why}.${off}` };
}

// Toast the invite result; when no email went out, copy the sign-in link for staff to share.
export function announceInvite(res, email) {
  const out = inviteOutcome(res, email);
  if (res?.ok && !res.emailed && res.loginUrl) navigator.clipboard?.writeText(res.loginUrl)?.catch(() => {});
  toast[out.level](out.message);
  return Boolean(res?.ok);
}

// Public portal address shown to staff (basePath-aware).
export const portalAddress = () =>
  typeof window === "undefined" ? "/portal" : `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}/portal`;
