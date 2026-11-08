import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { saveMapping } from "@/lib/data_io/server";

// POST — save or remove a column mapping (PLAT-03, settings key import_mappings). Body { projectId, action: "save", name, entity, sourceSystem, mapping } | { projectId, action: "remove", id }.

export async function POST(request) {
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: "property.data.import", denied: "Your role can't import data." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so imports can't run.");
  try {
    const mappings = await saveMapping(auth.admin, body.projectId, body, { actor: auth.user });
    return Response.json({ ok: true, mappings });
  } catch (e) {
    return jsonError(Number(e?.status) || 400, e?.message || "Couldn't save the mapping.");
  }
}
