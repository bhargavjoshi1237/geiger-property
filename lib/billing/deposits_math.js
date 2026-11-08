import { allocateOldestFirst } from "@/lib/ledger/postings";
import { addPeriods, periodOf, round2 } from "./periods";

// Pure deposit math (CORE-04), importable by the client: idempotency keys, per-record balances, interest, the
// disposition plan and the "deposits to transfer" queue. Server I/O lives in lib/billing/deposits.js.

export const DEPOSIT_OPEN_STATUSES = ["Pending", "Held", "Awaiting disposition"];
export const DEPOSIT_BANK_TYPE = "Security deposit";
export const DEFAULT_DEPOSIT_KIND = "Security deposit";
export const PET_DEPOSIT_KIND = "Pet deposit";
export const INTEREST_PAYOUTS = ["at_move_out", "annual_credit"];

// Deductions that are already open charges post nothing of their own (7a); the apply settles them.
export const OPEN_CHARGE_CATEGORIES = ["Unpaid rent"];
const DEDUCTION_GL_KEYS = { "Unpaid utilities": "utility_income" };
export const deductionGlKey = (category) => DEDUCTION_GL_KEYS[category] || "other_income";

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

// One month of simple interest on the principal held at month end.
export const monthlyInterest = (principal, ratePct) => (principal > 0 && ratePct > 0 ? round2((principal * ratePct) / 100 / 12) : 0);

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

// Principal that earns interest: what's held less what the resident still owes on the deposit charge.
export const fundedPrincipal = (held, unpaidCharge = 0) => round2(Math.max(0, round2(held) - Math.max(0, round2(unpaidCharge))));

// Disposition plan (7a–7e) → deductions to post, the apply (held first, then interest) oldest-first over open charges
// and the deductions, the refund, the release out of the deposit bank and what the resident still owes.
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

// "Deposits to transfer" (sweeps): payments applied to a deposit's charge whose cash landed outside the deposit bank.
// deposits [{ id, charge_entry_id, ... }]; arLines = AR lines applying to those charges; entries Map id → entry row;
// cashLines = the payments' cash lines; posted = keys already used.
export function sweepRows({ deposits, arLines, entries, cashLines, depositCashIds, posted }) {
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
    const [depositId, paymentEntryId] = k.split("|");
    const e = entries?.get(paymentEntryId);
    const cash = cashOf.get(paymentEntryId);
    if (!(amount > 0.004) || !e || e.source_type !== "payment" || e.status !== "posted" || e.reversal_of || e.deleted_at || !cash) continue;
    if (depositCashIds?.has(cash.gl_account_id)) continue;
    const key = depositSweepKey(depositId, paymentEntryId);
    if (posted?.has(key)) continue;
    rows.push({ depositId, paymentEntryId, key, amount: round2(amount), date: e.entry_date, fromGlAccountId: cash.gl_account_id, fromBankAccountId: cash.bank_account_id || null });
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
