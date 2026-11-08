import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { loadDeposit, sweepDeposit } from "@/lib/billing/deposits";

// POST — move a deposit's paid-in cash to the deposit bank (CORE-04): Dr 1020 / Cr the receiving cash, deposit:<id>:sweep:<payment>. Body { projectId, paymentEntryId? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, paymentEntryId } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Moving deposit money posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const deposit = await loadDeposit(gate.admin, id, projectId);
    const res = await sweepDeposit(gate.admin, deposit, { actor: gate.auth.user, paymentEntryId });
    return Response.json({ ok: true, entries: entryView(res.entries) });
  } catch (e) {
    return billingError(e, "Couldn't move the deposit.");
  }
}
