import { addDays, isoDate, prorate, round2 } from "@/lib/billing/periods";

// Pure housing-assistance (HAP) split math (HOUS-01): the tenant's share of rent vs the housing authority's; no I/O, safe in the browser.
// hapIndex: Map leaseId → [{ id, contractId, effectiveDate, endDate?, hapAmount, abated? }] (HOUS-03 contract terms); empty or missing → the lease's own fields.

const meta = (l) => (l?.metadata && typeof l.metadata === "object" ? l.metadata : {});
const field = (l, key) => meta(l)[key] ?? l?.[key];
const isOn = (v) => v === true || v === "true";
const PERIOD = /^\d{4}-\d{2}$/;

// The lease's own assistance fields → { subsidized, program, hapAmount } (hapAmount is 0 unless subsidized).
export function leaseAssistance(lease) {
  const subsidized = isOn(field(lease, "subsidized"));
  const hap = round2(field(lease, "hapAmount"));
  return { subsidized, program: String(field(lease, "subsidyProgram") || ""), hapAmount: subsidized && hap > 0 ? hap : 0 };
}

// The lease's contract terms from the index, oldest first.
function termsFor(lease, hapIndex) {
  const list = (lease?.id && typeof hapIndex?.get === "function" ? hapIndex.get(lease.id) : null) || [];
  return list
    .map((t) => ({ ...t, effectiveDate: isoDate(t.effectiveDate), endDate: isoDate(t.endDate) }))
    .filter((t) => t.effectiveDate)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

// The term in force on a date (latest effective on or before it, unless ended), else null.
function termOn(terms, date) {
  let found = null;
  for (const t of terms) if (t.effectiveDate <= date) found = t;
  return found && (!found.endDate || found.endDate >= date) ? found : null;
}

const hapOf = (term) => Math.max(0, round2(term?.hapAmount));

// Monthly split on a date → { total, tenant, hap, source: "lease" | "contract", contractId, termId, abated }; HAP never exceeds the rent (HOUS-05 applies abatements).
export function rentSplit(lease, hapIndex, date) {
  const total = Math.max(0, round2(lease?.rent));
  const terms = termsFor(lease, hapIndex);
  if (terms.length) {
    const t = termOn(terms, isoDate(date));
    const hap = Math.min(total, hapOf(t));
    return { total, tenant: round2(total - hap), hap, source: "contract", contractId: t?.contractId || null, termId: t?.id || null, abated: Boolean(t?.abated) };
  }
  const hap = Math.min(total, leaseAssistance(lease).hapAmount);
  return { total, tenant: round2(total - hap), hap, source: "lease", contractId: null, termId: null, abated: false };
}

// The tenant's monthly share of rent on a date (late-fee base, portal rent); CORE-06 can call it with the same index the billing run uses.
export const tenantShare = (lease, hapIndex, date) => rentSplit(lease, hapIndex, date).tenant;

// A period's billed rent (rentForPeriod result) split → { total, tenant, hap, source, hapRate, contractId, segments }.
// HAP prorates over the same days as rent and never exceeds a range's rent; a contract term change mid-period splits by day; frozenRate pins a billed period's lease-level rate.
export function splitPeriod(lease, computed, period, { hapIndex, method = "actual", frozenRate = null } = {}) {
  const total = round2(computed?.total);
  const terms = termsFor(lease, hapIndex);
  const contract = terms.length > 0;
  const leaseRate = frozenRate === null || frozenRate === undefined ? leaseAssistance(lease).hapAmount : Math.max(0, round2(frozenRate));
  const rateOn = (date) => (contract ? hapOf(termOn(terms, date)) : leaseRate);
  const cuts = contract ? [...new Set(terms.flatMap((t) => [t.effectiveDate, t.endDate ? addDays(t.endDate, 1) : ""]).filter(Boolean))].sort() : [];
  let hap = 0;
  const segments = (computed?.segments || []).map((seg) => {
    const starts = [seg.from, ...cuts.filter((d) => d > seg.from && d <= seg.to)];
    let share = 0;
    starts.forEach((from, i) => {
      const to = i + 1 < starts.length ? addDays(starts[i + 1], -1) : seg.to;
      const rate = Math.min(rateOn(from), Number(seg.rate) || 0);
      if (rate > 0) share += prorate(rate, from, to, period, method);
    });
    share = Math.min(round2(share), round2(seg.amount));
    hap = round2(hap + share);
    return { ...seg, hap: share, tenant: round2(seg.amount - share) };
  });
  hap = Math.min(hap, total);
  const first = contract ? termOn(terms, computed?.from || "") : null;
  return {
    total,
    tenant: round2(total - hap),
    hap,
    source: contract ? "contract" : "lease",
    hapRate: contract ? null : leaseRate,
    contractId: first?.contractId || null,
    segments,
  };
}

// HAP idempotency keys (file 1 registry; permanent formats): hap:<leaseId>:<YYYY-MM> is the period's HAP charge, hap-adj:<leaseId>:<YYYY-MM>:<n> its true-ups.
export const hapKey = (leaseId, period) => `hap:${leaseId}:${period}`;
export const hapAdjKey = (leaseId, period, n) => `hap-adj:${leaseId}:${period}:${n}`;

// HAP-family key → { kind: "hap" | "adj", owner, period, n? }, else null (other hap-prefixed keys are not billing's).
export function parseHapKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "hap" && parts.length === 3 && PERIOD.test(parts[2])) return { kind: "hap", owner: parts[1], period: parts[2] };
  if (parts[0] === "hap-adj" && parts.length === 4 && PERIOD.test(parts[2])) return { kind: "adj", owner: parts[1], period: parts[2], n: Number(parts[3]) || 0 };
  return null;
}

export const emptyHapPeriod = () => ({ total: 0, entries: [], charges: [], mainKeyTaken: false, maxAdj: 0, hapRate: null, hapRateAt: "" });

// Keep the latest lease-level HAP rate a live entry recorded (row.hap_rate = metadata->hapRate) on a period summary.
export function noteHapRate(sum, row) {
  const rate = row?.hap_rate;
  if (rate === null || rate === undefined || rate === "" || !Number.isFinite(Number(rate))) return;
  const at = String(row.created_at || "");
  if (sum.hapRate === null || sum.hapRate === undefined || at >= String(sum.hapRateAt || "")) {
    sum.hapRate = round2(rate);
    sum.hapRateAt = at;
  }
}

// Billed HAP from ledger_entries rows → Map leaseId → Map period → { total, entries, charges, mainKeyTaken, maxAdj, hapRate, hapRateAt } (maxAdj counts every key ever used).
export function summarizeHapEntries(rows, leaseIds) {
  const out = new Map([...new Set((leaseIds || []).filter(Boolean))].map((id) => [id, new Map()]));
  const seen = new Set();
  for (const e of rows || []) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const k = parseHapKey(e.idempotency_key);
    if (!k || k.owner !== e.lease_id || !out.has(e.lease_id)) continue;
    const byPeriod = out.get(e.lease_id);
    const sum = byPeriod.get(k.period) || emptyHapPeriod();
    byPeriod.set(k.period, sum);
    if (k.kind === "hap") sum.mainKeyTaken = true;
    if (k.kind === "adj") sum.maxAdj = Math.max(sum.maxAdj, k.n);
    if (e.deleted_at || e.status !== "posted" || e.reversal_of) continue;
    noteHapRate(sum, e);
    const sign = e.source_type === "credit" ? -1 : 1;
    const amount = round2(Number(e.total) || 0);
    sum.total = round2(sum.total + sign * amount);
    const entry = { id: e.id, key: e.idempotency_key, kind: k.kind, date: e.entry_date, amount: sign * amount };
    sum.entries.push(entry);
    if (sign > 0) sum.charges.push(entry);
  }
  // The period's HAP charge first, then true-up charges by date (credits apply in this order).
  const rank = (c) => (c.kind === "hap" ? 0 : 1);
  for (const byPeriod of out.values()) for (const sum of byPeriod.values()) sum.charges.sort((a, b) => rank(a) - rank(b) || String(a.date).localeCompare(String(b.date)));
  return out;
}

// The lease-level rate a billed period keeps: the latest recorded on its rent or HAP entries, 0 when it was billed before splits, null when nothing is billed (use today's lease fields).
export function frozenHapRate(rentSum, hapSum) {
  const recorded = [rentSum, hapSum].filter((s) => s && s.hapRate !== null && s.hapRate !== undefined);
  if (recorded.length) return recorded.sort((a, b) => String(b.hapRateAt || "").localeCompare(String(a.hapRateAt || "")))[0].hapRate;
  return rentSum?.entries?.length || hapSum?.entries?.length ? 0 : null;
}
