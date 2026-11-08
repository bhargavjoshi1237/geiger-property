import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { loadDeposit, recordDepositReceived } from "@/lib/billing/deposits";

// POST — a deposit received outside AR (opening balances, takeovers; CORE-04): Dr the bank / Cr 2100, deposit:<id>:received. Body { projectId, bankAccountId?, date? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, bankAccountId, date } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Recording a deposit posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const deposit = await loadDeposit(gate.admin, id, projectId);
    const res = await recordDepositReceived(gate.admin, deposit, { actor: gate.auth.user, bankAccountId, date });
    return Response.json({ ok: true, linked: res.kind === "linked", entries: res.key ? entryView([res]) : [], entryId: res.entryId, warning: res.warning || "" });
  } catch (e) {
    return billingError(e, "Couldn't record the deposit.");
  }
}
