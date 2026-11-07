import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { adminClient } from "@/lib/supabase/admin";
import { staffCan } from "@/lib/orchestration/permissions";
import { createBill } from "@/lib/accounting/bills_server";

// POST — create a vendor bill (CORE-09): approval limit, default GL, AP post; body { projectId, name, amount, workOrderId, ... }.

export async function POST(request) {
  const { projectId, ...input } = await readJson(request);
  if (!projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = adminClient({ source: "app", actor: auth.user });
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so bills can't be created.");
  if (!(await staffCan(admin, auth, "accounting.post"))) return jsonError(403, "Your role can't create bills.");
  try {
    const res = await createBill(admin, { ...input, projectId }, auth.user);
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return jsonError(400, e?.message || "Couldn't create the bill.");
  }
}
