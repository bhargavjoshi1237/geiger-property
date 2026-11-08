import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { postApprovedBill } from "@/lib/accounting/bills_server";

// POST — post an approved, open bill that isn't in AP yet (CORE-09); idempotent on `bill:<id>`. Body: { projectId }

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId } = await readJson(request);
  const auth = await requireStaff(request, projectId, { permission: "property.accounting.post", denied: "Your role can't post bills to payables." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = auth.admin;
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so bills can't be posted.");
  try {
    return Response.json(await postApprovedBill(admin, { projectId, billId: id, actor: auth.user }));
  } catch (e) {
    return jsonError(400, e?.message || "Couldn't post the bill.");
  }
}
