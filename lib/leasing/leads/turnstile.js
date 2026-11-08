import "server-only";

// Cloudflare Turnstile server check (LEAS-02) for the public inquiry form. TURNSTILE_SECRET_KEY is server-only; the
// widget's NEXT_PUBLIC_TURNSTILE_SITE_KEY is public. Cloudflare's test keys (always pass: 1x0000000000000000000000000000000AA)
// work in development. Tokens are single-use and expire after 5 minutes, so the form verifies once, after validation.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileConfigured = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

// verifyTurnstile(token, { ip }) → { ok, reason: "missing_token" | "not_configured" | "failed" | "unreachable", codes? }.
export async function verifyTurnstile(token, { ip, secret = process.env.TURNSTILE_SECRET_KEY, fetchImpl = fetch } = {}) {
  const response = String(token || "").trim();
  if (!response || response.length > 2048) return { ok: false, reason: "missing_token" };
  if (!secret) return { ok: false, reason: "not_configured" };
  try {
    const form = new URLSearchParams({ secret, response });
    if (ip) form.set("remoteip", ip);
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } });
    const json = await res.json().catch(() => ({}));
    if (json?.success === true) return { ok: true, hostname: json.hostname || null };
    return { ok: false, reason: "failed", codes: Array.isArray(json?.["error-codes"]) ? json["error-codes"] : [] };
  } catch (e) {
    console.error("[leads.turnstile]", e?.message || e);
    return { ok: false, reason: "unreachable" };
  }
}
