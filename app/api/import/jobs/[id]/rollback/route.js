import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { staffCan } from "@/lib/auth/permissions";
import { CONVERT_KEY } from "@/lib/ledger/conversion";
import { loadJob, rollbackJob } from "@/lib/data_io/server";

// POST — roll an import back (PLAT-03): soft-delete what it created, restore what it updated; posted opening balances are
// voided through INTL-04 (needs accounting.void and accounting.convert too). Refused once anything depends on it. Body { projectId }.

export const maxDuration = 300;

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: "property.data.import", denied: "Your role can't import data." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so imports can't run.");
  try {
    const job = await loadJob(auth.admin, body.projectId, id);
    const canVoid = await staffCan(auth, ["property.accounting.void", CONVERT_KEY]);
    return Response.json({ ok: true, ...(await rollbackJob(auth.admin, job, { actor: auth.user, canVoid })) });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || "Couldn't roll the import back.", blockers: e?.blockers || [] }, { status: Number(e?.status) || 400 });
  }
}
