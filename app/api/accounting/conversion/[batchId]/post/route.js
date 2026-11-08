import { readJson } from "@/lib/auth/staff";
import { staffCan } from "@/lib/auth/permissions";
import { billingAccess } from "@/lib/billing/http";
import { ADMIN_KEY } from "@/lib/ledger/conversion";
import { loadBatch, postBatch } from "@/lib/ledger/conversion_server";

// POST — post opening balances (INTL-04) under conv:<batchId>:<lineId>, re-runs post nothing; needs accounting.convert, plus role.manage once live. Body { projectId }.

export async function POST(request, { params }) {
  const { batchId } = await params;
  const { projectId } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.convert", "Your role can't post opening balances.");
  if (gate.response) return gate.response;
  try {
    const batch = await loadBatch(gate.admin, projectId, batchId);
    const res = await postBatch(gate.admin, batch, { actor: gate.auth.user, isAdmin: await staffCan(gate.auth, ADMIN_KEY) });
    return Response.json({
      ok: true,
      created: res.created,
      entries: res.entries.map((e) => ({ lineId: e.lineId, kind: e.kind, entryId: e.entryId, key: e.key, created: Boolean(e.created), linked: Boolean(e.linked) })),
      reconciliations: res.reconciliations,
      totals: res.totals,
      warnings: res.warnings,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || "Couldn't post the opening balances.", errors: e?.errors || [] }, { status: Number(e?.status) || 400 });
  }
}
