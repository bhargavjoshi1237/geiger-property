import { jsonError, readJson } from "@/lib/auth/staff";
import { billingAccess, billingError } from "@/lib/billing/http";
import { previewImport } from "@/lib/ledger/journal_server";

// POST — preview a journal-entry or opening-balance file (CORE-46): every row checked against the chart, dimensions, the period lock and
// what's already on the ledger, then saved as a preview. Journal entries need accounting.post, opening balances accounting.convert.
// Body { projectId, kind, fileName, format, records, hasRef?, asOf?, importId? }.

export async function POST(request) {
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, ["property.accounting.post", "property.accounting.convert"], "Your role can't import into the ledger.");
  if (gate.response) return gate.response;
  const opening = body.kind === "opening_balances";
  if (!gate.can(opening ? "property.accounting.convert" : "property.accounting.post")) {
    return jsonError(403, opening ? "Your role can't post opening balances." : "Your role can't post to the ledger.");
  }
  try {
    const res = await previewImport(gate.admin, { projectId: body.projectId, actor: gate.auth.user, body });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return billingError(e, "Couldn't read the import.");
  }
}
