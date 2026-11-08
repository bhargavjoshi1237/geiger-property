import { toPermissionKey } from "@/lib/rbac";

// The keys a route declares (PLAT-01f): `permission` (one key or several, all required) and `anyOf` (one of them is enough).
export function permissionDemand({ permission, anyOf } = {}) {
  const all = [permission].flat().filter(Boolean).map(toPermissionKey);
  const any = [anyOf].flat().filter(Boolean).map(toPermissionKey);
  return { all, any, keys: [...new Set([...all, ...any])] };
}

// Does a set of held keys satisfy the demand? An empty demand never does.
export const demandMet = ({ all, any }, held) =>
  all.length + any.length > 0 && all.every((k) => held.has(k)) && (!any.length || any.some((k) => held.has(k)));

// Staff-route permission check: property.rbac_allows run as the signed-in user (the predicate RLS uses), every key
// required. `auth` is requireStaff()'s result; legacy short keys are accepted.
export async function staffCan(auth, keys) {
  const wanted = (Array.isArray(keys) ? keys : [keys]).map(toPermissionKey);
  if (!auth?.userDb || !auth.projectId || !wanted.length) return false;
  try {
    const results = await Promise.all(
      wanted.map((key) => auth.userDb.rpc("rbac_allows", { p_permission: key, p_project: auth.projectId })),
    );
    return results.every((r) => !r.error && r.data === true);
  } catch (e) {
    console.error("[auth.staffCan]", e);
    return false;
  }
}
