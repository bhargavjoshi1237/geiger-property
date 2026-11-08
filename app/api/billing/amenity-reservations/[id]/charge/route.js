import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { chargeReservation, loadReservation } from "@/lib/billing/amenities";

// POST — charge a booking's fee (Dr 1200 / Cr fee GL) and deposit (Dr 1200 / Cr 2120) once due under the amenity's chargeOn (CORE-18). Body { projectId, date? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, date } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Charging a booking posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const reservation = await loadReservation(gate.admin, id, projectId);
    const res = await chargeReservation(gate.admin, reservation, { actor: gate.auth.user, date });
    return Response.json({ ok: true, entries: entryView(res.entries), ledger: res.ledger, billTo: res.billTo });
  } catch (e) {
    return billingError(e, "Couldn't charge the reservation.");
  }
}
