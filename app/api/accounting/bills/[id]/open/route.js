import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { openDraftBill } from "@/lib/accounting/bills_server";

// POST — open a draft bill: approval limit, default GL, AP post unless it waits for approval (CORE-09). Body: { projectId }

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId } = await readJson(request);
  const auth = await requireStaff(request, projectId, { permission: "property.accounting.post", denied: "Your role can't open bills." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const admin = auth.admin;
  if (!admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so bills can't be opened.");
  try {
    return Response.json(await openDraftBill(admin, { projectId, billId: id, actor: auth.user }));
  } catch (e) {
    return jsonError(400, e?.message || "Couldn't open the bill.");
  }
}
