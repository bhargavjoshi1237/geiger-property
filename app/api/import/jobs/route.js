import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { createJob } from "@/lib/data_io/server";

// POST — start an import job (PLAT-03) for a file the browser parsed: { projectId, id?, entity, sourceSystem, fileName, file?, headers, sheet?, mapping?, options?, detected? }.
// The original file stays private (PLAT-01g): only a { bucket, path } under <projectId>/import_jobs/<id>/ is kept.

export async function POST(request) {
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: "property.data.import", denied: "Your role can't import data." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so imports can't run.");
  try {
    const job = await createJob(auth.admin, body.projectId, body, { actor: auth.user });
    return Response.json({ ok: true, job });
  } catch (e) {
    return jsonError(Number(e?.status) || 400, e?.message || "Couldn't start the import.");
  }
}
