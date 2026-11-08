import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError } from "@/lib/billing/http";
import { writeOff, writeOffPreview } from "@/lib/billing/write_offs";

// Write-offs (CORE-15). GET ?projectId= — the wizard's data: open charges after unapplied credits apply, the plan balance not yet due, the written-off history.
// POST { projectId, writeOffId, items: [{ entryId, amount? }], reason, note?, date? } — writes them off to 5800 Bad Debt under wo:<writeOffId>; a retry replays.

export async function GET(request, { params }) {
  const { leaseId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.write_off", "property.accounting.view"], "Your role can't see write-offs.");
  if (gate.response) return gate.response;
  try {
    return Response.json({ ok: true, ...(await writeOffPreview(gate.admin, leaseId, { projectId })), canWriteOff: gate.can("property.accounting.write_off") });
  } catch (e) {
    return billingError(e, "Couldn't load the lease's open charges.");
  }
}

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.write_off", "Your role can't write off bad debt.");
  if (gate.response) return gate.response;
  try {
    const items = Array.isArray(body.items) ? body.items.map((i) => ({ entryId: i?.entryId, amount: i?.amount })) : [];
    const input = { projectId: body.projectId, writeOffId: body.writeOffId, items, reason: body.reason, note: typeof body.note === "string" ? body.note : "", date: body.date || undefined };
    return Response.json({ ok: true, ...(await writeOff(gate.admin, leaseId, input, { actor: gate.auth.user })) });
  } catch (e) {
    return billingError(e, "Couldn't write off the charges.");
  }
}
