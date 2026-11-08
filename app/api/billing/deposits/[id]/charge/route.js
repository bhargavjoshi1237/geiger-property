import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { chargeDeposit, loadDeposit } from "@/lib/billing/deposits";

// POST — bill a deposit through AR (CORE-04): Dr 1200 / Cr 2100, deposit:<id>:charge. Body { projectId, date? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, date } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Billing a deposit posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const deposit = await loadDeposit(gate.admin, id, projectId);
    const res = await chargeDeposit(gate.admin, deposit, { actor: gate.auth.user, date });
    return Response.json({ ok: true, linked: res.kind === "linked", entries: res.key ? entryView([res]) : [], entryId: res.entryId });
  } catch (e) {
    return billingError(e, "Couldn't bill the deposit.");
  }
}
