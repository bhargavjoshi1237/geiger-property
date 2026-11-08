import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { adminClient } from "@/lib/supabase/admin";
import { staffCan } from "@/lib/auth/permissions";
import { openDraftBill } from "@/lib/accounting/bills_server";

// POST — open a draft bill: approval limit, default GL, AP post unless it waits for approval (CORE-09). Body: { projectId }

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId } = await readJson(request);
  if (!projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = adminClient({ source: "app", actor: auth.user });
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so bills can't be opened.");
  if (!(await staffCan(auth, "property.accounting.post"))) return jsonError(403, "Your role can't open bills.");
  try {
    return Response.json(await openDraftBill(admin, { projectId, billId: id, actor: auth.user }));
  } catch (e) {
    return jsonError(400, e?.message || "Couldn't open the bill.");
  }
}
