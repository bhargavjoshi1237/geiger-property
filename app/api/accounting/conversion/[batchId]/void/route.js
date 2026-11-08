import { jsonError, readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError } from "@/lib/billing/http";
import { CONVERT_KEY } from "@/lib/ledger/conversion";
import { loadBatch, voidBatch } from "@/lib/ledger/conversion_server";

// POST — void a batch of opening balances before go-live (INTL-04): every entry reversed on its own date. Body { projectId }.

const VOID_KEY = "property.accounting.void";

export async function POST(request, { params }) {
  const { batchId } = await params;
  const { projectId } = await readJson(request);
  const gate = await billingAccess(request, projectId, [CONVERT_KEY, VOID_KEY], "Your role can't void opening balances.");
  if (gate.response) return gate.response;
  if (!gate.can(CONVERT_KEY) || !gate.can(VOID_KEY)) return jsonError(403, "Voiding opening balances needs both Post opening balances and Void ledger entries.");
  try {
    const batch = await loadBatch(gate.admin, projectId, batchId);
    const res = await voidBatch(gate.admin, batch, { actor: gate.auth.user });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return billingError(e, "Couldn't void the opening balances.");
  }
}
