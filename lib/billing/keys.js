// Idempotency keys for billing postings (file 1 Part A registry); every key is unique per project.

export const rentKey = (leaseId, period) => `rent:${leaseId}:${period}`;
export const rentAdjKey = (leaseId, period, n) => `rent-adj:${leaseId}:${period}:${n}`;
export const xferKey = (newLeaseId, itemEntryId) => `xfer:${newLeaseId}:${itemEntryId}`;
export const xferCreditKey = (newLeaseId) => `xfer:${newLeaseId}:credit`;
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
