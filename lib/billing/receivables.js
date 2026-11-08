import "server-only";
import { buildArTransfer, indexAccounts, normalizeEntry, normalizeLine, openItems } from "@/lib/ledger/postings";
import { round2 } from "./periods";
import { leaseFacts } from "./rent";
import { postOnce } from "./post";

// Server-only lease receivables (CORE-01): a lease's open AR and carrying it to a successor lease under idempotent xfer: keys.

const CHUNK = 150;
const isLive = (e) => e && e.status !== "void" && !e.reversalOf;

// A lease's AR → { items, balance, credit, creditSources }; items and sources carry `seq` (prior transfers to `toLeaseId` of the same item / source + 1).
export async function leaseReceivables(admin, projectId, acct, leaseId, toLeaseId = "") {
  const ar = acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id);
  let q = admin.from("ledger_lines").select("*").eq("lease_id", leaseId).in("gl_account_id", ar).is("deleted_at", null);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data, error } = await q.order("entry_date", { ascending: true });
  if (error) throw new Error(error.message);
  const lines = (data || []).map(normalizeLine);
  const ids = [...new Set(lines.map((l) => l.entryId))];
  const entries = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await admin.from("ledger_entries").select("*").in("id", ids.slice(i, i + CHUNK));
    if (res.error) throw new Error(res.error.message);
    for (const e of res.data || []) entries.set(e.id, normalizeEntry(e));
  }
  const withEntry = lines.map((l) => ({ ...l, entry: entries.get(l.entryId) || null }));
  const balance = round2(lines.reduce((s, l) => s + l.debit - l.credit, 0));

  // Earlier transfers to the same lease per item / source, so a re-opened one gets a fresh key.
  const prior = new Map();
  for (const l of withEntry) {
    const key = l.entry?.idempotencyKey || "";
    if (!toLeaseId || !l.appliesToEntryId || !key.startsWith(`xfer:${toLeaseId}:`)) continue;
    prior.set(l.appliesToEntryId, (prior.get(l.appliesToEntryId) || 0) + 1);
  }
  const seqOf = (entryId) => (prior.get(entryId) || 0) + 1;
  const items = openItems(withEntry, indexAccounts(acct.list), "receivable").map((i) => ({ ...i, seq: seqOf(i.entryId) }));

  // Credit sources: unapplied AR credits less debits applied back to them, and charges paid past their amount.
  const pool = new Map();
  const charged = new Map();
  const applied = new Map();
  for (const l of withEntry) {
    if (l.appliesToEntryId) {
      applied.set(l.appliesToEntryId, round2((applied.get(l.appliesToEntryId) || 0) + l.debit - l.credit));
      continue;
    }
    if (!isLive(l.entry)) continue;
    if (l.credit > 0) pool.set(l.entryId, round2((pool.get(l.entryId) || 0) + l.credit));
    if (l.debit > 0) charged.set(l.entryId, round2((charged.get(l.entryId) || 0) + l.debit));
  }
  const sources = [];
  for (const [entryId, amount] of pool) sources.push({ entryId, amount: round2(amount - Math.max(0, applied.get(entryId) || 0)) });
  for (const [entryId, amount] of charged) sources.push({ entryId, amount: round2(-(amount + (applied.get(entryId) || 0))) });
  const creditSources = sources
    .filter((s) => s.amount > 0.004)
    .map((s) => ({ ...s, seq: seqOf(s.entryId), date: entries.get(s.entryId)?.date || "" }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const credit = round2(items.reduce((s, i) => s + i.open, 0) - balance);
  return { items, balance, credit: credit > 0.004 ? credit : 0, creditSources };
}

// Carry open AR (each item, then unapplied credit by source) from one lease to another → posted entries.
export async function transferOpenReceivables(admin, ctx, fromLease, toLease, { actor, date } = {}) {
  const from = leaseFacts(fromLease);
  const to = leaseFacts(toLease);
  const projectId = to.projectId || from.projectId;
  const acct = await ctx.accounts(projectId);
  const open = await leaseReceivables(admin, projectId, acct, from.id, to.id);
  if (!open.items.length && !open.credit) return [];
  const dims = (l) => ({ tenantId: l.tenantId, unitId: l.unitId, propertyId: l.propertyId });
  const built = buildArTransfer(
    { fromLeaseId: from.id, toLeaseId: to.id, items: open.items, credit: open.credit, creditSources: open.creditSources, date: date || (await ctx.today(projectId)), from: dims(from), to: dims(to) },
    acct,
  );
  if (built.error) throw new Error(built.error);
  const out = [];
  for (const b of built.entries) {
    const key = b.entry.idempotencyKey;
    const res = await postOnce(admin, projectId, key, b, { acct, createdBy: actor?.id || null });
    out.push({ entryId: res.entryId, key, amount: round2(b.lines.reduce((s, x) => s + (Number(x.debit) || 0), 0)), kind: "transfer", created: res.created });
  }
  return out;
}

// The live lease that renewed this one (newest first), else null.
export async function successorOf(admin, leaseId) {
  const { data, error } = await admin.from("leases").select("*").eq("renewal_of_id", leaseId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(`successor lease: ${error.message}`);
  return data?.[0] || null;
}
