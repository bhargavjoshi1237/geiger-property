import "server-only";
import { jsonError, requireStaff } from "@/lib/auth/staff";

// Server-only access gate for /api/billing routes: requireStaff with `keys` (one key, or an array of which one is enough)
// plus the service-role client; `can(key)` tells which of the keys the caller holds.
export async function billingAccess(request, projectId, keys, denied) {
  const auth = await requireStaff(request, projectId, Array.isArray(keys) ? { anyOf: keys, denied } : { permission: keys, denied });
  if (!auth.ok) return { response: jsonError(auth.status, auth.error) };
  if (!auth.admin) return { response: jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so billing can't run.") };
  return { admin: auth.admin, auth, can: auth.can };
}

// A thrown service error → JSON ({ status } on the error picks the HTTP code).
export const billingError = (e, fallback) => jsonError(Number(e?.status) || 400, e?.message || fallback);

// Posted entries as the routes return them.
export const entryView = (entries = []) => entries.map((e) => ({ entryId: e.entryId, key: e.key, amount: e.amount, kind: e.kind, created: Boolean(e.created) }));
