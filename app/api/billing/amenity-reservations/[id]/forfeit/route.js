import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { forfeitDeposit, loadReservation } from "@/lib/billing/amenities";

// POST — forfeit a booking's deposit for damage (Dr 2120 / Cr 4100), amenity:<id>:forfeit; a partial amount releases the rest (CORE-18). Body { projectId, amount?, reason?, date? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, amount, reason, date } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Forfeiting a deposit posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const reservation = await loadReservation(gate.admin, id, projectId);
    const res = await forfeitDeposit(gate.admin, reservation, { actor: gate.auth.user, amount, reason, date });
    return Response.json({ ok: true, entries: entryView(res.entries), ledger: res.ledger });
  } catch (e) {
    return billingError(e, "Couldn't forfeit the deposit.");
  }
}
