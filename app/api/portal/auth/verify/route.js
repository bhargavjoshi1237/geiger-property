import { isEmail, normalizeEmail, verifyEmailCode } from "@/lib/portal/auth";
import { portalError, portalJson, readBody } from "@/lib/portal/http";

// POST { email, token } — sign in with the emailed one-time code.
export async function POST(request) {
  const { email, token } = await readBody(request);
  const clean = normalizeEmail(email);
  const code = String(token || "").replace(/\s+/g, "");
  if (!isEmail(clean) || !/^\d{6,10}$/.test(code)) return portalError(400, "Enter the code from your email.");
  const res = await verifyEmailCode(clean, code);
  if (!res.ok) return portalError(res.status, res.error);
  return portalJson({ signedIn: true });
}
