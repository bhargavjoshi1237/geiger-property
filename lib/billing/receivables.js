import "server-only";
import { buildArTransfer, indexAccounts, normalizeEntry, normalizeLine, openItems } from "@/lib/ledger/postings";
import { loadAccountIndex } from "@/lib/ledger/store";
import { round2 } from "./periods";
import { leaseFacts } from "./rent";
import { forProject } from "@/lib/supabase/scope";
import { postOnce } from "./post";
import { classifyEntry, mergeInheritedLateFees, summarizeReceivable, transferSourceOf } from "./ar_summary";
import { summarizeLateEntries } from "./late_fee_rules";
import { lateFeeCounts } from "./late_fee_count";

// Server-only lease receivables (CORE-01/06): open AR for one or many leases, and carrying it to a successor lease under idempotent xfer: keys.

const CHUNK = 150;
const PAGE = 1000;
const MAX_HOPS = 5;
const isLive = (e) => e && e.status !== "void" && !e.reversalOf;

// Entries by id (chunked) → Map id → normalized entry.
async function entriesById(admin, ids) {
  const out = new Map();
  const want = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < want.length; i += CHUNK) {
    const res = await admin.from("ledger_entries").select("*").in("id", want.slice(i, i + CHUNK));
    if (res.error) throw new Error(res.error.message);
    for (const e of res.data || []) out.set(e.id, { ...normalizeEntry(e), deletedAt: e.deleted_at || null });
  }
  return out;
}

// Tenant AR lines (each with its entry) for many leases, paged → Map leaseId → lines oldest first.
async function loadArLines(admin, projectId, leaseIds, acct) {
  const ids = [...new Set((leaseIds || []).filter(Boolean))];
  const out = new Map(ids.map((id) => [id, []]));
  const ar = acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id);
  if (!ar.length || !ids.length) return out;
  const lines = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (let from = 0; ; from += PAGE) {
      const q = admin.from("ledger_lines").select("*").in("lease_id", ids.slice(i, i + CHUNK)).in("gl_account_id", ar).is("deleted_at", null);
      const { data, error } = await forProject(q, projectId).order("entry_date", { ascending: true }).order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      lines.push(...(data || []).map(normalizeLine));
      if (!data || data.length < PAGE) break;
    }
  }
  const entries = await entriesById(admin, lines.map((l) => l.entryId));
  for (const l of lines) out.get(l.leaseId)?.push({ ...l, entry: entries.get(l.entryId) || null });
  return out;
}

// A lease's AR → { items, balance, credit, creditSources }; items and sources carry `seq` (prior transfers to `toLeaseId` of the same item / source + 1).
export async function leaseReceivables(admin, projectId, acct, leaseId, toLeaseId = "") {
  const withEntry = (await loadArLines(admin, projectId, [leaseId], acct)).get(leaseId) || [];
  const balance = round2(withEntry.reduce((s, l) => s + l.debit - l.credit, 0));
  const entries = new Map(withEntry.map((l) => [l.entryId, l.entry]));

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
  // AR only moves between leases of one project.
  const projectId = to.projectId;
  if (!projectId || from.projectId !== projectId) throw new Error("Both leases must belong to the same project.");
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

// Carried items' originals, following xfer chains → Map carriedEntryId → { entryId, leaseId, kind, period, chain: [leaseIds it passed through] }.
async function resolveOrigins(admin, starts) {
  const out = new Map();
  let frontier = [...starts].map(([carriedId, sourceId]) => ({ carriedId, sourceId, chain: [] }));
  for (let hop = 0; hop < MAX_HOPS && frontier.length; hop += 1) {
    const found = await entriesById(admin, frontier.map((f) => f.sourceId));
    const next = [];
    for (const f of frontier) {
      const e = found.get(f.sourceId);
      if (!e) continue;
      const chain = [...f.chain, e.leaseId].filter(Boolean);
      const further = transferSourceOf(e);
      if (further && hop + 1 < MAX_HOPS) next.push({ carriedId: f.carriedId, sourceId: further, chain });
      else out.set(f.carriedId, { entryId: e.id, leaseId: e.leaseId, ...classifyEntry(e), chain });
    }
    frontier = next;
  }
  return out;
}

// Late-fee entries (late: and CORE-19's late2:) of some leases (any status, soft-deleted included so every used key is known) → normalized.
async function loadLateEntries(admin, projectId, leaseIds) {
  const ids = [...new Set(leaseIds.filter(Boolean))];
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (let from = 0; ; from += PAGE) {
      const q = admin.from("ledger_entries").select("*").in("lease_id", ids.slice(i, i + CHUNK)).like("idempotency_key", "late%");
      const { data, error } = await forProject(q, projectId).order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...(data || []).map((e) => ({ ...normalizeEntry(e), deletedAt: e.deleted_at || null })));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

// Batched tenant AR (CORE-06; reused by CORE-07/12/13/14/19) → Map leaseId → { balance, credit, items, oldestOpenDate, lastPaymentDate, lateFeesPosted: { [period]: amount }, lateFees }.
// Items are open charges typed by key (kind rent | late_fee | charge | …, period); carried items take their original's kind and month (fromLeaseId), and late fees a predecessor charged for a carried month count as posted.
export async function loadLeaseReceivables(admin, projectId, leaseIds, acct) {
  const accounts = acct || (await loadAccountIndex(admin, projectId));
  const linesBy = await loadArLines(admin, projectId, leaseIds, accounts);
  // Carried items still open → their originals (kind, month, lease chain).
  const carried = new Map();
  const starts = new Map();
  for (const [leaseId, lines] of linesBy) {
    const entryOf = new Map(lines.map((l) => [l.entryId, l.entry]));
    const ids = openItems(lines, accounts, "receivable").map((i) => i.entryId).filter((id) => transferSourceOf(entryOf.get(id)));
    for (const id of ids) starts.set(id, transferSourceOf(entryOf.get(id)));
    carried.set(leaseId, ids);
  }
  const origins = starts.size ? await resolveOrigins(admin, starts) : new Map();
  const chainLeases = [...origins.values()].flatMap((o) => o.chain);
  const late = summarizeLateEntries(await loadLateEntries(admin, projectId, [...linesBy.keys(), ...chainLeases]));
  const out = new Map();
  for (const [leaseId, lines] of linesBy) {
    // Late fees the leases a carried rent month passed through charged for that month.
    const inherited = {};
    const seen = new Set();
    for (const o of carried.get(leaseId).map((id) => origins.get(id)).filter((x) => x?.kind === "rent")) {
      for (const from of o.chain) {
        const tag = `${from}|${o.period}`;
        if (from === leaseId || seen.has(tag)) continue;
        seen.add(tag);
        const h = late.get(from)?.[o.period];
        if (h) (inherited[o.period] ||= []).push(h);
      }
    }
    out.set(leaseId, summarizeReceivable(lines, accounts, { origins, lateFees: mergeInheritedLateFees(late.get(leaseId), inherited) }));
  }
  return out;
}

// Late-fee count (CORE-19): rent months with a live late fee (a second fee when it counts) in the last `months`, this one included, across the lease's renewal chain.
export async function lateFeeCount(admin, projectId, leaseId, { months = 12, today } = {}) {
  return (await lateFeeCounts(admin, (q) => forProject(q, projectId), { leaseIds: [leaseId], months, today })).get(leaseId)?.count || 0;
}

// Batched: Map leaseId → { count, periods } (LEAS bulk-renewal screening, the automation field).
export const lateFeeCountsByLease = (admin, projectId, leaseIds, { months = 12, today } = {}) => lateFeeCounts(admin, (q) => forProject(q, projectId), { leaseIds, months, today });
