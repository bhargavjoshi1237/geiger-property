import { lineAllocation } from "@/lib/ledger/ownership";
import { round2 } from "@/lib/ledger/postings";
import { cashFlowSummary, isCash } from "./ledger_math";
import { cashBasisReference } from "./cash_basis";
import { dayBefore, dayOf } from "./periods";

// Server-side ledger aggregates (CORE-41), pure and isomorphic. The SQL functions property.ledger_period_totals,
// ledger_balances_as_of and ledger_cash_flow_totals (20261108053256_ledger_aggregates) return totals; this module turns them into
// synthetic lines so the existing ledger_math (trialBalance, incomeStatement, balanceSheet, glDetail, cashRegister) runs unchanged,
// and holds referenceTotals, the JS mirror of those functions for the playground sandbox and the tests.

export const GRAINS = ["day", "month", "year", "range"];

const ids = (v) => (Array.isArray(v) ? [...new Set(v.filter(Boolean).map(String))].sort() : null);

// ledgerTotals params → { from, to, grain, propertyIds, ownerId, cash, basis }; propertyIds null = every property, [] = none;
// basis: "cash" (CORE-44, not with an owner) reads cash-basis period rows; accrual leaves the key out.
export function totalsParams(params = {}) {
  return {
    from: dayOf(params.from) || null,
    to: dayOf(params.to) || null,
    grain: GRAINS.includes(params.grain) ? params.grain : "month",
    propertyIds: ids(params.propertyIds),
    ownerId: params.ownerId || null,
    cash: Boolean(params.cash),
    ...(params.basis === "cash" && !params.ownerId ? { basis: "cash" } : {}),
  };
}

// ledgerColumns params → { columns: [{ key, from, to }], propertyIds, basis }: one range (or as-of, with no `from`) per column (CORE-44).
export function columnsParams(params = {}) {
  const columns = (Array.isArray(params.columns) ? params.columns : [])
    .map((c, i) => ({ key: String(c?.key ?? `c${i}`), from: dayOf(c?.from) || null, to: dayOf(c?.to) || null }))
    .filter((c) => c.to);
  return { columns, propertyIds: ids(params.propertyIds), ...(params.basis === "cash" ? { basis: "cash" } : {}) };
}

// Bounded ledger params → { from, to, propertyIds, subtypes, opening } (no params at all means the whole ledger).
export function windowParams(params = {}) {
  return {
    from: dayOf(params.from) || null,
    to: dayOf(params.to) || null,
    propertyIds: ids(params.propertyIds),
    subtypes: ids(params.subtypes),
    opening: Boolean(params.opening),
  };
}

// The start of a date's bucket, clamped to `from` (as the SQL does); "range" is `from` itself ("" when open-ended).
export function periodOf(date, grain, from = null) {
  const d = dayOf(date);
  if (grain === "range") return from || "";
  if (!d || grain === "day") return d;
  const start = grain === "year" ? `${d.slice(0, 4)}-01-01` : `${d.slice(0, 7)}-01`;
  return from && start < from ? from : start;
}

// Cash-flow rows are bucketed by month at most (the statement's by-month view needs them).
export const cashGrain = (grain) => (grain === "day" ? "day" : "month");

// RPC row (snake) → { period, glAccountId, propertyId, ownerId, bankAccountId, debit, credit }.
export function totalsRow(r) {
  return {
    period: dayOf(r.period) || "",
    glAccountId: r.gl_account_id ?? r.glAccountId ?? "",
    propertyId: r.property_id ?? r.propertyId ?? "",
    ownerId: r.owner_id ?? r.ownerId ?? "",
    bankAccountId: r.bank_account_id ?? r.bankAccountId ?? "",
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
  };
}

// Cash-flow RPC row → { period, sourceType, inflow, outflow }.
export function cashRow(r) {
  return {
    period: dayOf(r.period) || "",
    sourceType: r.source_type ?? r.sourceType ?? "",
    inflow: Number(r.inflow) || 0,
    outflow: Number(r.outflow) || 0,
  };
}

export const emptyTotals = (params = {}) => ({ params: totalsParams(params), accounts: { byId: new Map(), byKey: new Map(), list: [] }, any: false, opening: [], period: [], cash: null, accrual: null });

export const emptyColumns = (params = {}) => ({ params: columnsParams(params), accounts: { byId: new Map(), byKey: new Map(), list: [] }, any: false, columns: [] });

// Aggregate rows → synthetic ledger lines dated at their period (or `date`), the shape ledger_math reads.
export function totalsToLines(rows, { date, prefix = "agg", accounts } = {}) {
  return (rows || []).map((r, i) => ({
    id: `${prefix}:${i}`,
    entryId: "",
    lineNo: 0,
    synthetic: true,
    glAccountId: r.glAccountId,
    propertyId: r.propertyId || "",
    ownerId: r.ownerId || "",
    bankAccountId: r.bankAccountId || "",
    date: date ?? r.period ?? "",
    debit: r.debit,
    credit: r.credit,
    memo: "",
    metadata: {},
    entry: null,
    ...(accounts ? { account: accounts.byId.get(r.glAccountId) || null } : {}),
  }));
}

// Opening balances (dated the day before `from`) as synthetic lines.
export const openingLines = (rows, from, accounts) => (from ? totalsToLines(rows, { date: dayBefore(from), prefix: "open", accounts }) : []);

// A ledgerTotals result → opening + period synthetic lines: trialBalance / incomeStatement / balanceSheet run on these unchanged.
export const ledgerTotalsLines = (totals) => [...openingLines(totals?.opening, totals?.params?.from), ...totalsToLines(totals?.period)];

// The cash flow of a ledgerTotals result fetched with `cash: true` (same shape as ledger_math cashFlow).
export function cashFlowFromTotals(totals) {
  const { from, to } = totals?.params || {};
  const accounts = totals?.accounts || { byId: new Map() };
  const opening = from ? round2((totals.opening || []).reduce((s, r) => (isCash(accounts.byId.get(r.glAccountId)) ? s + r.debit - r.credit : s), 0)) : 0;
  const moves = (totals?.cash || [])
    .flatMap((r) => [
      { date: r.period, entry: { sourceType: r.sourceType }, delta: r.inflow },
      { date: r.period, entry: { sourceType: r.sourceType }, delta: -r.outflow },
    ])
    .filter((m) => m.delta);
  return cashFlowSummary(opening, moves, { from, to });
}

const dimKey = (r) => [r.glAccountId, r.propertyId, r.ownerId, r.bankAccountId].join("|");

// Re-sum rows at a coarser grain (per period × account × property × owner × bank).
export function rebucket(rows, grain, from = null) {
  const per = new Map();
  for (const r of rows || []) {
    const period = periodOf(r.period, grain, from);
    const k = `${period}|${dimKey(r)}`;
    const cur = per.get(k) || { period, glAccountId: r.glAccountId, propertyId: r.propertyId, ownerId: r.ownerId, bankAccountId: r.bankAccountId, debit: 0, credit: 0 };
    cur.debit += r.debit;
    cur.credit += r.credit;
    per.set(k, cur);
  }
  return [...per.values()].map((r) => ({ ...r, debit: round2(r.debit), credit: round2(r.credit) }));
}

// Day rows → one owner's whole-cent share of each (lineAllocation, as ownerScopedLines cuts lines); rows with no share drop out.
export function ownerShareRows(rows, ownerId, ownership) {
  const out = [];
  for (const r of rows || []) {
    const line = { propertyId: r.propertyId, ownerId: r.ownerId, date: r.period, debit: r.debit, credit: r.credit, metadata: {} };
    const mine = lineAllocation(line, ownership).owners.find((o) => o.ownerId === ownerId);
    if (!mine || mine.share <= 0) continue;
    out.push({ ...r, debit: mine.debit, credit: mine.credit });
  }
  return out;
}

// One owner's opening and period totals from their candidate day rows through `to` (shares split per day, then summed).
export function ownerTotals(dayRows, params, ownership) {
  const p = totalsParams(params);
  const mine = ownerShareRows(dayRows, p.ownerId, ownership);
  const before = p.from ? mine.filter((r) => r.period < p.from) : [];
  const within = p.from ? mine.filter((r) => r.period >= p.from) : mine;
  const opening = rebucket(before, "range", null).map(({ period: _period, ...r }) => r);
  return { opening, period: rebucket(within, p.grain, p.from) };
}

// --- Reference implementation (mirror of the SQL functions over raw snake_case rows) ---------------------------------------

const live = (r) => !r.deleted_at;
const sameId = (a, b) => String(a ?? "") === String(b ?? "");
const falsyFlag = (v) => v === undefined || v === null || v === false || v === "" || v === 0;

// A line's owner tag as property.ledger_period_totals computes it (ownership.js ownerTagOf).
function ownerTag(line, entries) {
  if (!line.owner_id) return null;
  const e = entries.get(String(line.entry_id));
  const notOwnerSpecific = e && live(e) && !["distribution", "contribution"].includes(e.source_type) && falsyFlag(e.metadata?.ownerExplicit);
  return notOwnerSpecific ? null : line.owner_id;
}

function windowLines(db, a) {
  const entries = new Map((db.entries || []).map((e) => [String(e.id), e]));
  const props = Array.isArray(a.p_property_ids) ? a.p_property_ids.map(String) : null;
  const owned = a.p_owner_id
    ? new Set((db.propertyOwners || []).filter((po) => live(po) && sameId(po.project_id, a.p_project_id) && sameId(po.owner_id, a.p_owner_id)).map((po) => String(po.property_id)))
    : null;
  const out = [];
  for (const l of db.lines || []) {
    if (!live(l) || !sameId(l.project_id, a.p_project_id)) continue;
    const d = dayOf(l.entry_date);
    if ((a.p_from && d < a.p_from) || (a.p_to && d > a.p_to)) continue;
    if (props && !props.includes(String(l.property_id))) continue;
    const tag = ownerTag(l, entries);
    if (a.p_owner_id) {
      if (l.metadata?.side === "manager") continue;
      if (!(sameId(tag, a.p_owner_id) || (!tag && owned.has(String(l.property_id))))) continue;
    }
    out.push({ ...l, d, tag });
  }
  return out;
}

const grainError = (fn) => ({ error: { message: `${fn}: grain must be day, month, year or range`, code: "22023" } });

// property.<fn>(args) over { lines, entries, accounts, propertyOwners } → { data } (snake rows, nulls as null) or { error }; the cash basis is cash_basis.js (CORE-44).
export function referenceTotals(db, fn, args = {}) {
  if (!args.p_project_id) return { error: { message: `${fn}: a project is required`, code: "22023" } };
  if (fn === "ledger_balances_as_of") {
    const res = referenceTotals(db, "ledger_period_totals", { ...args, p_from: null, p_to: args.p_as_of ?? null, p_grain: "range" });
    return res.error ? res : { data: res.data.map(({ period: _period, ...r }) => r) };
  }
  const grain = args.p_grain ?? "month";
  if (!GRAINS.includes(grain)) return grainError(fn);
  const from = args.p_from || null;
  const period = (d) => periodOf(d, grain, from) || null;
  if (fn === "ledger_period_totals") {
    const per = new Map();
    for (const l of windowLines(db, args)) {
      const row = { period: period(l.d), gl_account_id: l.gl_account_id ?? null, property_id: l.property_id ?? null, owner_id: l.tag ?? null, bank_account_id: l.bank_account_id ?? null };
      const k = Object.values(row).join("|");
      const cur = per.get(k) || { ...row, debit: 0, credit: 0 };
      cur.debit += Number(l.debit) || 0;
      cur.credit += Number(l.credit) || 0;
      per.set(k, cur);
    }
    return { data: [...per.values()].map((r) => ({ ...r, debit: round2(r.debit), credit: round2(r.credit) })) };
  }
  if (fn === "ledger_cash_basis_totals") return { data: cashBasisReference(db, args, period) };
  if (fn === "ledger_cash_flow_totals") {
    const cash = new Set((db.accounts || []).filter((x) => live(x) && sameId(x.project_id, args.p_project_id) && x.subtype === "cash").map((x) => String(x.id)));
    const entries = new Map((db.entries || []).filter(live).map((e) => [String(e.id), e]));
    const moves = new Map();
    for (const l of windowLines(db, { ...args, p_owner_id: null })) {
      if (!cash.has(String(l.gl_account_id))) continue;
      const m = moves.get(String(l.entry_id)) || { entry: String(l.entry_id), d: l.d, delta: 0 };
      if (l.d < m.d) m.d = l.d;
      m.delta += (Number(l.debit) || 0) - (Number(l.credit) || 0);
      moves.set(m.entry, m);
    }
    const per = new Map();
    for (const m of moves.values()) {
      const delta = round2(m.delta);
      if (!delta) continue;
      const row = { period: period(m.d), source_type: entries.get(m.entry)?.source_type || "" };
      const k = `${row.period}|${row.source_type}`;
      const cur = per.get(k) || { ...row, inflow: 0, outflow: 0 };
      if (delta > 0) cur.inflow += delta;
      else cur.outflow -= delta;
      per.set(k, cur);
    }
    return { data: [...per.values()].map((r) => ({ ...r, inflow: round2(r.inflow), outflow: round2(r.outflow) })) };
  }
  return { error: { message: `Unknown aggregate ${fn}`, code: "42883" } };
}
