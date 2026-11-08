import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { billingError } from "@/lib/billing/http";
import { loadBatch, voidBatch } from "@/lib/ledger/conversion_server";

// POST — void a batch of opening balances before go-live (INTL-04): every entry reversed on its own date. Body { projectId }.

export async function POST(request, { params }) {
  const { batchId } = await params;
  const { projectId } = await readJson(request);
  const auth = await requireStaff(request, projectId, {
    permission: ["property.accounting.convert", "property.accounting.void"],
    denied: "Voiding opening balances needs both Post opening balances and Void ledger entries.",
  });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so billing can't run.");
  try {
    const batch = await loadBatch(auth.admin, projectId, batchId);
    const res = await voidBatch(auth.admin, batch, { actor: auth.user });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return billingError(e, "Couldn't void the opening balances.");
  }
}
