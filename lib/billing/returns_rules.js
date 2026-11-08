import { openDateFor } from "@/lib/ledger/periods";
import { round2 } from "./periods";

// Pure returned-payment rules (CORE-17): reasons, keys, which payments can be returned, where their money sits, the date checks and the tenant's return count; safe in the browser.

export const RETURN_REASONS = [
  { value: "nsf", label: "Insufficient funds (NSF)" },
  { value: "account_closed", label: "Account closed" },
  { value: "stop_payment", label: "Stop payment" },
];
export const reasonLabel = (value) => RETURN_REASONS.find((r) => r.value === value)?.label || "Returned";

// Idempotency keys reserved for a returned office payment (registry: core_partA_conventions).
export const nsfKey = (paymentEntryId) => `nsf:${paymentEntryId}`;
export const nsfBankKey = (paymentEntryId) => `nsf-bank:${paymentEntryId}`;

const metaOf = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});

// The tenant's returned-payment count; the old hand-typed nsfCount stands in until the first return is recorded.
export function returnedPaymentsOf(tenant) {
  const m = metaOf(tenant);
  const n = Number(m.returnedPayments ?? m.nsfCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Does the next return switch the tenant to certified funds (online-payment setting certifiedAfterReturns, 0 = never)?
export const reachesCertified = (count, threshold) => Number(threshold) > 0 && Number(count) >= Number(threshold);

// Online payments are reversed by the processor's webhook, never by hand.
export const isOnlinePayment = (entry) => Boolean(metaOf(entry).onlinePaymentId) || String(entry?.idempotency_key ?? entry?.idempotencyKey ?? "").startsWith("stripe:");

// Why a ledger entry can't be returned here ("" when it can): a live office payment only.
export function returnBlocker(entry) {
  if (!entry || entry.deleted_at) return "Payment not found.";
  const source = entry.source_type ?? entry.sourceType;
  if (source !== "payment" || (entry.reversal_of ?? entry.reversalOf)) return "Only a payment can be returned.";
  if (isOnlinePayment(entry)) return "Online payments are reversed automatically when the processor returns them.";
  if (entry.status === "void") return "This payment is already void.";
  return "";
}

// Where a payment's money is now → { kind: "undeposited" | "deposited" | "bank", bankAccountId, bankDepositId }; only "deposited" needs the bank correction (a direct-to-bank payment's own void takes the money out of its bank).
export function moneyLocation({ cashLine, undepositedGlId, deposit }) {
  if (!cashLine) return { kind: "bank", bankAccountId: null, bankDepositId: null };
  const inUndeposited = Boolean(undepositedGlId) && (cashLine.gl_account_id ?? cashLine.glAccountId) === undepositedGlId;
  const depositId = cashLine.bank_deposit_id ?? cashLine.bankDepositId ?? null;
  if (inUndeposited && depositId && deposit?.status === "Posted") return { kind: "deposited", bankAccountId: deposit.bank_account_id ?? deposit.bankAccountId ?? null, bankDepositId: depositId };
  if (inUndeposited) return { kind: "undeposited", bankAccountId: null, bankDepositId: null };
  return { kind: "bank", bankAccountId: cashLine.bank_account_id ?? cashLine.bankAccountId ?? null, bankDepositId: null };
}

// What's wrong with a returned date ("" when fine): not before the payment, not before its bank deposit, not in the future.
export function returnDateProblem({ returnedOn, paymentDate, depositDate, today }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(returnedOn || ""))) return "Enter the date the payment came back.";
  if (paymentDate && returnedOn < paymentDate) return "A payment can't come back before it was received.";
  if (depositDate && returnedOn < depositDate) return "The bank can't return a check before it was deposited.";
  if (today && returnedOn > today) return "The returned date can't be in the future.";
  return "";
}

// The date the return posts on: the returned date, or the first open day after a closed period (CORE-40 openDateFor).
export const postingDate = (returnedOn, lockedThrough) => openDateFor(returnedOn, lockedThrough);

// The charges a payment settled (its AR credit lines) → [{ entryId, amount }]; the void re-opens them.
export function reopenedCharges(lines, arGlIds) {
  const ar = new Set(arGlIds);
  const out = new Map();
  for (const l of lines || []) {
    const gl = l.gl_account_id ?? l.glAccountId;
    const applies = l.applies_to_entry_id ?? l.appliesToEntryId;
    if (!ar.has(gl) || !(Number(l.credit) > 0) || !applies) continue;
    out.set(applies, round2((out.get(applies) || 0) + Number(l.credit)));
  }
  return [...out].map(([entryId, amount]) => ({ entryId, amount }));
}
