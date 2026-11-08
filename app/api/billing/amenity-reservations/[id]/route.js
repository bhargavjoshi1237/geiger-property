import { billingAccess, billingError } from "@/lib/billing/http";
import { loadReservation, reservationStatus } from "@/lib/billing/amenities";

// GET ?projectId= — an amenity reservation's fee and deposit on the ledger (CORE-18): what's posted and open, who it bills, the free-cancel window.

export async function GET(request, { params }) {
  const { id } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.post", "property.accounting.view"], "Your role can't see the ledger.");
  if (gate.response) return gate.response;
  try {
    const reservation = await loadReservation(gate.admin, id, projectId);
    return Response.json({ ok: true, ...(await reservationStatus(gate.admin, reservation)) });
  } catch (e) {
    return billingError(e, "Couldn't read the reservation's ledger.");
  }
}
