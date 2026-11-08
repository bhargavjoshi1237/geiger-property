import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { billingError } from "@/lib/billing/http";
import { sendStatements } from "@/lib/billing/statements";

// POST — email resident statements for a month (CORE-12): body { projectId, leaseIds | view (all | owing | credit), period?, dryRun?, resend? }.
// Each lease, month and address sends once (resend adds a fresh key); paper preferences come back as printLeaseIds; nothing posts.

export const maxDuration = 300;

export async function POST(request) {
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: ["property.rent.manage", "property.accounting.view"], denied: "Your role can't send resident statements." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so statements can't send.");
  try {
    const leaseIds = Array.isArray(body.leaseIds) ? body.leaseIds.map(String) : null;
    if (!leaseIds?.length && !["all", "owing", "credit"].includes(body.view)) return jsonError(400, "Pick the leases or a view (all, owing or credit).");
    const res = await sendStatements(auth.admin, {
      projectId: body.projectId,
      leaseIds,
      view: body.view,
      period: body.period || "",
      dryRun: body.dryRun === true,
      resend: body.resend === true,
      actor: auth.user,
      origin: request.nextUrl.origin,
    });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return billingError(e, "Couldn't send the statements.");
  }
}
