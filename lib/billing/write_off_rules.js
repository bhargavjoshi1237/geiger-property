import { recoveryKey, round2, writeOffKey } from "@/lib/ledger/postings";
import { periodLabel } from "./periods";
import { planCreditApplications } from "./move_out_math";

// Pure write-off rules (CORE-15, safe in the browser): reasons and their collections guidance, item labels, planning a write-off or a recovery, and the written-off ledger the Delinquency report reads.

export { recoveryKey, writeOffKey };

export const WRITE_OFF_PERMISSION = "property.accounting.write_off";
export const NO_WRITE_OFF = "Your role can't write off bad debt.";
export const BAD_DEBT_KEY = "bad_debt";

// Why a balance was written off, and whether it can go to a collection agency (bankruptcy, a settlement or a death stop ordinary collection).
export const WRITE_OFF_REASONS = [
  { value: "uncollectible", label: "Uncollectible", collections: "eligible", hint: "Collection attempts failed; the resident still owes it." },
  { value: "skip", label: "Skip", collections: "eligible", hint: "The resident left without notice or a forwarding address." },
  { value: "settlement", label: "Settlement", collections: "settled", hint: "Forgiven as part of an agreed settlement — don't send it to collections." },
  { value: "bankruptcy", label: "Bankruptcy", collections: "stayed", hint: "Under a bankruptcy stay or discharge — collection must stop." },
  { value: "deceased", label: "Deceased", collections: "estate", hint: "Claim against the estate, not through a collection agency." },
  { value: "other", label: "Other", collections: "review", hint: "Explain in the note." },
];

export const COLLECTIONS_LABELS = {
  eligible: "Eligible",
  settled: "Settled — don't collect",
  stayed: "Bankruptcy — don't collect",
  estate: "Estate claim",
  review: "Review",
  none: "—",
};

export const reasonOf = (value) => WRITE_OFF_REASONS.find((r) => r.value === value) || null;
export const reasonLabel = (value) => reasonOf(value)?.label || (value ? String(value) : "Manual credit");
export const collectionsOf = (value) => reasonOf(value)?.collections || "review";

// What a reason and note need ("" when fine).
export function writeOffReasonProblem(reason, note) {
  if (!reasonOf(reason)) return `Pick a reason: ${WRITE_OFF_REASONS.map((r) => r.label).join(", ")}.`;
  if (reason === "other" && !String(note || "").trim()) return "Add a note saying why it's written off.";
  return "";
}

const sum = (list, f = (x) => x.amount) => round2((list || []).reduce((s, x) => s + (Number(f(x)) || 0), 0));

// An open item's name: rent and late fees by month, anything else by its memo.
export function itemLabel(i) {
  if (!i) return "Charge";
  if (i.kind === "rent" && i.period) return `Rent · ${periodLabel(i.period)}`;
  if (i.kind === "late_fee" && i.period) return `Late fee · ${periodLabel(i.period)}`;
  return i.memo || "Charge";
}

// Open items after the lease's unapplied credits are applied, oldest credit to oldest item (CORE-13's planner) → { items (open reduced), applications, applied }.
export function openAfterCredits(items, credits) {
  const applications = planCreditApplications(items, credits);
  const taken = new Map();
  for (const a of applications) taken.set(a.itemEntryId, round2((taken.get(a.itemEntryId) || 0) + a.amount));
  const out = (items || []).map((i) => ({ ...i, openBefore: round2(i.open), open: round2(i.open - (taken.get(i.entryId) || 0)) })).filter((i) => i.open > 0.004);
  return { items: out, applications, applied: sum(applications) };
}

// The charges a write-off takes → { items: [{ entryId, amount, date, memo, kind, period }], total } or { error }; `requested` is [{ entryId, amount? }] (no amount = all that's open) or "all".
export function planWriteOff(openItems, requested) {
  const open = new Map((openItems || []).map((i) => [i.entryId, i]));
  const asked = requested === "all" ? [...open.values()].map((i) => ({ entryId: i.entryId })) : Array.isArray(requested) ? requested : [];
  if (!asked.length) return { error: requested === "all" ? "Nothing on this lease is open to write off." : "Pick at least one open charge to write off." };
  const seen = new Set();
  const items = [];
  for (const r of asked) {
    const item = open.get(r?.entryId);
    if (!item) return { error: "A charge you picked isn't open any more — reload and try again." };
    if (seen.has(item.entryId)) return { error: "A charge is listed twice." };
    seen.add(item.entryId);
    const amount = r.amount === undefined || r.amount === null || r.amount === "" ? round2(item.open) : round2(r.amount);
    if (!(amount > 0)) return { error: `Enter an amount above zero for ${itemLabel(item)}.` };
    if (amount - round2(item.open) > 0.004) return { error: `${itemLabel(item)} has only ${round2(item.open).toFixed(2)} open.` };
    items.push({ entryId: item.entryId, amount, date: item.date || "", memo: itemLabel(item), kind: item.kind || "", period: item.period || "" });
  }
  items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { items, total: sum(items) };
}

// Written off and not yet reinstated per item, from the AR lines of write_off entries (voids included, so they net out) → Map itemEntryId → amount.
export function writtenOffOutstanding(arLines) {
  const out = new Map();
  for (const l of arLines || []) {
    const id = l.appliesToEntryId ?? l.applies_to_entry_id;
    if (!id) continue;
    out.set(id, round2((out.get(id) || 0) + (Number(l.credit) || 0) - (Number(l.debit) || 0)));
  }
  for (const [id, v] of out) if (!(v > 0.004)) out.delete(id);
  return out;
}

// What a recovery reinstates, oldest written-off item first → { amount, items: [{ entryId, amount, date, memo }] } or { error }.
export function planRecovery({ outstanding = [], unapplied = 0, amount } = {}) {
  const owed = sum(outstanding);
  if (!(owed > 0)) return { error: "Nothing on this lease is written off, so there's nothing to recover." };
  if (!(round2(unapplied) > 0)) return { error: "This payment is already applied to charges — there's no unapplied credit left to recover with." };
  const cap = round2(Math.min(owed, round2(unapplied)));
  const want = amount === undefined || amount === null || amount === "" ? cap : round2(amount);
  if (!(want > 0)) return { error: "Enter an amount above zero." };
  if (want - cap > 0.004) return { error: `At most ${cap.toFixed(2)} can be recovered from this payment (its unapplied credit, up to what's written off).` };
  let left = want;
  const items = [];
  for (const o of [...outstanding].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))) {
    if (left <= 0) break;
    const take = round2(Math.min(left, round2(o.amount)));
    if (take <= 0) continue;
    items.push({ entryId: o.entryId, amount: take, date: o.date || "", memo: o.memo || "" });
    left = round2(left - take);
  }
  return { amount: want, items };
}

// The next free sequence for a key family, given every key already used (soft-deleted and void ones count: the unique index still holds them).
export function nextSeq(usedKeys, base) {
  const used = new Set(usedKeys || []);
  let n = 1;
  while (used.has(n > 1 ? `${base}:${n}` : base)) n += 1;
  return n;
}

const dayOf = (d) => String(d || "").slice(0, 10);

// Bad debt per lease from the ledger as of a date (the Delinquency report's Written off view): 5800 lines tagged { recovery } are recoveries, any other 5800 line is written off; voids net out.
// → { rows: [{ id, leaseId, tenantId, unitId, propertyId, writtenOff, recovered, net, lastWrittenOff, delinquentSince, reason, reasons, collections, items }], recoveries: [{ id, entryId, date, leaseId, tenantId, propertyId, amount, paymentEntryId, memo }] }.
export function writtenOffLedger(lines, accounts, { asOf } = {}) {
  const bad = accounts?.byKey?.get(BAD_DEBT_KEY)?.id;
  const rows = new Map();
  const recoveries = [];
  if (!bad) return { rows: [], recoveries };
  for (const l of lines || []) {
    if (l.glAccountId !== bad) continue;
    const d = dayOf(l.date);
    if (asOf && d > asOf) continue;
    const key = l.leaseId ? `lease:${l.leaseId}` : l.tenantId ? `tenant:${l.tenantId}` : "";
    if (!key) continue;
    const row = rows.get(key) || { id: key, leaseId: l.leaseId || "", tenantId: l.tenantId || "", unitId: l.unitId || "", propertyId: l.propertyId || "", writtenOff: 0, recovered: 0, lastWrittenOff: "", delinquentSince: "", reason: "", reasons: [], items: 0 };
    for (const k of ["tenantId", "unitId", "propertyId"]) row[k] = row[k] || l[k] || "";
    const net = (Number(l.debit) || 0) - (Number(l.credit) || 0);
    const e = l.entry || {};
    const live = e.status !== "void" && !e.reversalOf;
    if (l.metadata?.recovery) {
      row.recovered += -net;
      if (live) recoveries.push({ id: l.id || `${l.entryId}:${recoveries.length}`, entryId: l.entryId, date: d, leaseId: row.leaseId, tenantId: row.tenantId, propertyId: row.propertyId, amount: round2(-net), paymentEntryId: l.metadata.recovery, memo: e.memo || l.memo || "" });
    } else {
      row.writtenOff += net;
      if (live && net > 0) {
        const m = e.metadata || {};
        if (!row.lastWrittenOff || d >= row.lastWrittenOff) {
          row.lastWrittenOff = d;
          row.reason = m.reason || (e.sourceType === "write_off" ? "other" : "");
        }
        if (m.reason && !row.reasons.includes(m.reason)) row.reasons.push(m.reason);
        const items = Array.isArray(m.items) ? m.items : [];
        row.items += items.length || 1;
        for (const i of items.length ? items : [{ date: d }]) if (i.date && (!row.delinquentSince || dayOf(i.date) < row.delinquentSince)) row.delinquentSince = dayOf(i.date);
      }
    }
    rows.set(key, row);
  }
  const out = [...rows.values()]
    .map((r) => {
      const writtenOff = round2(r.writtenOff);
      const recovered = round2(r.recovered);
      const collections = r.reasons.some((x) => collectionsOf(x) !== "eligible") ? collectionsOf(r.reasons.find((x) => collectionsOf(x) !== "eligible")) : r.reasons.length ? "eligible" : "review";
      return { ...r, writtenOff, recovered, net: round2(writtenOff - recovered), collections };
    })
    .filter((r) => Math.abs(r.writtenOff) > 0.004 || Math.abs(r.recovered) > 0.004)
    .sort((a, b) => b.net - a.net);
  recoveries.sort((a, b) => b.date.localeCompare(a.date));
  return { rows: out, recoveries };
}
