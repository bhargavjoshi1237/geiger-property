import { billingAccess, billingError } from "@/lib/billing/http";
import { pendingSweeps } from "@/lib/billing/deposits";

// GET ?projectId= — "Deposits to transfer" (CORE-04): deposit payments that landed outside the Security deposit bank.

export async function GET(request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Your role can't move deposit money.");
  if (gate.response) return gate.response;
  try {
    return Response.json({ ok: true, ...(await pendingSweeps(gate.admin, projectId)) });
  } catch (e) {
    return billingError(e, "Couldn't list the deposits to transfer.");
  }
}
