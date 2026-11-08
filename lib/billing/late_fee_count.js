import { normalizeEntry } from "@/lib/ledger/postings";
import { addPeriods, periodOf } from "./periods";
import { lateFeeMonths } from "./late_fee_rules";

// Late-fee count (CORE-19), isomorphic: rent months with a live late fee in the last N months (this one included), per lease (the leases it renewed included) or per tenant.
// `scope` narrows a query to one project: scopeQuery in the browser (RLS: accounting.view), (q) => forProject(q, id) on the server.

const PAGE = 1000;
const CHUNK = 150;
const MAX_HOPS = 5;
const COLS = "id, lease_id, tenant_id, entry_date, status, reversal_of, idempotency_key, metadata";

async function rowsFor(ids, build) {
  const want = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < want.length; i += CHUNK) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(want.slice(i, i + CHUNK)).order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

// Each lease → [itself, the lease it renewed, …] following renewal_of_id up to 5 back.
async function renewalChains(sb, scope, leaseIds) {
  const chains = new Map(leaseIds.map((id) => [id, [id]]));
  let tips = leaseIds.map((id) => ({ root: id, at: id }));
  for (let hop = 0; hop < MAX_HOPS && tips.length; hop += 1) {
    const rows = await rowsFor(tips.map((t) => t.at), (part) => scope(sb.from("leases").select("id, renewal_of_id").in("id", part)));
    const prev = new Map(rows.map((r) => [r.id, r.renewal_of_id || ""]));
    tips = tips.map((t) => ({ root: t.root, at: prev.get(t.at) || "" })).filter((t) => t.at && !chains.get(t.root).includes(t.at));
    for (const t of tips) chains.get(t.root).push(t.at);
  }
  return chains;
}

// Live late:/late2: entries dated in the window, by a dimension column (a fee is never dated before its rent month).
async function lateEntries(sb, scope, column, ids, fromPeriod) {
  const rows = await rowsFor(ids, (part) =>
    scope(sb.from("ledger_entries").select(COLS).in(column, part).like("idempotency_key", "late%").is("deleted_at", null).gte("entry_date", `${fromPeriod}-01`)),
  );
  return rows.map(normalizeEntry);
}

const groupBy = (rows, key) => {
  const out = new Map();
  for (const r of rows) if (r[key]) out.set(r[key], [...(out.get(r[key]) || []), r]);
  return out;
};

// Map leaseId | tenantId → { count, periods } over the `months` months ending with `today`'s.
export async function lateFeeCounts(sb, scope, { leaseIds = [], tenantIds = [], today, months = 12 } = {}) {
  const to = periodOf(today || new Date().toISOString());
  const window = { from: addPeriods(to, -(Math.max(1, Number(months) || 12) - 1)), to };
  const out = new Map();
  const leases = [...new Set(leaseIds.filter(Boolean))];
  const tenants = [...new Set(tenantIds.filter(Boolean))];
  if (leases.length) {
    const chains = await renewalChains(sb, scope, leases);
    const byLease = groupBy(await lateEntries(sb, scope, "lease_id", [...chains.values()].flat(), window.from), "leaseId");
    for (const [id, chain] of chains) out.set(id, lateFeeMonths(chain.flatMap((x) => byLease.get(x) || []), window));
  }
  if (tenants.length) {
    const byTenant = groupBy(await lateEntries(sb, scope, "tenant_id", tenants, window.from), "tenantId");
    for (const id of tenants) out.set(id, lateFeeMonths(byTenant.get(id) || [], window));
  }
  return out;
}
