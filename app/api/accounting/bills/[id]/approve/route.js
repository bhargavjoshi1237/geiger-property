import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { adminClient } from "@/lib/supabase/admin";
import { staffCan } from "@/lib/auth/permissions";
import { approveBill } from "@/lib/accounting/bills_server";

// POST — approve a pending bill and post it to AP once (CORE-09). Body: { projectId, note? }

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, note } = await readJson(request);
  if (!projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = adminClient({ source: "app", actor: auth.user });
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so bills can't be approved.");
  if (!(await staffCan(auth, "property.accounting.post"))) return jsonError(403, "Approving a bill posts it to payables, which your role can't do.");
  try {
    return Response.json(await approveBill(admin, { projectId, billId: id, actor: auth.user, note: String(note || "") }));
  } catch (e) {
    return jsonError(400, e?.message || "Couldn't approve the bill.");
  }
}
