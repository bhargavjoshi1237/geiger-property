import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { billingError, entryView } from "@/lib/billing/http";
import { reviseFinalAccount } from "@/lib/billing/move_out";

// POST — revise a committed final account from its deposit (CORE-13): voids the version's entries and its unpaid refund bill, then
// commits v<n+1>. Refused once the refund is paid. Body { projectId, version, charges, accelerate, refundMethod, email?, sendEmail? }.

export const maxDuration = 120;

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: ["property.accounting.post", "property.accounting.void"], denied: "Revising a final account voids and reposts ledger entries, which your role can't do." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so billing can't run.");
  try {
    const res = await reviseFinalAccount(
      auth.admin,
      id,
      {
        projectId: body.projectId,
        version: body.version,
        charges: Array.isArray(body.charges) ? body.charges : undefined,
        accelerate: body.accelerate && typeof body.accelerate === "object" ? body.accelerate : undefined,
        refundMethod: typeof body.refundMethod === "string" ? body.refundMethod.slice(0, 40) : "",
        email: typeof body.email === "string" ? body.email.slice(0, 200) : undefined,
        sendEmail: body.sendEmail !== false,
        earlyTermFee: body.earlyTermFee !== false,
        settlement: body.settlement === "plan" ? "plan" : "open",
      },
      { actor: auth.user },
    );
    return Response.json({ ok: true, ...res, entries: entryView(res.entries) });
  } catch (e) {
    return billingError(e, "Couldn't revise the final account.");
  }
}
