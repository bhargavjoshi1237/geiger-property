import { checkPortalEmail, isEmail, normalizeEmail, sendSignInEmail } from "@/lib/portal/auth";
import { portalError, portalJson, readBody } from "@/lib/portal/http";

// POST { email } — email a magic link + one-time code to a portal member.
export async function POST(request) {
  const { email } = await readBody(request);
  const clean = normalizeEmail(email);
  if (!isEmail(clean)) return portalError(400, "Enter a valid email address.");
  const allowed = await checkPortalEmail(clean);
  if (!allowed.ok) return portalError(allowed.status, allowed.error);
  const sent = await sendSignInEmail(request, clean);
  if (!sent.ok) return portalError(sent.status, sent.error);
  return portalJson({ sent: true });
}
