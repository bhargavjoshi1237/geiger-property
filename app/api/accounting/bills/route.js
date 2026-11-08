import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { createBill } from "@/lib/accounting/bills_server";

// POST — create a vendor bill (CORE-09): approval limit, default GL, AP post; body { projectId, name, amount, workOrderId, ... }.

export async function POST(request) {
  const { projectId, ...input } = await readJson(request);
  const auth = await requireStaff(request, projectId, { permission: "property.accounting.post", denied: "Your role can't create bills." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = auth.admin;
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so bills can't be created.");
  try {
    const res = await createBill(admin, { ...input, projectId }, auth.user);
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return jsonError(400, e?.message || "Couldn't create the bill.");
  }
}
