import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError } from "@/lib/billing/http";
import { recordRecovery, recoveryPreview } from "@/lib/billing/write_offs";

// Bad-debt recovery (CORE-15). GET ?projectId= — the payment's unapplied credit, what's written off on its lease and what it would reinstate.
// POST { projectId, amount?, date? } — reinstates the written-off charges (wo-recover:<paymentEntryId>) and applies the payment to them; a retry replays.

export async function GET(request, { params }) {
  const { entryId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.write_off", "property.accounting.view"], "Your role can't see bad-debt recoveries.");
  if (gate.response) return gate.response;
  try {
    return Response.json({ ok: true, ...(await recoveryPreview(gate.admin, entryId, { projectId })) });
  } catch (e) {
    return billingError(e, "Couldn't load the payment.");
  }
}

export async function POST(request, { params }) {
  const { entryId } = await params;
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.write_off", "Your role can't record bad-debt recoveries.");
  if (gate.response) return gate.response;
  try {
    const amount = body.amount === undefined || body.amount === null || body.amount === "" ? undefined : Number(body.amount);
    return Response.json({ ok: true, ...(await recordRecovery(gate.admin, entryId, { projectId: body.projectId, amount, date: body.date || undefined }, { actor: gate.auth.user })) });
  } catch (e) {
    return billingError(e, "Couldn't record the recovery.");
  }
}
