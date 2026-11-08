import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError } from "@/lib/billing/http";
import { voidDeposit } from "@/lib/billing/bank_deposits";

// POST — void a bank deposit (CORE-16): its reversal posts and its payments go back to Undeposited Funds. Body { projectId, date?, reason? }.

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.void", "Your role can't void bank deposits.");
  if (gate.response) return gate.response;
  try {
    return Response.json({ ok: true, ...(await voidDeposit(gate.admin, { ...body, depositId: id }, gate.auth.user)) });
  } catch (e) {
    return billingError(e, "Couldn't void the bank deposit.");
  }
}
