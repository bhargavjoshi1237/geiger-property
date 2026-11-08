import { revalidateTag } from "next/cache";

import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { isValidHandle } from "@/lib/leasing/slug";
import { projectTag, siteTag } from "@/lib/leasing/public/cache";

// POST — refresh the public leasing site after a listing or site change (LEAS-01). Body { projectId, handles? }:
// `handles` names a handle the site just moved off, so its old pages stop answering at once.

export async function POST(request) {
  const { projectId, handles } = await readJson(request);
  const auth = await requireStaff(request, projectId, { anyOf: ["property.listings.view", "property.settings.manage"] });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const { data, error } = await auth.scoped("leasing_sites").select("handle").is("deleted_at", null);
  if (error) return jsonError(500, "Couldn't read the leasing site.");
  const extra = Array.isArray(handles) ? handles.slice(0, 2) : [];
  const all = new Set([...(data || []).map((r) => r.handle), ...extra].filter(isValidHandle));
  revalidateTag(projectTag(projectId), { expire: 0 });
  for (const handle of all) revalidateTag(siteTag(handle), { expire: 0 });
  return Response.json({ ok: true, handles: [...all] });
}
