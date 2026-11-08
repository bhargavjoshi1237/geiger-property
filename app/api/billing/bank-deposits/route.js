import { readJson } from "@/lib/messaging/auth";
import { billingAccess, billingError } from "@/lib/billing/http";
import { createDeposit } from "@/lib/billing/bank_deposits";

// POST — make a bank deposit (CORE-16): Dr the bank per property / Cr 1050 Undeposited Funds per payment, once under bankdep:<depositId>.
// Body { projectId, depositId?, itemLineIds, bankAccountId, date, slipNumber?, memo? }; a retry with the same depositId replays.

export async function POST(request) {
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.post", "Your role can't make bank deposits.");
  if (gate.response) return gate.response;
  try {
    return Response.json({ ok: true, ...(await createDeposit(gate.admin, body, gate.auth.user)) });
  } catch (e) {
    return billingError(e, "Couldn't make the bank deposit.");
  }
}
