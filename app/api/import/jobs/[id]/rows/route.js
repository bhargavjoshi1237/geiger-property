import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { staffCan } from "@/lib/auth/permissions";
import { ADMIN_KEY, CONVERT_KEY } from "@/lib/ledger/conversion";
import { isBalanceEntity } from "@/lib/data_io/import_spec";
import { commitChunk, loadJob, stageRows, validateJob } from "@/lib/data_io/server";

// POST — an import job's rows (PLAT-03). Body { projectId, action }:
//   stage    { rows: [{ rowNo, raw }] } (≤ 500 a call) · validate { mapping?, options? } · commit (the next 200 rows; repeat until done).
// Balance imports post their opening-balance batch only for a caller who can post opening balances (role.manage too once live).

export const maxDuration = 300;

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: "property.data.import", denied: "Your role can't import data." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so imports can't run.");
  try {
    const job = await loadJob(auth.admin, body.projectId, id);
    if (body.action === "stage") return Response.json({ ok: true, ...(await stageRows(auth.admin, job, body.rows)) });
    if (body.action === "validate") return Response.json({ ok: true, ...(await validateJob(auth.admin, job, { mapping: body.mapping, options: body.options })) });
    if (body.action === "commit") {
      const balance = isBalanceEntity(job.entity);
      const canPost = balance && (await staffCan(auth, CONVERT_KEY));
      const isAdmin = balance && (await staffCan(auth, ADMIN_KEY));
      return Response.json({ ok: true, ...(await commitChunk(auth.admin, job, { actor: auth.user, canPost, isAdmin })) });
    }
    return jsonError(400, "Unknown action.");
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || "Couldn't process the import.", problems: e?.problems || [] }, { status: Number(e?.status) || 400 });
  }
}
