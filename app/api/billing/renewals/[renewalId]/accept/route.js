import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { onRenewalAccepted } from "@/lib/billing/renewal";

// POST — accept a renewal (CORE-01): the renewed lease, its rent, the open balance, rent account and autopay. Body { projectId, transferCharges?, transferDeposits? }.

export async function POST(request, { params }) {
  const { renewalId } = await params;
  const { projectId, transferCharges = true, transferDeposits = true } = await readJson(request);
  const gate = await billingAccess(request, projectId, ["property.renewals.view", "property.leases.view"], "Your role can't accept renewals.");
  if (gate.response) return gate.response;
  try {
    const { data: renewal, error } = await gate.admin.from("renewals").select("*").eq("id", renewalId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!renewal || renewal.deleted_at) throw Object.assign(new Error("Renewal not found."), { status: 404 });
    if (renewal.project_id && renewal.project_id !== projectId) throw Object.assign(new Error("That renewal belongs to another project."), { status: 403 });
    const res = await onRenewalAccepted(gate.admin, renewal, { actor: gate.auth.user, transferCharges: Boolean(transferCharges), transferDeposits: Boolean(transferDeposits) });
    return Response.json({ ok: true, lease: { id: res.lease.id, name: res.lease.name, status: res.lease.status }, created: res.created, entries: entryView(res.entries) });
  } catch (e) {
    return billingError(e, "Couldn't accept the renewal.");
  }
}
