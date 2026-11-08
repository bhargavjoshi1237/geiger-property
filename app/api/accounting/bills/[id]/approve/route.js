import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { approveBill } from "@/lib/accounting/bills_server";

// POST — approve a pending bill and post it to AP once (CORE-09). Body: { projectId, note? }

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, note } = await readJson(request);
  const auth = await requireStaff(request, projectId, { permission: "property.accounting.post", denied: "Approving a bill posts it to payables, which your role can't do." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = auth.admin;
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so bills can't be approved.");
  try {
    return Response.json(await approveBill(admin, { projectId, billId: id, actor: auth.user, note: String(note || "") }));
  } catch (e) {
    return jsonError(400, e?.message || "Couldn't approve the bill.");
  }
}
