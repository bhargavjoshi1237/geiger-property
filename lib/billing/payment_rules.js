import { allocateOldestFirst } from "@/lib/ledger/postings";
import { periodLabel, round2 } from "./periods";

// Pure office-payment rules (CORE-11): methods, tenant restrictions, where the cash lands, allocations, receipt dedupe keys and written-receipt laws; safe in the browser.

export const PAYMENT_METHODS = ["Check", "Cash", "Money order", "Cashier's check", "ACH", "Card", "Wire"];
// What a "certified funds only" resident may pay with.
export const CERTIFIED_METHODS = ["Cash", "Money order", "Cashier's check", "Wire"];
// Paper payments: they land in 1050 Undeposited Funds until a bank deposit takes them (billing_settings.useUndepositedFunds, on by default, CORE-16).
export const PAPER_METHODS = ["Check", "Cash", "Money order", "Cashier's check"];
export const OVERRIDE_PERMISSION = "property.accounting.override_restrictions";
export const HOUSING_AUTHORITY = "housing_authority";

export const payKey = (requestId) => `pay:${requestId}`;
// Receipt email dedupe (notification_sends): one per entry and address; a resend gets its own `:resend:<timestamp>` key.
export const receiptDedupeKey = (entryId, email, resendAt = "") =>
  `receipt:${entryId}:${String(email || "").trim().toLowerCase()}${resendAt ? `:resend:${resendAt}` : ""}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID.test(String(v || ""));

const metaOf = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});
const on = (v) => v === true || v === "true";
const usd = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isEvicting = (lease) => Boolean(lease) && (on(metaOf(lease).evictionActive) || String(lease.status || "").toLowerCase() === "eviction");

// Tenant restrictions an office payment breaks → [{ key, label, message }]; housing authority payments carry none (they aren't the resident's funds).
export function paymentRestrictions({ tenant, lease, policies = {}, method, amount, balance = 0, payer = "tenant" }) {
  if (payer === HOUSING_AUTHORITY) return [];
  const tm = metaOf(tenant);
  const out = [];
  if (policies.blockAfterEviction !== false && isEvicting(lease)) {
    out.push({ key: "eviction", label: "Eviction in progress", message: "This lease is in eviction; accepting a payment can affect the case." });
  }
  if ((on(tm.restrictCertifiedOnly) || on(policies.certifiedFundsOnly)) && !CERTIFIED_METHODS.includes(method)) {
    out.push({ key: "certified_only", label: "Certified funds only", message: `Only certified funds (cash, money order, cashier's check or wire) are accepted from this resident, not ${String(method || "this method").toLowerCase()}.` });
  }
  if (on(tm.restrictNoChecks) && method === "Check") {
    out.push({ key: "no_checks", label: "No personal checks", message: "Personal checks aren't accepted from this resident." });
  }
  const noPartial = policies.allowPartialPayments === false || on(tm.restrictNoPartial);
  if (noPartial && balance > 0 && round2(amount) + 0.005 < balance) {
    out.push({ key: "no_partial", label: "No partial payments", message: `Partial payments aren't accepted — the balance is ${usd(balance)}.` });
  }
  return out;
}

// Where an office payment's cash lands → { systemKey } (1050 or default trust cash) or { bankAccountId } (that bank's cash GL).
export function cashRoute({ method, bankAccountId, undeposited, useUndepositedFunds }) {
  if (undeposited === true || (useUndepositedFunds === true && PAPER_METHODS.includes(method))) return { systemKey: "undeposited_funds" };
  if (bankAccountId) return { bankAccountId };
  return { systemKey: "trust_cash" };
}

// Allocations for a payment: explicit ones checked against the open items, else oldest first → { allocations, unapplied } | { error }.
export function planAllocations(items, amount, explicit) {
  const total = round2(amount);
  if (!Array.isArray(explicit)) return allocateOldestFirst(items, total);
  const open = new Map((items || []).map((i) => [i.entryId, i.open]));
  const merged = new Map();
  for (const a of explicit) {
    const value = round2(a?.amount);
    if (!(value > 0)) continue;
    if (!open.has(a.entryId)) return { error: "An allocation points at a charge that isn't open on this ledger." };
    merged.set(a.entryId, round2((merged.get(a.entryId) || 0) + value));
  }
  for (const [entryId, value] of merged) if (value - open.get(entryId) > 0.005) return { error: "An allocation is more than the charge's open amount." };
  const allocations = [...merged].map(([entryId, value]) => ({ entryId, amount: value }));
  const applied = round2(allocations.reduce((s, a) => s + a.amount, 0));
  if (applied - total > 0.005) return { error: "Allocations exceed the payment amount." };
  return { allocations, unapplied: round2(total - applied) };
}

// What an allocated charge was for: "Rent · November 2026", else its memo.
export function chargeLabel({ kind, period, memo } = {}) {
  if (kind === "rent" && period) return `Rent · ${periodLabel(period)}`;
  if (kind === "late_fee" && period) return `Late fee · ${periodLabel(period)}`;
  return memo || "Charge";
}

// Written-receipt laws checked on the state legislature sites (2026-11-08); review with counsel before relying on them.
export const RECEIPT_LAWS = {
  NY: { name: "New York", citation: "N.Y. Real Prop. Law § 235-e", url: "https://www.nysenate.gov/legislation/laws/RPP/235-E", covers: "all_but_personal_check" },
  WA: { name: "Washington", citation: "RCW 59.18.063", url: "https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.063", covers: "cash" },
  MN: { name: "Minnesota", citation: "Minn. Stat. § 504B.118", url: "https://www.revisor.mn.gov/statutes/cite/504B.118", covers: "cash" },
  MD: { name: "Maryland", citation: "Md. Code, Real Prop. § 8-205", url: "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=8-205&enactments=false", covers: "cash" },
};

// "NY" / "New York" / "ny." → "NY" for the states above, else the trimmed upper-case input.
export function stateCodeOf(raw) {
  const v = String(raw || "").trim().replace(/\.$/, "");
  const hit = Object.entries(RECEIPT_LAWS).find(([code, law]) => code === v.toUpperCase() || law.name.toLowerCase() === v.toLowerCase());
  return hit ? hit[0] : v.toUpperCase();
}

// Must this payment get a written receipt? Cash always does (several states require it); New York adds every form but the tenant's personal check.
export function receiptRequirement({ state, method }) {
  const law = RECEIPT_LAWS[stateCodeOf(state)] || null;
  const cite = law ? { citation: law.citation, url: law.url } : { citation: "", url: "" };
  if (law?.covers === "all_but_personal_check" && method && method !== "Check") {
    return { required: true, ...cite, reason: `${law.citation} requires a written receipt for rent paid by ${String(method).toLowerCase()}.` };
  }
  if (method === "Cash") return { required: true, ...cite, reason: law ? `${law.citation} requires a written receipt for cash.` : "Cash payments always get a written receipt." };
  return { required: false, citation: "", url: "", reason: "" };
}
