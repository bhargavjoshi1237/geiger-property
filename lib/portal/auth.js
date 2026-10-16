import { createClient as createServerClient } from "@/utils/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { rowsOf } from "./http";
import { loadPortalSettings, roleEnabled } from "./session";

// Server-only magic-link / email-code sign-in for the portals on the shared
// suite auth. Only emails with a live portal membership (in a project whose
// portal is switched on) get a sign-in email, so random addresses never create
// suite accounts.

export const normalizeEmail = (v) => String(v || "").trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => EMAIL_RE.test(normalizeEmail(v));

// { ok } when the email may sign in, else { ok:false, status, error }.
export async function checkPortalEmail(email) {
  const admin = adminClient();
  if (!admin) return { ok: false, status: 503, error: "The portal isn't configured on this server yet." };
  const members = (
    await rowsOf(admin.from("portal_members").select("*").eq("email", email).is("deleted_at", null), "auth.lookup")
  ).filter((m) => m.status !== "disabled");
  if (!members.length) {
    return {
      ok: false,
      status: 404,
      error: "We couldn't find portal access for that email. Ask your property manager to send you an invite.",
    };
  }
  const settings = await loadPortalSettings(admin, members.map((m) => m.project_id));
  if (!members.some((m) => roleEnabled(settings, m.project_id, m.role))) {
    return { ok: false, status: 403, error: "Your property manager hasn't switched this portal on yet." };
  }
  return { ok: true };
}

// The browser-facing origin + basePath the emailed link should return to.
export function portalBaseUrl(request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (configured) {
    const root = configured.replace(/\/+$/, "");
    return root.endsWith(basePath) ? root : `${root}${basePath}`;
  }
  const origin = request.headers.get("origin") || new URL(request.url).origin;
  return `${origin.replace(/\/+$/, "")}${basePath}`;
}

export async function sendSignInEmail(request, email) {
  try {
    const sb = await createServerClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${portalBaseUrl(request)}/portal/auth/callback` },
    });
    if (error) {
      console.error("[portal.auth.otp]", error.message);
      const limited = /rate|too many|security purposes/i.test(error.message);
      return {
        ok: false,
        status: limited ? 429 : 400,
        error: limited ? "Too many sign-in emails. Wait a minute and try again." : "We couldn't send the sign-in email.",
      };
    }
    return { ok: true };
  } catch (e) {
    console.error("[portal.auth.otp]", e);
    return { ok: false, status: 500, error: "We couldn't send the sign-in email." };
  }
}

export async function verifyEmailCode(email, token) {
  try {
    const sb = await createServerClient();
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) return { ok: false, status: 400, error: "That code is invalid or has expired." };
    return { ok: true };
  } catch (e) {
    console.error("[portal.auth.verify]", e);
    return { ok: false, status: 500, error: "We couldn't verify the code." };
  }
}

// Magic-link landing: PKCE ?code= or ?token_hash=&type=.
export async function completeEmailLink(searchParams) {
  try {
    const sb = await createServerClient();
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") || "magiclink";
    if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      return !error;
    }
    if (tokenHash) {
      const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
      return !error;
    }
    return false;
  } catch (e) {
    console.error("[portal.auth.callback]", e);
    return false;
  }
}

export async function signOutPortal() {
  try {
    const sb = await createServerClient();
    await sb.auth.signOut({ scope: "local" });
    return true;
  } catch (e) {
    console.error("[portal.auth.logout]", e);
    return false;
  }
}
