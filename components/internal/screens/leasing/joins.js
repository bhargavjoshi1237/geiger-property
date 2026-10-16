import { listTenants } from "@/lib/supabase/tenants";

// Row loaders for leasing screens whose tables keep only `tenant_id`: join the
// tenant's display name so lists, search, and overviews can show it.
export async function withTenantNames(rows) {
  if (!rows) return rows;
  if (!rows.some((r) => r.tenantId)) return rows;
  const tenants = (await listTenants()) ?? [];
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));
  return rows.map((r) => ({ ...r, tenantName: r.tenantName || nameById.get(r.tenantId) || "" }));
}

// rowsLoader factory: list through the engine data, then join tenant names.
export const tenantJoinedLoader = (data) => async () => withTenantNames(await data.list());
