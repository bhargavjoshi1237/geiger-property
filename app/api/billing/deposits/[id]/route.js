import { billingAccess, billingError } from "@/lib/billing/http";
import { depositStatus, loadDeposit } from "@/lib/billing/deposits";

// GET ?projectId= — a deposit record's ledger position (CORE-04): held, interest, deposit-bank cash, unpaid, pending transfers, refund bill.

export async function GET(request, { params }) {
  const { id } = await params;
  const projectId = new URL(request.url).searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.post", "property.security_deposits.view"], "Your role can't view security deposits.");
  if (gate.response) return gate.response;
  try {
    const deposit = await loadDeposit(gate.admin, id, projectId);
    return Response.json({ ok: true, ...(await depositStatus(gate.admin, deposit)) });
  } catch (e) {
    return billingError(e, "Couldn't read the deposit's ledger.");
  }
}
