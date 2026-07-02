// Reusable suite email client (server-only).
//
// geiger-dash is the "mother" project that owns the entire email stack —
// templates, rendering, Resend delivery, and the send log. Other suite apps
// (this one included) never bundle their own email setup; they POST to dash's
// cross-app API with a shared API key.
//
// This is the single outbound integration point. Any feature that needs to send
// a transactional email calls `sendSuiteEmail({ template, to, data })`; it never
// throws and never leaks the key to the browser (the key is a non-public env var
// and this module is only imported from server routes).
//
//   GEIGER_EMAIL_API_URL   base URL of the dash deployment (default below)
//   GEIGER_EMAIL_API_KEY   gk_live_… key minted in dash → /admin/emails

const DEFAULT_API_URL = "https://geiger.studio";

export async function sendSuiteEmail({ template, to, data = {}, subject } = {}) {
  const apiKey = process.env.GEIGER_EMAIL_API_KEY;
  const baseUrl = process.env.GEIGER_EMAIL_API_URL || DEFAULT_API_URL;

  if (!apiKey) {
    console.error("[email] GEIGER_EMAIL_API_KEY is not set — skipping send");
    return { ok: false, error: "not_configured" };
  }
  if (!template || !to) {
    return { ok: false, error: "template and to are required" };
  }

  try {
    const res = await fetch(`${baseUrl}/api/email/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ template, to, data, subject }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[email] send failed:", res.status, json?.error);
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }

    return { ok: true, id: json.id, providerId: json.providerId };
  } catch (err) {
    console.error("[email] send request error:", err);
    return { ok: false, error: "request_failed" };
  }
}
