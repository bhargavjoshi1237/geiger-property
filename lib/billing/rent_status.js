import "server-only";
import { forProject } from "@/lib/supabase/scope";
import { loadLeaseReceivables } from "./receivables";
import { rentAccountStatus } from "./ar_status";

// Server-only rent-account status sync (CORE-07): the billing job sets each billed lease's rent_accounts.status from its tenant AR (Current / Due / Overdue past grace); In collections stays.

const CHUNK = 150;

async function rentAccountsFor(admin, projectId, leaseIds) {
  const out = [];
  for (let i = 0; i < leaseIds.length; i += CHUNK) {
    const q = admin.from("rent_accounts").select("id, lease_id, status").in("lease_id", leaseIds.slice(i, i + CHUNK)).is("deleted_at", null);
    const { data, error } = await forProject(q, projectId);
    if (error) throw new Error(`rent accounts: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

// One project's leases on business date `today` → { updated: [{ id, leaseId, from, to }] }; dryRun plans only.
export async function syncRentAccountStatuses(admin, ctx, projectId, leases, { today, dryRun = false } = {}) {
  const byId = new Map((leases || []).map((l) => [l.id, l]));
  const accounts = await rentAccountsFor(admin, projectId, [...byId.keys()]);
  if (!accounts.length) return { updated: [] };
  const receivables = await loadLeaseReceivables(admin, projectId, [...new Set(accounts.map((a) => a.lease_id))], await ctx.accounts(projectId));
  const updated = [];
  for (const a of accounts) {
    const r = receivables.get(a.lease_id);
    const policies = await ctx.policies(byId.get(a.lease_id));
    const status = rentAccountStatus({ balance: r?.balance, oldestOpenDate: r?.oldestOpenDate, today, graceDays: policies.graceDays, current: a.status });
    if (status === a.status) continue;
    if (!dryRun) {
      const { error } = await forProject(admin.from("rent_accounts").update({ status }).eq("id", a.id), projectId);
      if (error) throw new Error(`rent account ${a.id}: ${error.message}`);
    }
    updated.push({ id: a.id, leaseId: a.lease_id, from: a.status || "", to: status });
  }
  return { updated };
}
