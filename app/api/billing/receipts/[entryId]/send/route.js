import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError } from "@/lib/billing/http";
import { sendReceipt } from "@/lib/billing/receipts";

// POST — email a payment's receipt again (CORE-11): a fresh resend:<timestamp> key, so it always sends and never touches the ledger. Body { projectId, to? }.

export async function POST(request, { params }) {
  const { entryId } = await params;
  const { projectId, to } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Your role can't send receipts.");
  if (gate.response) return gate.response;
  try {
    const res = await sendReceipt(gate.admin, entryId, { projectId, to, resend: true });
    if (res.status === "no_address" || res.status === "invalid") return Response.json({ ok: false, error: res.error, status: res.status }, { status: 400 });
    return Response.json({ ok: true, sent: Boolean(res.ok), status: res.status, to: res.to, error: res.error || null });
  } catch (e) {
    return billingError(e, "Couldn't send the receipt.");
  }
}
