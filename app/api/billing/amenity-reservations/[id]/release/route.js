import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { loadReservation, releaseDeposit } from "@/lib/billing/amenities";

// POST — release a booking's deposit to the resident's account (Dr 2120 / Cr 1200), amenity:<id>:release (CORE-18). Body { projectId, date? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, date } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Releasing a deposit posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const reservation = await loadReservation(gate.admin, id, projectId);
    const res = await releaseDeposit(gate.admin, reservation, { actor: gate.auth.user, date });
    return Response.json({ ok: true, entries: entryView(res.entries), ledger: res.ledger });
  } catch (e) {
    return billingError(e, "Couldn't release the deposit.");
  }
}
