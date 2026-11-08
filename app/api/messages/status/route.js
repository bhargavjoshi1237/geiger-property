import { isAdminConfigured } from "@/lib/supabase/admin";
import { isEmailConfigured } from "@/lib/email/notifications";
import { jsonError, requireStaff } from "@/lib/auth/staff";

// GET — staff who can open Settings → Notifications: which delivery integrations are configured (booleans only).

export async function GET(request) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const auth = await requireStaff(request, projectId, { permission: "property.notifications.view" });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  return Response.json({
    ok: true,
    email: isEmailConfigured(),
    sms: false,
    serviceRole: isAdminConfigured(),
    scheduler: Boolean(process.env.CRON_SECRET),
    inboundWebhook: Boolean(process.env.INBOUND_EMAIL_SECRET),
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
  });
}
