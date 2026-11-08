import { allocateOldestFirst } from "@/lib/ledger/postings";
import { addPeriods, periodBounds, periodOf, periodRange, round2 } from "./periods";

// Pure deposit math (CORE-04), client-importable: keys, per-record balances, interest, the disposition plan and the transfer queue; I/O is in deposits.js.

export const DEPOSIT_OPEN_STATUSES = ["Pending", "Held", "Awaiting disposition"];
export const DEPOSIT_BANK_TYPE = "Security deposit";
export const DEFAULT_DEPOSIT_KIND = "Security deposit";
export const PET_DEPOSIT_KIND = "Pet deposit";
export const INTEREST_PAYOUTS = ["at_move_out", "annual_credit"];

// Deductions for amounts already billed (rent, utilities) post nothing of their own (7a); the apply settles those open charges.
export const OPEN_CHARGE_CATEGORIES = ["Unpaid rent", "Unpaid utilities"];
export const deductionGlKey = () => "other_income";

// Keys (file 1 Part A registry); SODA revisions (CORE-13) add :v<n> from version 2.
const ver = (version) => (Number(version) > 1 ? `:v${Number(version)}` : "");
export const depositChargeKey = (id) => `deposit:${id}:charge`;
export const depositReceivedKey = (id) => `deposit:${id}:received`;
export const depositSweepKey = (id, paymentEntryId) => `deposit:${id}:sweep:${paymentEntryId}`;
export const depositDeductionKey = (id, deductionId, version) => `deposit:${id}:ded:${deductionId}${ver(version)}`;
export const depositApplyKey = (id, version) => `deposit:${id}:apply${ver(version)}`;
export const depositReleaseKey = (id, version) => `deposit:${id}:release${ver(version)}`;
export const depositTransferKey = (id, toLeaseId) => `deposit:${id}:xfer:${toLeaseId}`;
export const depintKey = (id, period) => `depint:${id}:${period}`;
export const legacyDepintKey = (leaseId, period) => `depint:${leaseId}:${period}`;
export const depintPayKey = (id, year) => `depint-pay:${id}:${year}`;

const meta = (d) => (d?.metadata && typeof d.metadata === "object" ? d.metadata : {});
export const isOpenDeposit = (d) => DEPOSIT_OPEN_STATUSES.includes(d?.status);
export const depositKindOf = (d) => d?.kind || meta(d).depositKind || DEFAULT_DEPOSIT_KIND;
export const isInterestBearing = (d) => Boolean(d?.interest_bearing ?? d?.interestBearing);
export const isOnLedger = (d) => Boolean(d?.charge_entry_id ?? d?.chargeEntryId);
export const isDisposed = (d) => Boolean(d?.apply_entry_id ?? d?.applyEntryId) || Boolean(meta(d).disposition?.committedAt);

// Deposits a lease bills at activation: the security deposit and the pet deposit (its own record), each above zero.
export function leaseDepositsDue(lease) {
  const m = meta(lease);
  const out = [];
  const security = round2(lease?.deposit);
  const pet = round2(m.petDeposit);
  if (security > 0) out.push({ kind: DEFAULT_DEPOSIT_KIND, amount: security });
  if (pet > 0) out.push({ kind: PET_DEPOSIT_KIND, amount: pet });
  return out;
}

// Annual rate (%) for a deposit: the record's override, else the policy rate.
export function interestRateFor(deposit, policies) {
  const o = meta(deposit).interestRateOverride;
  if (o !== undefined && o !== null && String(o).trim() !== "" && Number.isFinite(Number(o))) return Number(o);
  return Number(policies?.depositInterestRate) || 0;
}

// One month of simple interest on the principal held at month end (a fraction for the final, partial month).
export const monthlyInterest = (principal, ratePct, fraction = 1) => (principal > 0 && ratePct > 0 && fraction > 0 ? round2(((principal * ratePct) / 100 / 12) * Math.min(1, fraction)) : 0);

// The month the interest job accrues on a business date: the one before it.
export const interestPeriodFor = (today) => addPeriods(periodOf(today), -1);

// Lines tagged with metadata.depositId → Map depositId → { held (2100), interest (2110), cash (deposit bank) }.
export function summarizeDepositLines(lines, acct, { depositCashIds, asOf } = {}) {
  const cashIds = depositCashIds || new Set([acct?.byKey?.get("deposit_cash")?.id].filter(Boolean));
  const out = new Map();
  for (const l of lines || []) {
    const id = l.metadata?.depositId;
    if (!id) continue;
    const date = String(l.entry_date ?? l.date ?? "");
    if (asOf && date > asOf) continue;
    const glId = l.gl_account_id ?? l.glAccountId;
    const a = acct?.byId?.get(glId);
    const dr = Number(l.debit) || 0;
    const cr = Number(l.credit) || 0;
    const b = out.get(id) || { held: 0, interest: 0, cash: 0 };
    if (a?.systemKey === "security_deposits") b.held = round2(b.held + cr - dr);
    else if (a?.systemKey === "deposit_interest_payable") b.interest = round2(b.interest + cr - dr);
    else if (cashIds.has(glId)) b.cash = round2(b.cash + dr - cr);
    out.set(id, b);
  }
  return out;
}

export const emptyBalance = () => ({ held: 0, interest: 0, cash: 0 });

// The first day a deposit's liability was on the books (its earliest tagged 2100 credit), "" when never.
export function firstHeldDate(lines, acct, depositId) {
  let first = "";
  for (const l of lines || []) {
    if (l.metadata?.depositId !== depositId || !((Number(l.credit) || 0) > 0)) continue;
    if (acct?.byId?.get(l.gl_account_id ?? l.glAccountId)?.systemKey !== "security_deposits") continue;
    const date = String(l.entry_date ?? l.date ?? "");
    if (date && (!first || date < first)) first = date;
  }
  return first;
}

// Months to accrue through `through` (YYYY-MM), from the month first held and at most `max` back; the last month is prorated to `partialTo` when given.
export function accrualPlan({ since, through, partialTo = "", max = 24 }) {
  if (!since || !through || periodOf(since) > through) return [];
  const from = periodOf(since) > addPeriods(through, -(max - 1)) ? periodOf(since) : addPeriods(through, -(max - 1));
  return periodRange(from, through).map((period) => {
    const { end, days } = periodBounds(period);
    if (partialTo && period === through && partialTo < end) return { period, asOf: partialTo, fraction: Number(partialTo.slice(8, 10)) / days };
    return { period, asOf: end, fraction: 1 };
  });
}

// Principal that earns interest: what's held less what the resident still owes on the deposit charge.
export const fundedPrincipal = (held, unpaidCharge = 0) => round2(Math.max(0, round2(held) - Math.max(0, round2(unpaidCharge))));

// Disposition plan (7a–7e) → deductions to post, the apply (held, then interest) oldest-first over open charges and deductions, refund, release, still owed.
export function planDisposition({ held = 0, interest = 0, cash = 0, items = [], deductions = [], date = "", payFromDepositBank = false }) {
  const post = [];
  const skipped = [];
  (deductions || []).forEach((d, i) => {
    const amount = round2(d?.amount);
    if (!(amount > 0)) return;
    const row = { id: String(d.id || `d${i + 1}`), label: d.label || d.category || "Deduction", category: d.category || "", amount, glAccountId: d.glAccountId || "", glKey: deductionGlKey(d.category) };
    if (OPEN_CHARGE_CATEGORIES.includes(row.category)) skipped.push({ ...row, reason: "Already an open charge — the deposit applies to it." });
    else post.push(row);
  });
  const virtual = post.map((d) => ({ entryId: `ded:${d.id}`, deductionId: d.id, date, memo: d.label, open: d.amount }));
  const open = [...(items || []).filter((i) => round2(i.open) > 0), ...virtual].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const totalOpen = round2(open.reduce((s, i) => s + round2(i.open), 0));
  const heldIn = Math.max(0, round2(held));
  const interestIn = Math.max(0, round2(interest));
  const available = round2(heldIn + interestIn);
  const applied = round2(Math.min(available, totalOpen));
  const { allocations } = allocateOldestFirst(open, applied);
  const appliedHeld = round2(Math.min(applied, heldIn));
  const appliedInterest = round2(applied - appliedHeld);
  const refundHeld = round2(heldIn - appliedHeld);
  const refundInterest = round2(interestIn - appliedInterest);
  const refund = round2(refundHeld + refundInterest);
  return {
    deductions: post,
    skipped,
    deductionTotal: round2(post.reduce((s, d) => s + d.amount, 0) + skipped.reduce((s, d) => s + d.amount, 0)),
    available,
    openBefore: round2(totalOpen - post.reduce((s, d) => s + d.amount, 0)),
    applied,
    appliedHeld,
    appliedInterest,
    allocations,
    refund,
    refundHeld,
    refundInterest,
    // Deposit-bank cash that isn't paid out as the refund goes back to operating trust (negative = fund the refund from it).
    release: round2(round2(cash) - (payFromDepositBank ? refund : 0)),
    balanceOwed: round2(totalOpen - applied),
  };
}

// Status a deposit lands in once disposed.
export function disposedStatus(plan) {
  if (!(plan.refund > 0)) return "Forfeited";
  return plan.applied > 0 ? "Partially returned" : "Returned";
}

// Money into each deposit: payments applied to its charge (posted, not reversed) and its "received" entry's own cash lines → [{ depositId, entryId, kind, amount, date, glAccountId, bankAccountId }].
export function depositCashIns({ deposits, arLines, entries, cashLines, receivedLines }) {
  const byCharge = new Map((deposits || []).filter((d) => d.charge_entry_id).map((d) => [d.charge_entry_id, d]));
  const applied = new Map();
  for (const l of arLines || []) {
    const d = byCharge.get(l.applies_to_entry_id);
    if (!d || l.entry_id === d.charge_entry_id) continue;
    const k = `${d.id}|${l.entry_id}`;
    applied.set(k, round2((applied.get(k) || 0) + (Number(l.credit) || 0) - (Number(l.debit) || 0)));
  }
  const cashOf = new Map();
  for (const l of cashLines || []) if ((Number(l.debit) || 0) > 0 && !cashOf.has(l.entry_id)) cashOf.set(l.entry_id, l);
  const rows = [];
  for (const [k, amount] of applied) {
    const [depositId, entryId] = k.split("|");
    const e = entries?.get(entryId);
    const cash = cashOf.get(entryId);
    if (!(amount > 0.004) || !e || e.source_type !== "payment" || e.status !== "posted" || e.reversal_of || e.deleted_at || !cash) continue;
    rows.push({ depositId, entryId, kind: "payment", amount: round2(amount), date: cash.entry_date || e.entry_date, glAccountId: cash.gl_account_id, bankAccountId: cash.bank_account_id || null });
  }
  for (const l of receivedLines || []) {
    const d = byCharge.get(l.entry_id);
    if (!d || l.metadata?.depositId !== d.id || !((Number(l.debit) || 0) > 0)) continue;
    rows.push({ depositId: d.id, entryId: l.entry_id, kind: "received", amount: round2(l.debit), date: l.entry_date, glAccountId: l.gl_account_id, bankAccountId: l.bank_account_id || null });
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Cash lines as banks see them (CORE-16): a 1050 Undeposited Funds line is in no bank until a posted bank deposit takes it, then it sits in that deposit's bank from the deposit date.
export function settleUndepositedCash(lines, { undepositedId, deposits, bankGl } = {}) {
  if (!undepositedId) return lines || [];
  const out = [];
  for (const l of lines || []) {
    if (l.gl_account_id !== undepositedId) {
      out.push(l);
      continue;
    }
    const d = deposits?.get(l.bank_deposit_id);
    const gl = d ? bankGl?.get(d.bank_account_id) : null;
    if (!d || d.status !== "Posted" || !gl) continue;
    out.push({ ...l, gl_account_id: gl, bank_account_id: d.bank_account_id, entry_date: d.deposit_date });
  }
  return out;
}

// "Deposits to transfer": deposit money that landed outside the deposit bank and hasn't been moved (posted = sweep keys already used).
export function sweepRows({ cashIns, depositCashIds, posted }) {
  return (cashIns || [])
    .filter((r) => !depositCashIds?.has(r.glAccountId))
    .map((r) => ({ depositId: r.depositId, paymentEntryId: r.entryId, kind: r.kind, key: depositSweepKey(r.depositId, r.entryId), amount: r.amount, date: r.date, fromGlAccountId: r.glAccountId, fromBankAccountId: r.bankAccountId }))
    .filter((r) => !posted?.has(r.key));
}

// Payments made straight into the deposit bank: deposit-bank cash the record's tagged lines don't show → Map depositId → amount.
export function directDepositCash({ cashIns, depositCashIds }) {
  const out = new Map();
  for (const r of cashIns || []) if (r.kind === "payment" && depositCashIds?.has(r.glAccountId)) out.set(r.depositId, round2((out.get(r.depositId) || 0) + r.amount));
  return out;
}
