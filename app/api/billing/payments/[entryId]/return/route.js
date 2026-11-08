import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError } from "@/lib/billing/http";
import { processReturnedPayment, returnPreview } from "@/lib/billing/returns";

// Returned office payment (CORE-17). GET ?projectId= — what the wizard shows first (where the money is, the fee policy, the tenant's return count).
// POST — record it: void the payment, move a deposited check's shortfall to its bank, charge the NSF fee, flag the tenant, emit payment.returned. Body { projectId, returnedOn, reason, chargeFee?, memo? }; a retry replays.

export async function GET(request, { params }) {
  const { entryId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.void", "property.accounting.view"], "Your role can't see returned payments.");
  if (gate.response) return gate.response;
  try {
    return Response.json({ ok: true, ...(await returnPreview(gate.admin, entryId, { projectId })) });
  } catch (e) {
    return billingError(e, "Couldn't load the payment.");
  }
}

export async function POST(request, { params }) {
  const { entryId } = await params;
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.void", "Your role can't record returned payments.");
  if (gate.response) return gate.response;
  try {
    return Response.json({ ok: true, ...(await processReturnedPayment(gate.admin, entryId, body, gate.auth.user)) });
  } catch (e) {
    return billingError(e, "Couldn't record the returned payment.");
  }
}
