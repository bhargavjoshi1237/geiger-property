import { addDays, addPeriods, daysBetween, isoDate, maxDate, periodLabel, periodOf, periodRange, round2 } from "./periods";
import { billingWindow, chargeDateFor, leaseFacts, meta, pick } from "./rent";
import { rentSplit } from "@/lib/housing/hap";
import { buildCredit } from "@/lib/ledger/postings";

// Pure concession math (CORE-05): which periods a lease concession credits and how much, capped at the tenant's billed rent; no I/O, safe in the browser.
// Keys (file 1 registry): conc:<concessionId>:<YYYY-MM> (a period's credit), conc:<concessionId>:once (a one-time credit), conc-adj:<concessionId>:<YYYY-MM>:<n> (true-ups, either direction).

export const CONCESSION_STATUSES = ["Active", "Used", "Expired"];
// Types that post credits; waived_fee only marks its linked move-in charge Waived.
export const POSTING_TYPES = ["free_month", "amount_off", "percent_off", "one_time"];
// Types whose value can be spread evenly over the term (effective-rent style).
export const SPREADABLE_TYPES = ["free_month", "one_time"];
// Types that may name the periods they apply to.
export const PERIOD_LIST_TYPES = ["free_month", "amount_off", "percent_off"];
// Fallback term when a lease has no end date (month-to-month).
export const DEFAULT_TERM_MONTHS = 12;

const PERIOD = /^\d{4}-\d{2}$/;
const isOn = (v) => v === true || v === "true";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const monthsBetween = (a, b) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};

// A period list from an array or a comma-separated string → unique "YYYY-MM", oldest first.
export function normalizePeriods(value) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  return [...new Set(raw.map((p) => String(p || "").trim().slice(0, 7)).filter((p) => PERIOD.test(p)))].sort();
}

// A concession record_item (snake row or camel view model) → the fields the math reads.
export function concessionFacts(row) {
  if (!row) return null;
  if (row.__concession) return row;
  const m = meta(row);
  const get = (k) => row[k] ?? m[k];
  return {
    __concession: true,
    id: row.id,
    leaseId: pick(row, "ownerId", "owner_id") || "",
    name: row.name || "",
    status: row.status || "Active",
    type: String(get("concessionType") || "").trim(),
    amount: Math.max(0, round2(row.amount)),
    months: Math.max(0, num(get("months"))),
    startsOn: isoDate(pick(row, "startsOn", "starts_on")),
    endsOn: isoDate(pick(row, "endsOn", "ends_on")),
    periods: normalizePeriods(get("periods")),
    spread: SPREADABLE_TYPES.includes(String(get("concessionType") || "")) && isOn(get("spread")),
    waivesItemId: get("waivesItemId") || "",
    sourceSpecialId: get("sourceSpecialId") || "",
    createdAt: String(pick(row, "createdAt", "created_at") || ""),
    metadata: m,
  };
}

// A lease's term in whole months (term start → end), else null for month-to-month.
export function leaseTermMonths(lease) {
  const l = leaseFacts(lease);
  const start = l?.termStart || l?.moveInDate;
  if (!start || !l.termEnd || l.termEnd < start) return null;
  return Math.max(1, Math.round(daysBetween(start, addDays(l.termEnd, 1)) / 30.4375));
}

// Where a concession starts: its own date (never before the lease starts), else the lease start; a one-time credit falls back to move-in.
export function concessionStartDate(concession, lease) {
  const c = concessionFacts(concession);
  const l = leaseFacts(lease);
  const start = billingWindow(lease).start;
  const own = c.startsOn || (c.type === "one_time" && !c.spread ? l.moveInDate : "");
  return maxDate(own || start, start) || "";
}

// The periods a concession covers → { first, periods: [..] | null (open-ended), last, count }.
export function concessionRange(concession, lease) {
  const c = concessionFacts(concession);
  const l = leaseFacts(lease);
  const first = periodOf(concessionStartDate(c, lease));
  const span = (n) => (first ? periodRange(first, addPeriods(first, Math.max(1, n) - 1)) : []);
  const bounded = (periods) => ({ first: periods[0] || first, periods, last: periods[periods.length - 1] || null, count: periods.length });
  if (!first && !c.periods.length) return { first: "", periods: [], last: null, count: 0 };
  if (c.type === "one_time" && !c.spread) return bounded(first ? [first] : []);
  if (c.periods.length) return bounded(c.periods);
  if (c.spread) return bounded(span(leaseTermMonths(lease) || DEFAULT_TERM_MONTHS));
  if (c.type === "free_month") return bounded(span(Math.ceil(c.months || 1)));
  const end = c.endsOn ? periodOf(c.endsOn) : c.months > 0 ? addPeriods(first, Math.ceil(c.months) - 1) : l.termEnd ? periodOf(l.termEnd) : null;
  if (!end) return { first, periods: null, last: null, count: 0 };
  return bounded(end >= first ? periodRange(first, end) : []);
}

// Total value of a spread concession: its amount, else (free months) months × the tenant's monthly share at the start.
export function spreadTotal(concession, lease) {
  const c = concessionFacts(concession);
  if (c.amount > 0) return c.amount;
  if (c.type !== "free_month") return 0;
  return round2((c.months || 1) * rentSplit(lease, null, concessionStartDate(c, lease)).tenant);
}

// The credit a concession gives one period, capped at `rentBilledForPeriod` (the tenant's billed rent, HOUS-01); a one-time credit's first piece lands on its start period.
export function concessionCredits(concession, period, rentBilledForPeriod, lease) {
  const c = concessionFacts(concession);
  const rent = Math.max(0, round2(rentBilledForPeriod));
  if (!POSTING_TYPES.includes(c.type) || rent <= 0 || !PERIOD.test(String(period || ""))) return 0;
  const r = concessionRange(c, lease);
  const idx = r.periods ? r.periods.indexOf(period) : period >= r.first ? monthsBetween(r.first, period) : -1;
  if (idx < 0) return 0;
  let amount = 0;
  if (c.spread) {
    const total = spreadTotal(c, lease);
    const base = round2(total / r.count);
    amount = idx === r.count - 1 ? round2(total - base * (r.count - 1)) : base;
  } else if (c.type === "one_time") amount = c.amount;
  else if (c.type === "free_month") amount = c.periods.length ? rent : round2(rent * Math.min(1, (c.months || 1) - idx));
  else if (c.type === "amount_off") amount = c.amount;
  else if (c.type === "percent_off") amount = round2((rent * Math.min(100, c.amount)) / 100);
  return Math.max(0, Math.min(round2(amount), rent));
}

// Oldest first, so a later concession only gets what earlier ones leave of a period's rent.
const byAge = (a, b) => a.createdAt.localeCompare(b.createdAt) || String(a.id).localeCompare(String(b.id));

// Every concession on a lease against the tenant's billed rent per period → Map concessionId → { slots: Map period → { amount, once }, pending, last, waiting, bounded }.
// opts: floor (no credit for a period charged before billing start), dueDay, posted (Map concessionId → Set of periods already credited; an Expired concession only keeps those).
export function planLeaseConcessions(concessions, lease, rentBy, { floor = "", dueDay = 1, posted = new Map() } = {}) {
  const window = billingWindow(lease);
  const eligible = (p) => !floor || chargeDateFor(p, window, dueDay) >= floor;
  const lastBillable = window.end ? periodOf(window.end) : null;
  const left = new Map([...(rentBy || new Map()).entries()].map(([p, v]) => [p, Math.max(0, round2(v))]));
  const billed = [...left.keys()].sort();
  const out = new Map();
  const list = (concessions || []).map(concessionFacts).filter((c) => c && POSTING_TYPES.includes(c.type)).sort(byAge);
  for (const c of list) {
    const keep = posted.get(c.id) || new Set();
    const allowed = (p) => eligible(p) && (c.status !== "Expired" || keep.has(p));
    const slots = new Map();
    const take = (p, amount, once = false) => {
      const a = Math.min(round2(amount), left.get(p) || 0);
      if (a <= 0) return 0;
      slots.set(p, { amount: a, once });
      left.set(p, round2(left.get(p) - a));
      return a;
    };
    const r = concessionRange(c, lease);
    let pending = 0;
    let last = r.last && lastBillable && r.last > lastBillable ? lastBillable : r.last;
    if (c.type === "one_time" && !c.spread) {
      // A one-time credit: the first piece on its start period, anything over that period's rent carries to the next billed periods.
      if (r.first && eligible(r.first)) {
        pending = c.amount;
        for (const p of billed.filter((x) => x >= r.first)) {
          if (pending <= 0) break;
          if (allowed(p)) pending = round2(pending - take(p, pending, !slots.size));
        }
      }
      last = pending > 0.004 ? null : [...slots.keys()].pop() || r.first;
    } else {
      const candidates = r.periods ? r.periods.filter((p) => left.has(p)) : billed.filter((p) => p >= r.first);
      for (const p of candidates) if (allowed(p)) take(p, concessionCredits(c, p, left.get(p), lease));
    }
    const bounded = Boolean(r.periods) || (c.type === "one_time" && !c.spread);
    // Still waiting while a period of its range (from billing start) has no billed rent yet.
    const waiting = pending > 0.004 || !bounded || Boolean(r.periods && r.periods.some((p) => eligible(p) && (!lastBillable || p <= lastBillable) && !rentBy?.has(p)));
    out.set(c.id, { slots, pending: round2(pending), last, waiting, bounded });
  }
  return out;
}

// --- Keys and posted credits ------------------------------------------------------

export const concKey = (concessionId, period) => `conc:${concessionId}:${period}`;
export const concOnceKey = (concessionId) => `conc:${concessionId}:once`;
export const concAdjKey = (concessionId, period, n) => `conc-adj:${concessionId}:${period}:${n}`;

// Concession key → { kind: "period" | "once" | "adj", concessionId, period?, n? }, else null.
export function parseConcessionKey(key) {
  const parts = String(key || "").split(":");
  if (parts[0] === "conc" && parts.length === 3 && parts[2] === "once") return { kind: "once", concessionId: parts[1] };
  if (parts[0] === "conc" && parts.length === 3 && PERIOD.test(parts[2])) return { kind: "period", concessionId: parts[1], period: parts[2] };
  if (parts[0] === "conc-adj" && parts.length === 4 && PERIOD.test(parts[2])) return { kind: "adj", concessionId: parts[1], period: parts[2], n: Number(parts[3]) || 0 };
  return null;
}

export const emptyConcessionSlot = () => ({ total: 0, entries: [], mainKeyTaken: false, maxAdj: 0 });

// Posted concession entries (rows carry credit = metadata->credit, period = metadata->>period) → Map concessionId → { slots: Map period → slot, onceTaken, maxAdj }.
export function summarizeConcessionEntries(rows) {
  const out = new Map();
  const seen = new Set();
  for (const e of rows || []) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const k = parseConcessionKey(e.idempotency_key);
    if (!k) continue;
    const period = k.period || String(e.period || "").slice(0, 7) || periodOf(e.entry_date);
    const c = out.get(k.concessionId) || { slots: new Map(), onceTaken: false };
    out.set(k.concessionId, c);
    const slot = c.slots.get(period) || emptyConcessionSlot();
    c.slots.set(period, slot);
    if (k.kind === "once") c.onceTaken = true;
    if (k.kind === "period") slot.mainKeyTaken = true;
    if (k.kind === "adj") slot.maxAdj = Math.max(slot.maxAdj, k.n);
    if (e.deleted_at || e.status !== "posted" || e.reversal_of) continue;
    const credit = e.credit === null || e.credit === undefined || e.credit === "" ? round2(e.total) : round2(e.credit);
    slot.total = round2(slot.total + credit);
    slot.entries.push({ id: e.id, key: e.idempotency_key, kind: k.kind, date: e.entry_date, credit });
  }
  return out;
}

// Periods a concession has credited (any live entry) → Map concessionId → Set.
export function creditedPeriods(ledger) {
  return new Map([...(ledger || new Map()).entries()].map(([id, c]) => [id, new Set([...c.slots.entries()].filter(([, s]) => s.entries.length).map(([p]) => p))]));
}

// --- Ledger builders -----------------------------------------------------------------

// Period or one-time credit: Dr 4050 Concessions & Credits / Cr AR applied via input.allocations (the rest unapplied); source_type concession.
export function buildConcessionCredit(input, acct) {
  return buildCredit({ ...input, sourceType: "concession", glAccountId: input.glAccountId || acct.byKey.get("concessions")?.id }, acct);
}

// Concession reduced after a true-up: Dr AR (applied via input.allocations, the rest open) / Cr 4050.
export function buildConcessionReversal(input, acct) {
  const amount = round2(input.amount);
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  const ar = acct.byKey.get("accounts_receivable")?.id;
  const contra = acct.byKey.get("concessions")?.id;
  if (!ar) return { error: "No Accounts Receivable account in the chart of accounts." };
  if (!contra) return { error: "No concessions account in the chart of accounts." };
  const allocations = (input.allocations || []).filter((a) => round2(a.amount) > 0);
  const lines = allocations.map((a) => ({ glAccountId: ar, debit: round2(a.amount), appliesToEntryId: a.entryId }));
  const rest = round2(amount - allocations.reduce((s, a) => s + round2(a.amount), 0));
  if (rest < -0.004) return { error: "Allocations exceed the adjustment." };
  if (rest > 0) lines.push({ glAccountId: ar, debit: rest });
  lines.push({ glAccountId: contra, credit: amount });
  const dims = {};
  for (const k of ["propertyId", "unitId", "leaseId", "tenantId"]) if (input[k]) dims[k] = input[k];
  return {
    entry: { date: input.date, memo: input.memo || "Concession adjustment", sourceType: "concession", sourceId: input.sourceId || "", idempotencyKey: input.idempotencyKey || "", metadata: input.metadata || {}, ...dims },
    lines,
  };
}

// --- Previews, listing specials and renewals ---------------------------------------------

// Credits at move-in: each concession's share of the first period's tenant rent → [{ id, name, amount }].
export function moveInCredits(concessions, lease, period, firstRent) {
  const plans = planLeaseConcessions(concessions, lease, new Map([[period, firstRent]]));
  return (concessions || [])
    .map(concessionFacts)
    .map((c) => ({ id: c.id, name: c.name || TYPE_LABELS[c.type] || "Concession", amount: plans.get(c.id)?.slots.get(period)?.amount || 0 }))
    .filter((c) => c.amount > 0);
}

// Per-period schedule rows for the Concessions tab: billed rent where billed, projected rent ahead; state posted | due (posts next billing run) | scheduled.
export function concessionSchedule(concessions, lease, { billed = new Map(), projected = new Map(), ledger = new Map(), floor = "", dueDay = 1 } = {}) {
  const rentBy = new Map([...projected.entries(), ...billed.entries()]);
  const plans = planLeaseConcessions(concessions, lease, rentBy, { floor, dueDay, posted: creditedPeriods(ledger) });
  const rows = [];
  for (const c of (concessions || []).map(concessionFacts).filter((x) => POSTING_TYPES.includes(x.type))) {
    const plan = plans.get(c.id);
    const posted = ledger.get(c.id)?.slots || new Map();
    const periods = [...new Set([...plan.slots.keys(), ...[...posted.entries()].filter(([, s]) => s.entries.length).map(([p]) => p)])].sort();
    for (const period of periods) {
      const credit = plan.slots.get(period)?.amount || 0;
      const done = posted.get(period)?.total || 0;
      const state = !billed.has(period) ? "scheduled" : Math.abs(credit - done) < 0.005 ? "posted" : "due";
      rows.push({ concessionId: c.id, name: c.name || TYPE_LABELS[c.type], period, label: periodLabel(period), rent: round2(rentBy.get(period) || 0), credit, posted: done, state, once: Boolean(plan.slots.get(period)?.once) });
    }
  }
  return rows.sort((a, b) => a.period.localeCompare(b.period) || a.name.localeCompare(b.name));
}

const TYPE_LABELS = { free_month: "Free month(s)", amount_off: "Amount off", percent_off: "Percent off", one_time: "One-time credit", waived_fee: "Waived fee" };
const money = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// One-line description of a concession's terms, e.g. "10% off for 3 months".
export function concessionSummary(concession) {
  const c = concessionFacts(concession);
  const months = c.months > 0 ? ` for ${c.months} month${c.months === 1 ? "" : "s"}` : " for the term";
  if (c.spread) return `${money(c.amount)} spread over the term`;
  if (c.type === "free_month") return `${c.months || 1} month${(c.months || 1) === 1 ? "" : "s"} free`;
  if (c.type === "amount_off") return `${money(c.amount)} off${months}`;
  if (c.type === "percent_off") return `${c.amount}% off${months}`;
  if (c.type === "one_time") return `${money(c.amount)} one-time credit`;
  if (c.type === "waived_fee") return "Waived fee";
  return "";
}

const specialType = (s) => s?.specialType || meta(s).specialType || "";

// Is a listing special live on a date (not Inactive, started, not expired)?
export function specialIsActive(special, today) {
  const starts = isoDate(pick(special, "startsOn", "starts_on"));
  const ends = isoDate(pick(special, "endsOn", "ends_on"));
  return (special?.status || "Active") !== "Inactive" && (!starts || starts <= today) && (!ends || ends >= today);
}

// A listing special → the lease concession it becomes ({ values } for a record_item), { skip: reason } when its minimum term isn't met, or null when it doesn't map.
export function specialToConcession(special, lease) {
  const l = leaseFacts(lease);
  const value = num(special?.amount);
  const type = specialType(special);
  const m = meta(special);
  if (!(value > 0) || !["Months free", "Weeks free", "Dollars off", "Percent off"].includes(type)) return null;
  const name = special.name || type;
  const minTerm = num(m.minTermMonths ?? special.minTermMonths);
  const term = leaseTermMonths(lease);
  if (minTerm > 0 && (!term || term < minTerm)) return { skip: `The listing special “${name}” needs a ${minTerm}-month term, so it wasn't added.` };
  const metadata = { sourceSpecialId: special.id, sourceListingId: pick(special, "ownerId", "owner_id") || "", reason: "Listing special" };
  const base = { name, status: "Active", startsOn: l.termStart || l.moveInDate || null, endsOn: null };
  if (type === "Months free") return { values: { ...base, amount: 0, metadata: { ...metadata, concessionType: "free_month", months: value } } };
  if (type === "Weeks free") {
    const spread = isOn(m.spread ?? special.spread);
    return { values: { ...base, amount: round2((l.rent * 12 * value) / 52), metadata: { ...metadata, concessionType: "one_time", ...(spread ? { spread: true } : {}) } } };
  }
  if (type === "Dollars off") return { values: { ...base, amount: round2(value), metadata: { ...metadata, concessionType: "one_time" } } };
  return { values: { ...base, amount: Math.min(100, value), endsOn: l.termEnd || null, metadata: { ...metadata, concessionType: "percent_off", months: term || 0 } } };
}

// The renewal's structured incentive (metadata concessionType / concessionAmount / concessionMonths) → the new lease's concession values, else null.
export function renewalConcession(renewal, lease) {
  const m = meta(renewal);
  const type = String(m.concessionType || "");
  if (!POSTING_TYPES.includes(type)) return null;
  const amount = Math.max(0, round2(m.concessionAmount));
  const months = Math.max(0, num(m.concessionMonths));
  if (type === "free_month" ? !(months > 0) : !(amount > 0)) return null;
  const l = leaseFacts(lease);
  const c = { concessionType: type, amount, months };
  const name = String(m.concession || "").trim() || concessionSummary({ ...c, metadata: c, id: "" });
  return {
    name,
    status: "Active",
    startsOn: l.termStart || null,
    endsOn: null,
    amount: type === "free_month" ? 0 : type === "percent_off" ? Math.min(100, amount) : amount,
    metadata: { concessionType: type, ...(months ? { months } : {}), reason: "Renewal incentive", sourceRenewalId: renewal.id },
  };
}

// Renewal offer values → the renewal metadata the accept step reads (concession note plus the structured type, amount and months).
export function renewalIncentiveMeta(v = {}) {
  const type = POSTING_TYPES.includes(v.concessionType) ? v.concessionType : "";
  return {
    concession: v.concession || "",
    ...(type ? { concessionType: type, concessionAmount: Number(v.concessionAmount) || 0, concessionMonths: Number(v.concessionMonths) || 0 } : {}),
  };
}
