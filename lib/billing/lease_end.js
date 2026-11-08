import { addDays, isoDate, periodLabel, periodOf, round2 } from "./periods";
import { leaseFacts, rentForPeriod } from "./rent";

// Pure move-out and holdover math (CORE-02): the final period's rent, a close-out's summary and holdover detection; no I/O, safe in the browser.

// Live statuses a lease can hold over in; Active / Expiring soon ones may roll to month-to-month, the rest are only flagged.
export const HOLDOVER_STATUSES = ["Active", "Expiring soon", "Notice given", "Eviction"];
const CONVERTIBLE = ["Active", "Expiring soon"];

const flag = (v) => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);

// The final period's rent under a window that ends → { period, amount, from, to, prorated } or null.
export function finalRent(steps, window, policies = {}) {
  if (!window?.end || !window.start || window.end < window.start) return null;
  const period = periodOf(window.end);
  const r = rentForPeriod(steps, period, window, policies);
  return { period, amount: r.total, from: r.from, to: r.to, prorated: !r.full };
}

// A fixed-term lease still live past its term end with no accepted renewal → { since, termEnd, convert, premium } or null.
// It rolls to month-to-month (convert) when the lease's autoMtm (else the autoMonthToMonth policy) is on, it's Active / Expiring soon with no move-out date and not marked "Do not renew"; otherwise it's flagged.
export function holdoverOf(lease, { today, policies = {}, renewed = false } = {}) {
  const l = leaseFacts(lease);
  if (!l || !today || renewed || !HOLDOVER_STATUSES.includes(l.status)) return null;
  if (l.termType === "mtm" || !l.termEnd || l.termEnd >= today || isoDate(l.metadata.billingEndsOn)) return null;
  const auto = flag(l.metadata.autoMtm) ?? flag(policies.autoMonthToMonth) ?? true;
  const convert = auto && CONVERTIBLE.includes(l.status) && !l.moveOutDate && l.metadata.renewalOption !== "Do not renew";
  // The lease's own premium when set, else the policy's (as the lease document states it).
  const premium = Math.max(0, round2(Number(l.metadata.mtmPremium) || Number(policies.mtmPremium) || 0));
  return { since: addDays(l.termEnd, 1), termEnd: l.termEnd, convert, premium: convert ? premium : 0 };
}

const RENT_KINDS = { rent: "rent", charge: "rent", credit: "rent", hap: "hap", "hap-charge": "hap", "hap-credit": "hap" };

// A close-out's rent results (billLeaseRent: posted entries or planned deltas) and charge entries → { credit, charge, lines: [{ kind, label, amount, key? }] }.
export function closeOutSummary(rentResults = [], chargeEntries = []) {
  const lines = [];
  for (const r of rentResults) {
    const label = periodLabel(r.period);
    if (r.planned) {
      if (Math.abs(r.planned.hap) >= 0.005) lines.push({ kind: "hap", label: `Housing assistance · ${label}`, amount: round2(r.planned.hap) });
      if (Math.abs(r.planned.tenant) >= 0.005) lines.push({ kind: "rent", label: `Rent · ${label}`, amount: round2(r.planned.tenant) });
      continue;
    }
    for (const e of r.entries || []) {
      const kind = RENT_KINDS[e.kind] || "rent";
      lines.push({ kind, label: `${kind === "hap" ? "Housing assistance" : "Rent"} · ${label}`, amount: round2(e.amount), key: e.key });
    }
  }
  for (const e of chargeEntries) lines.push({ kind: "charge", label: `${e.name || "Recurring charge"} · ${e.date || ""}`.trim(), amount: round2(e.amount), key: e.key });
  const credit = round2(lines.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0));
  const charge = round2(lines.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0));
  return { credit, charge, lines };
}
