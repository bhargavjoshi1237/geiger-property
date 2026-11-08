import { toPermissionKey } from "@/lib/rbac";

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
