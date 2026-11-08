import { round2 } from "@/lib/ledger/postings";
import { dayOf } from "./periods";

// Cash-basis recognition (CORE-44), pure: the JS mirror of property.ledger_cash_basis_totals (20261108065012_ledger_cash_basis) for the
// playground sandbox and the tests, plus the reconciliation to accrual. The ledger is accrual; cash basis is derived from it:
// - income and expense lines of entries that touch no receivable or payable are cash already and count as posted;
// - a charge or bill (income/expense against a receivable/payable) counts only as it's settled: each settlement line (a receivable or
//   payable line of an entry with no income/expense, e.g. a payment, an NSF return, a deposit applied, a bill payment) is spread over
//   the income/expense lines of the entry it applies to (applies_to, following lease transfers; a payment-plan installment stands in
//   for the charges its plan deferred, and the plan's own deferral and installment moves count for nothing), pro rata, in whole cents;
// - settlements that trace to no income/expense (unapplied prepayments, deposits billed through receivables, opening balances) and
//   converted opening balances stay outside income and are returned on their receivable/payable account.
// So cash-basis net income = accrual net income − increase in receivables + increase in payables + those outside rows (Σ debit − credit).

export const RECEIVABLE_SUBTYPES = ["receivable", "subsidy_receivable", "deferred_receivable"];
export const PAYABLE_SUBTYPES = ["payable"];
const SETTLED = new Set([...RECEIVABLE_SUBTYPES, ...PAYABLE_SUBTYPES]);
const CHAIN_DEPTH = 8;

const typeOf = (a) => a?.accountType ?? a?.account_type ?? "";

// "pnl" (income / expense), "arap" (receivable or payable) or "other".
export function accountClass(a) {
  if (!a) return "other";
  if (["Income", "Expense"].includes(typeOf(a))) return "pnl";
  return SETTLED.has(a.subtype) ? "arap" : "other";
}

export const isReceivable = (a) => RECEIVABLE_SUBTYPES.includes(a?.subtype) && accountClass(a) === "arap";
export const isPayable = (a) => PAYABLE_SUBTYPES.includes(a?.subtype) && accountClass(a) === "arap";

const live = (r) => !r.deleted_at;
const cents = (v) => Math.round((Number(v) || 0) * 100);
const idOf = (v) => (v === null || v === undefined || v === "" ? null : String(v));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byLineOrder = (a, b) => (Number(a.line_no) || 0) - (Number(b.line_no) || 0) || cmp(String(a.id), String(b.id));

// Floor division for BigInt (b > 0).
function floorDiv(a, b) {
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

// Whole-cent pro-rata split of a settlement (v cents) over its target's income/expense lines: largest remainder, ties by line id.
export function splitCents(v, targetLines) {
  const n = targetLines.reduce((s, t) => s + BigInt(t.aC), 0n);
  if (n === 0n) return null;
  const den = n < 0n ? -n : n;
  const parts = targetLines.map((t) => {
    const num = BigInt(v) * (n < 0n ? -BigInt(t.aC) : BigInt(t.aC));
    const base = floorDiv(num, den);
    return { t, base, rem: num - base * den };
  });
  let deficit = BigInt(v) - parts.reduce((s, p) => s + p.base, 0n);
  const byId = (x, y) => (x === null ? (y === null ? 0 : 1) : y === null ? -1 : cmp(x, y));
  const order = [...parts].sort((x, y) => (x.rem === y.rem ? byId(x.t.lineId, y.t.lineId) : x.rem > y.rem ? -1 : 1));
  for (const p of order) {
    if (deficit <= 0n) break;
    p.base += 1n;
    deficit -= 1n;
  }
  return parts.map((p) => ({ ...p.t, rC: Number(p.base) }));
}

// property.ledger_cash_basis_totals over raw snake rows { lines, entries, accounts } → rows like ledger_period_totals (owner and bank
// are null). `period(date)` buckets a date as the SQL does (aggregates.periodOf for the grain and range start).
export function cashBasisReference(db, args, period) {
  const project = String(args.p_project_id);
  const from = args.p_from || null;
  const to = args.p_to || null;
  const props = Array.isArray(args.p_property_ids) ? args.p_property_ids.map(String) : null;
  const inProject = (r) => live(r) && String(r.project_id ?? "") === project;
  const cls = new Map((db.accounts || []).filter(inProject).map((a) => [String(a.id), { cls: accountClass(a), type: typeOf(a) }]));
  const classOf = (l) => cls.get(String(l.gl_account_id))?.cls || "other";
  const entries = new Map((db.entries || []).filter(live).map((e) => [String(e.id), e]));
  const all = (db.lines || []).filter(inProject);
  const linesOf = new Map();
  for (const l of all) {
    const k = String(l.entry_id);
    if (!linesOf.has(k)) linesOf.set(k, []);
    linesOf.get(k).push(l);
  }
  for (const ls of linesOf.values()) ls.sort(byLineOrder);
  const isConversion = (id) => entries.get(String(id))?.metadata?.conversion === true;
  const hasPnl = (id) => (linesOf.get(String(id)) || []).some((l) => classOf(l) === "pnl");
  const movedFrom = (l) => idOf(l.metadata?.transferredEntryId);
  const planOf = (l) => idOf(l.metadata?.paymentPlanId);

  const inWin = (l) => {
    const d = dayOf(l.entry_date);
    return (!from || d >= from) && (!to || d <= to);
  };
  const win = all.filter(inWin);
  const ent = new Map();
  for (const l of win) {
    const k = String(l.entry_id);
    const e = ent.get(k) || { id: k, d: dayOf(l.entry_date), hasPnl: false, hasArap: false, allArap: true, plan: false, nC: 0, xC: 0, conv: isConversion(k) };
    const c = classOf(l);
    if (dayOf(l.entry_date) < e.d) e.d = dayOf(l.entry_date);
    if (c !== "arap") e.allArap = false;
    if (planOf(l)) e.plan = true;
    if (c === "pnl") {
      e.hasPnl = true;
      e.nC += cents(l.credit) - cents(l.debit);
    } else if (c === "arap") e.hasArap = true;
    else e.xC += cents(l.debit) - cents(l.credit);
    ent.set(k, e);
  }

  // A settlement's final target: applies_to (else the line's transfer source), then through transfers until an entry with income/expense.
  const finalTarget = (t0) => {
    let t = t0;
    for (let depth = 0; t && depth < CHAIN_DEPTH && !hasPnl(t); depth += 1) {
      const next = (linesOf.get(t) || []).map(movedFrom).find(Boolean);
      if (!next) break;
      t = next;
    }
    return t;
  };
  // A target's income/expense lines (aC = credit − debit in cents); a converted opening balance stands in for its charge account.
  const targetLines = new Map();
  const linesFor = (t) => {
    if (targetLines.has(t)) return targetLines.get(t);
    const own = (linesOf.get(t) || []).filter((l) => classOf(l) === "pnl").map((l) => ({ lineId: String(l.id), acct: String(l.gl_account_id), prop: idOf(l.property_id), aC: cents(l.credit) - cents(l.debit) }));
    let out = own;
    if (!own.length && isConversion(t)) {
      const gl = idOf(entries.get(t)?.metadata?.chargeGl);
      const ar = (linesOf.get(t) || []).filter((l) => classOf(l) === "arap");
      if (gl && cls.get(gl)?.type === "Income" && ar.length) out = [{ lineId: null, acct: gl, prop: idOf(ar[0].property_id), aC: ar.reduce((s, l) => s + cents(l.debit) - cents(l.credit), 0) }];
    }
    // A payment-plan installment (CORE-14) stands in for the charges its plan deferred, each by the amount deferred from it.
    const plan = !own.length && !isConversion(t) ? (linesOf.get(t) || []).map(planOf).find(Boolean) : null;
    if (plan) out = planLines(plan);
    targetLines.set(t, out);
    return out;
  };
  // A plan's deferred charges: Σ (credit − debit) of its receivable lines applied to each charge, split over that charge's lines.
  const planLines = (plan) => {
    const deferred = new Map();
    for (const l of all) {
      if (planOf(l) !== plan || !idOf(l.applies_to_entry_id) || classOf(l) !== "arap") continue;
      const k = idOf(l.applies_to_entry_id);
      deferred.set(k, (deferred.get(k) || 0) + cents(l.credit) - cents(l.debit));
    }
    const out = [];
    for (const [charge, d] of [...deferred].sort((a, b) => cmp(a[0], b[0]))) {
      if (d <= 0) continue;
      const own = (linesOf.get(charge) || []).filter((l) => classOf(l) === "pnl").map((l) => ({ lineId: String(l.id), acct: String(l.gl_account_id), prop: idOf(l.property_id), aC: cents(l.credit) - cents(l.debit) }));
      for (const part of splitCents(d, own) || []) out.push({ ...part, aC: part.rC });
    }
    return out;
  };

  const out = [];
  const push = (d, acct, prop, debit, credit) => out.push({ d, acct: idOf(acct), prop: idOf(prop), debit, credit });
  const settlements = [];
  for (const l of win) {
    const e = ent.get(String(l.entry_id));
    const c = classOf(l);
    if (c === "pnl" && !e.hasArap) push(dayOf(l.entry_date), l.gl_account_id, l.property_id, Number(l.debit) || 0, Number(l.credit) || 0);
    if (c !== "arap" || (e.allArap && e.plan)) continue;
    if (!e.hasPnl && !e.conv) {
      const t0 = idOf(l.applies_to_entry_id) || movedFrom(l);
      settlements.push({ line: l, d: dayOf(l.entry_date), vC: cents(l.credit) - cents(l.debit), target: t0 ? finalTarget(t0) : null });
    } else if ((!e.hasPnl && e.conv) || (e.hasPnl && e.nC === 0)) push(dayOf(l.entry_date), l.gl_account_id, l.property_id, Number(l.debit) || 0, Number(l.credit) || 0);
  }
  for (const e of ent.values()) if (e.hasPnl && e.hasArap && e.xC !== 0 && e.nC !== 0) settlements.push({ line: null, d: e.d, vC: e.xC, target: e.id });

  for (const s of settlements) {
    const parts = s.target ? splitCents(s.vC, linesFor(s.target)) : null;
    if (!parts) {
      push(s.d, s.line.gl_account_id, s.line.property_id, Number(s.line.debit) || 0, Number(s.line.credit) || 0);
      continue;
    }
    for (const p of parts) if (p.rC) push(s.d, p.acct, p.prop, p.rC < 0 ? -p.rC / 100 : 0, p.rC > 0 ? p.rC / 100 : 0);
  }

  const per = new Map();
  for (const r of out) {
    if (props && !props.includes(String(r.prop))) continue;
    const row = { period: period(r.d) || null, gl_account_id: r.acct, property_id: r.prop, owner_id: null, bank_account_id: null };
    const k = `${row.period}|${row.gl_account_id}|${row.property_id}`;
    const cur = per.get(k) || { ...row, debit: 0, credit: 0 };
    cur.debit += r.debit;
    cur.credit += r.credit;
    per.set(k, cur);
  }
  return [...per.values()].map((r) => ({ ...r, debit: round2(r.debit), credit: round2(r.credit) }));
}

// Totals rows ({ glAccountId, debit, credit }) on receivable / payable accounts → { receivables, payables } as net debit (Σ debit − credit).
export function settledMovement(rows, accounts) {
  let receivables = 0;
  let payables = 0;
  for (const r of rows || []) {
    const a = accounts?.byId?.get(r.glAccountId);
    if (isReceivable(a)) receivables += r.debit - r.credit;
    else if (isPayable(a)) payables += r.debit - r.credit;
  }
  return { receivables: round2(receivables), payables: round2(payables) };
}

// The bridge from accrual to cash-basis net income for one column: accrual net, less the increase in receivables, plus the increase in
// payables (both from the accrual totals), plus the receivable/payable rows the cash basis kept outside income → the cash-basis net.
export function cashBridge({ accrualNet, accrualRows, cashRows, accounts }) {
  const moved = settledMovement(accrualRows, accounts);
  const outside = settledMovement(cashRows, accounts);
  const outsideNet = round2(outside.receivables + outside.payables);
  return {
    accrualNet: round2(accrualNet),
    receivables: round2(-moved.receivables),
    payables: round2(-moved.payables),
    outside: outsideNet,
    cashNet: round2(accrualNet - moved.receivables - moved.payables + outsideNet),
  };
}
