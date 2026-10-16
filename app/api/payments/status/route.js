import { isAdminConfigured } from "@/lib/supabase/admin";
import { isEmailConfigured } from "@/lib/email/notifications";
import { jsonError, requireStaff } from "@/lib/messaging/auth";
import { stripeStatus } from "@/lib/stripe/server";
import { requestBase } from "@/lib/payments/http";

// GET — signed-in staff: is online payment collection wired up? (booleans only, no secrets)

export async function GET(request) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const auth = await requireStaff(request, projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  return Response.json({
    ok: true,
    stripe: stripeStatus(),
    serviceRole: isAdminConfigured(),
    email: isEmailConfigured(),
    scheduler: Boolean(process.env.CRON_SECRET),
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    webhookUrl: `${requestBase(request)}/api/stripe/webhook`,
  });
}
