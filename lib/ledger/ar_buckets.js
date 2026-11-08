import { round2 } from "./postings";

// Tenant AR buckets (CORE-07), pure: the JS mirror of property.ledger_ar_monthly and the one "billed" definition the
// Overview trend and the collection-rate metric share. Gross sides by entry source type, like the view.

export const AR_BUCKET_SOURCES = {
  charged: ["charge", "late_fee", "deposit_held"],
  collected: ["payment"],
  credited: ["concession", "credit", "write_off", "deposit_return"],
  transferred: ["adjustment"],
};
// Deposit charges are held funds, not billed income; credit memos (concessions, courtesy credits, downward rent true-ups) reduce what was billed.
export const DEPOSIT_CHARGE_SOURCES = ["deposit_held"];
export const BILLING_CREDIT_SOURCES = ["credit", "concession"];

export const AR_BUCKETS = ["charged", "collected", "credited", "transferred", "net", "depositsCharged", "billingCredits"];
export const emptyBuckets = () => Object.fromEntries(AR_BUCKETS.map((k) => [k, 0]));

// One AR line's share of each bucket.
export function arLineBuckets(sourceType, debit, credit) {
  const s = sourceType || "adjustment";
  const d = Number(debit) || 0;
  const c = Number(credit) || 0;
  return {
    charged: AR_BUCKET_SOURCES.charged.includes(s) ? d : 0,
    collected: AR_BUCKET_SOURCES.collected.includes(s) ? c : 0,
    credited: AR_BUCKET_SOURCES.credited.includes(s) ? c : 0,
    transferred: AR_BUCKET_SOURCES.transferred.includes(s) ? d - c : 0,
    net: d - c,
    depositsCharged: DEPOSIT_CHARGE_SOURCES.includes(s) ? d : 0,
    billingCredits: BILLING_CREDIT_SOURCES.includes(s) ? c : 0,
  };
}

// Bucket totals added together (rounded to cents).
export function addBuckets(into, b) {
  const out = { ...emptyBuckets(), ...into };
  for (const k of AR_BUCKETS) out[k] = round2(out[k] + (Number(b?.[k]) || 0));
  return out;
}

// Billed: tenant charges and fees less credit memos and downward true-ups, deposit charges excluded.
export const billedOf = (b) => round2((Number(b?.charged) || 0) - (Number(b?.depositsCharged) || 0) - (Number(b?.billingCredits) || 0));

// One line's signed effect on billed (0 when it doesn't count).
export const billedAmount = (sourceType, debit, credit) => billedOf(arLineBuckets(sourceType, debit, credit));
