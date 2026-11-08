import "server-only";
import { jsonError, requireStaff } from "@/lib/messaging/auth";
import { adminClient } from "@/lib/supabase/admin";
import { staffCan } from "@/lib/orchestration/permissions";

// Server-only access gate for /api/billing routes: signed-in staff on the project, a permission (any of `keys`), and a service-role client.
export async function billingAccess(request, projectId, keys, denied) {
  if (!projectId) return { response: jsonError(400, "projectId is required.") };
  const auth = await requireStaff(request, projectId);
  if (!auth.ok) return { response: jsonError(auth.status, auth.error) };
  const admin = adminClient({ source: "app", actor: auth.user });
  if (!admin) return { response: jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so billing can't run.") };
  const wanted = Array.isArray(keys) ? keys : [keys];
  const granted = new Set();
  for (const k of wanted) if (await staffCan(admin, auth, k)) granted.add(k);
  if (!granted.size) return { response: jsonError(403, denied) };
  return { admin, auth, can: (k) => granted.has(k) };
}

// A thrown service error → JSON ({ status } on the error picks the HTTP code).
export const billingError = (e, fallback) => jsonError(Number(e?.status) || 400, e?.message || fallback);

// Posted entries as the routes return them.
export const entryView = (entries = []) => entries.map((e) => ({ entryId: e.entryId, key: e.key, amount: e.amount, kind: e.kind, created: Boolean(e.created) }));
