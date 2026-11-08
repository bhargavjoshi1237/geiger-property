import { readJson } from "@/lib/auth/staff";
import { staffCan } from "@/lib/auth/permissions";
import { billingAccess, billingError } from "@/lib/billing/http";
import { cancelReservation, loadReservation } from "@/lib/billing/amenities";

// POST — cancel (or decline) a booking; inside the free-cancel window, or on a decline, its fee and deposit are voided, which also needs accounting.void (CORE-18). Body { projectId, decline? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const { projectId, decline } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Cancelling a charged booking changes the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const reservation = await loadReservation(gate.admin, id, projectId);
    const res = await cancelReservation(gate.admin, reservation, {
      actor: gate.auth.user,
      decline: decline === true,
      canVoid: () => staffCan(gate.auth, "property.accounting.void"),
    });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return billingError(e, "Couldn't cancel the reservation.");
  }
}
