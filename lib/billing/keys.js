import { periodOf, round2 } from "./periods";

// Billing idempotency keys (file 1 Part A registry, unique per project): rent:<lease>:<YYYY-MM>, rent-adj:<lease>:<YYYY-MM>:<n>, xfer:<newLease>:<item>[:<n>], xfer:<newLease>:credit:<sourceEntry>[:<n>] (:<n> once the item or source re-opens).

export const rentKey = (leaseId, period) => `rent:${leaseId}:${period}`;
export const rentAdjKey = (leaseId, period, n) => `rent-adj:${leaseId}:${period}:${n}`;
export const xferKey = (newLeaseId, itemEntryId) => `xfer:${newLeaseId}:${itemEntryId}`;
export const xferCreditKey = (newLeaseId, sourceEntryId) => `xfer:${newLeaseId}:credit:${sourceEntryId}`;
// Legacy keys billedForPeriod still honours: rent:<rentAccountId>:<YYYY-MM> and the move-in first month.
export const legacyRentKey = (rentAccountId, period) => `rent:${rentAccountId}:${period}`;
export const moveInRentKey = (leaseId) => `movein:${leaseId}:rent`;

const PERIOD = /^\d{4}-\d{2}$/;

// Rent-family key → { kind: "rent" | "adj" | "movein", owner, period?, n? }, else null.
export function parseRentKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "rent" && parts.length === 3 && PERIOD.test(parts[2])) return { kind: "rent", owner: parts[1], period: parts[2] };
  if (parts[0] === "rent-adj" && parts.length === 4 && PERIOD.test(parts[2])) {
    return { kind: "adj", owner: parts[1], period: parts[2], n: Number(parts[3]) || 0 };
  }
  if (parts[0] === "movein" && parts.length === 3 && parts[2] === "rent") return { kind: "movein", owner: parts[1] };
  return null;
}

export const emptyPeriod = () => ({ total: 0, entries: [], charges: [], primaryEntryId: null, mainKeyTaken: false, maxAdj: 0 });

// Billed rent from ledger_entries rows → Map leaseId → Map period → { total, entries, charges, primaryEntryId, mainKeyTaken, maxAdj } (non-void rent, rent-adj, legacy and move-in keys; maxAdj counts every key ever used).
export function summarizeRentEntries(rows, leaseIds) {
  const out = new Map([...new Set((leaseIds || []).filter(Boolean))].map((id) => [id, new Map()]));
  const seen = new Set();
  for (const e of rows || []) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const k = parseRentKey(e.idempotency_key);
    if (!k || !out.has(e.lease_id)) continue;
    const period = k.kind === "movein" ? periodOf(e.entry_date) : k.period;
    const byPeriod = out.get(e.lease_id);
    const sum = byPeriod.get(period) || emptyPeriod();
    byPeriod.set(period, sum);
    const main = k.kind === "rent" && k.owner === e.lease_id;
    if (main) sum.mainKeyTaken = true;
    if (k.kind === "adj") sum.maxAdj = Math.max(sum.maxAdj, k.n);
    if (e.deleted_at || e.status !== "posted" || e.reversal_of) continue;
    const sign = e.source_type === "credit" ? -1 : 1;
    const amount = round2(Number(e.total) || 0);
    sum.total = round2(sum.total + sign * amount);
    const entry = { id: e.id, key: e.idempotency_key, kind: main ? "rent" : k.kind === "rent" ? "legacy" : k.kind, date: e.entry_date, amount: sign * amount };
    sum.entries.push(entry);
    if (sign > 0) sum.charges.push(entry);
  }
  // The period's rent entry: the lease's own key, else a legacy one, else move-in, else the first true-up charge.
  const rank = { rent: 0, legacy: 1, movein: 2, adj: 3 };
  for (const byPeriod of out.values()) {
    for (const sum of byPeriod.values()) {
      sum.charges.sort((a, b) => rank[a.kind] - rank[b.kind] || String(a.date).localeCompare(String(b.date)));
      sum.primaryEntryId = sum.charges[0]?.id || null;
    }
  }
  return out;
}

// A downward rent true-up (rent-adj credit): it reduces what a period was charged, so "Charged" totals net it out.
export const isRentTrueUpCredit = (entry) => entry?.sourceType === "credit" && String(entry?.idempotencyKey || "").startsWith("rent-adj:");
