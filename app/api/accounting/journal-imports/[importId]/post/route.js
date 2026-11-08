import { jsonError, readJson } from "@/lib/auth/staff";
import { staffCan } from "@/lib/auth/permissions";
import { billingAccess } from "@/lib/billing/http";
import { ADMIN_KEY } from "@/lib/ledger/conversion";
import { loadImportKind, postImport } from "@/lib/ledger/journal_server";

// POST — post a previewed import (CORE-46): ready journal entries under jeimp:<importId>:<entry_ref>, or the opening balances through
// INTL-04's conversion batch (role.manage once the project is live); a re-run posts nothing new. Body { projectId }.

export async function POST(request, { params }) {
  const { importId } = await params;
  const { projectId } = await readJson(request);
  const gate = await billingAccess(request, projectId, ["property.accounting.post", "property.accounting.convert"], "Your role can't import into the ledger.");
  if (gate.response) return gate.response;
  try {
    const opening = (await loadImportKind(gate.admin, projectId, importId)) === "opening_balances";
    if (!gate.can(opening ? "property.accounting.convert" : "property.accounting.post")) {
      return jsonError(403, opening ? "Your role can't post opening balances." : "Your role can't post to the ledger.");
    }
    const isAdmin = opening ? await staffCan(gate.auth, ADMIN_KEY) : false;
    const res = await postImport(gate.admin, { projectId, actor: gate.auth.user, importId, isAdmin });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || "Couldn't post the import.", errors: e?.errors || [] }, { status: Number(e?.status) || 400 });
  }
}
