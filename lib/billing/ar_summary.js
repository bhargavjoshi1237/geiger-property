import { openItems } from "@/lib/ledger/postings";
import { maxDate, periodOf, round2 } from "./periods";
import { parseRentKey } from "./keys";
import { emptyLateHistory, parseLate2Key, parseLateKey } from "./late_fee_rules";
import { parsePlanKey } from "./payment_plan_rules";

// Pure lease receivable math (CORE-06): one lease's tenant AR lines → balance, typed open items, credit, last payment and late-fee history; shared by CORE-07/12/13/14/19.

const live = (e) => Boolean(e) && e.status !== "void" && !e.reversalOf;

// What an AR entry is → { kind: "rent" | "late_fee" | "installment" | "transfer" | <source type>, period, second? }; a transfer is resolved to its original item by the loader; `second` marks a CORE-19 second late fee.
export function classifyEntry(entry) {
  const e = entry || {};
  const key = e.idempotencyKey || "";
  const rent = parseRentKey(key);
  if (rent) return { kind: "rent", period: rent.period || periodOf(e.date) };
  const late = parseLateKey(key);
  if (late) return { kind: "late_fee", period: late.period };
  const late2 = parseLate2Key(key);
  if (late2) return { kind: "late_fee", period: late2.period, second: true };
  // A payment-plan installment re-billed from 1210 (CORE-14), in its due month.
  if (parsePlanKey(key)?.kind === "inst") return { kind: "installment", period: periodOf(e.date) };
  if (e.metadata?.transfer) return { kind: "transfer", period: periodOf(e.metadata.originalDate || e.date) };
  return { kind: e.sourceType || "adjustment", period: periodOf(e.date) };
}

// The transferred-from entry of a carried item's entry (CORE-01 buildArTransfer), else "".
export const transferSourceOf = (entry) => (entry?.metadata?.transfer ? entry.metadata.itemEntryId || "" : "");

// Late history merged with what predecessor leases charged for months whose rent was carried here (so a carried month never gets a second first fee, nor a second late2).
export function mergeInheritedLateFees(own, inherited) {
  const out = {};
  const copy = (h) => ({ ...h, keys: [...h.keys] });
  for (const [period, h] of Object.entries(own || {})) out[period] = { ...copy(h), ...(h.second ? { second: copy(h.second) } : {}) };
  const add = (h, x) => {
    h.inherited = round2(h.inherited + (Number(x.posted) || 0));
    h.waived = h.waived || Boolean(x.waived);
    h.posted = round2(h.own + h.inherited);
  };
  for (const [period, list] of Object.entries(inherited || {})) {
    const h = out[period] || (out[period] = emptyLateHistory());
    for (const x of list) {
      add(h, x);
      if (x.second) add((h.second ||= emptyLateHistory()), x.second);
    }
  }
  return out;
}

// One lease's tenant AR → { balance, credit, items, oldestOpenDate, lastPaymentDate, lateFeesPosted (both fees), lateFees }.
// `lines` carry `entry` (normalized); `origins` maps a carried item's entry id → its original { entryId, leaseId, kind, period }; `lateFees` is the merged history by month.
export function summarizeReceivable(lines, accounts, { origins, lateFees = {} } = {}) {
  const ar = (lines || []).filter((l) => accounts.byId.get(l.glAccountId)?.subtype === "receivable");
  const balance = round2(ar.reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0));
  const entries = new Map(ar.map((l) => [l.entryId, l.entry || null]));
  const items = openItems(ar, accounts, "receivable").map((i) => {
    const own = classifyEntry(entries.get(i.entryId));
    const origin = own.kind === "transfer" ? origins?.get(i.entryId) : null;
    const typed = { ...i, key: entries.get(i.entryId)?.idempotencyKey || "", kind: origin?.kind || own.kind, period: origin?.period || own.period };
    return origin ? { ...typed, carried: true, fromLeaseId: origin.leaseId, fromEntryId: origin.entryId } : typed;
  });
  const credit = round2(items.reduce((s, i) => s + i.open, 0) - balance);
  let lastPaymentDate = null;
  for (const l of ar) if (l.credit > 0 && live(l.entry) && l.entry.sourceType === "payment") lastPaymentDate = maxDate(lastPaymentDate, l.date) || null;
  return {
    balance,
    credit: credit > 0.004 ? credit : 0,
    items,
    oldestOpenDate: items[0]?.date || null,
    lastPaymentDate,
    lateFeesPosted: Object.fromEntries(Object.entries(lateFees).map(([p, h]) => [p, round2(h.posted + (h.second?.posted || 0))])),
    lateFees,
  };
}
