import { normalizeEntry, normalizeLine, round2 } from "./postings";
import { AR_BUCKETS, addBuckets, billedOf, emptyBuckets } from "./ar_buckets";
import { receivableAging } from "@/lib/reports/ledger_math";

// Tenant AR reads (CORE-07), isomorphic: balances from property.ledger_party_balances, the monthly trend from
// property.ledger_ar_monthly, and delinquent leases aged from their AR lines. `scope` narrows a query to one
// project (scopeQuery in the browser, (q) => forProject(q, id) on the server); HAP receivables never count (HOUS-01).

const PAGE = 1000;
const CHUNK = 150;

export const AR_DIMENSIONS = ["lease", "tenant"];

// ledger_party_balances rows → Map dimensionId → tenant AR balance.
export function receivableMap(rows) {
  const out = new Map();
  for (const r of rows || []) if (r?.dimension_id) out.set(r.dimension_id, round2((out.get(r.dimension_id) || 0) + (Number(r.receivable) || 0)));
  return out;
}

async function pages(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function chunked(ids, run) {
  const want = [...new Set((ids || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < want.length; i += CHUNK) out.push(...(await run(want.slice(i, i + CHUNK))));
  return out;
}

// Tenant AR per lease or tenant → Map id → balance; `ids` narrows the read, else every party in scope.
export async function partyReceivables(sb, scope, dimension = "lease", ids = null) {
  if (!AR_DIMENSIONS.includes(dimension)) throw new Error(`Unknown AR dimension ${dimension}`);
  const base = () => scope(sb.from("ledger_party_balances").select("dimension_id, receivable").eq("dimension", dimension));
  if (!ids) return receivableMap(await pages(() => base().order("dimension_id")));
  return receivableMap(
    await chunked(ids, async (part) => {
      const { data, error } = await base().in("dimension_id", part);
      if (error) throw new Error(error.message);
      return data || [];
    }),
  );
}

// One lease's (else tenant's) tenant AR; 0 without ledger activity.
export async function partyReceivable(sb, scope, { leaseId, tenantId } = {}) {
  const [dimension, id] = leaseId ? ["lease", leaseId] : ["tenant", tenantId];
  if (!id) return 0;
  return (await partyReceivables(sb, scope, dimension, [id])).get(id) || 0;
}

const COLUMNS = { depositsCharged: "deposits_charged", billingCredits: "billing_credits" };

// ledger_ar_monthly row → { projectId, propertyId, leaseId, tenantId, month: "YYYY-MM", ...AR_BUCKETS }.
export function normalizeArMonth(r) {
  const out = { projectId: r.project_id || null, propertyId: r.property_id || "", leaseId: r.lease_id || "", tenantId: r.tenant_id || "", month: String(r.month || "").slice(0, 7) };
  for (const k of AR_BUCKETS) out[k] = round2(r[COLUMNS[k] || k] ?? r[k]);
  return out;
}

// Monthly AR rows in scope, optionally from / to a day (inclusive, by month) and for one property.
export async function arMonthlyRows(sb, scope, { from, to, propertyId } = {}) {
  const rows = await pages(() => {
    let q = scope(sb.from("ledger_ar_monthly").select("*"));
    if (from) q = q.gte("month", `${String(from).slice(0, 7)}-01`);
    if (to) q = q.lte("month", `${String(to).slice(0, 7)}-01`);
    if (propertyId && propertyId !== "all") q = q.eq("property_id", propertyId);
    return q.order("month").order("lease_id").order("tenant_id");
  });
  return rows.map(normalizeArMonth);
}

// Monthly rows summed per month (YYYY-MM), optionally for some properties → Map month → buckets plus `billed` (billedOf).
export function sumArMonths(rows, { propertyIds = null } = {}) {
  const out = new Map();
  for (const r of rows || []) {
    if (propertyIds?.length && !propertyIds.includes(r.propertyId)) continue;
    out.set(r.month, addBuckets(out.get(r.month) || emptyBuckets(), r));
  }
  for (const [k, b] of out) out.set(k, { ...b, billed: billedOf(b) });
  return out;
}

// Delinquent leases on a day: tenant AR lines of leases with a positive balance, aged like the Delinquency report.
export async function delinquentAging(sb, scope, accounts, asOf) {
  const balances = await partyReceivables(sb, scope, "lease");
  const owing = [...balances].filter(([, b]) => b > 0.004).map(([id]) => id);
  const ar = (accounts?.list || []).filter((a) => a.subtype === "receivable").map((a) => a.id);
  if (!owing.length || !ar.length) return [];
  const raw = await chunked(owing, (part) =>
    pages(() => {
      let q = scope(sb.from("ledger_lines").select("*").in("lease_id", part).in("gl_account_id", ar).is("deleted_at", null));
      if (asOf) q = q.lte("entry_date", asOf);
      return q.order("entry_date").order("id");
    }),
  );
  const lines = raw.map(normalizeLine);
  const entries = await chunked(
    lines.map((l) => l.entryId),
    async (part) => {
      const { data, error } = await sb.from("ledger_entries").select("*").in("id", part);
      if (error) throw new Error(error.message);
      return (data || []).map(normalizeEntry);
    },
  );
  const byId = new Map(entries.map((e) => [e.id, e]));
  return receivableAging(lines.map((l) => ({ ...l, entry: byId.get(l.entryId) || null })), accounts, asOf).filter((r) => r.balance > 0.004);
}
