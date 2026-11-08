import { creditApplicationKey } from "@/lib/ledger/postings";
import { addDays, addPeriods, daysBetween, maxDate, periodLabel, periodOf, round2 } from "./periods";
import { OPEN_CHARGE_CATEGORIES, deductionGlKey } from "./deposits_math";

// Final account (CORE-13) pure rules, browser-safe: keys, SODA state, the credit-application plan, the preview's cascade, deposit rules and warnings.

export const FINAL_ACCOUNT_STATUSES = ["Notice given", "Terminated", "Ended"];
export const SODA_DRAFT = "Draft";
export const SODA_COMMITTED = "Committed";
export const RULE_KIND = "deposit_disposition";
export const MAX_ACCEL_MONTHS = 24;
export const ACCELERATED_RENT_OPTIONS = [
  { value: "allowed", label: "Allowed" },
  { value: "mitigation_only", label: "Only actual losses (duty to re-let)" },
  { value: "capped_fee", label: "Only a capped early-termination fee" },
  { value: "prohibited", label: "Not allowed" },
  { value: "unknown", label: "Not checked" },
];
export const MAIL_CLASS_OPTIONS = [
  { value: "none", label: "Not required" },
  { value: "first_class", label: "First-class mail" },
  { value: "certified", label: "Certified mail" },
];
export const EMAIL_ALLOWED_OPTIONS = [
  { value: "unknown", label: "Not checked" },
  { value: "never", label: "Not accepted" },
  { value: "by_agreement", label: "Only by written agreement" },
  { value: "yes", label: "Accepted" },
];
export const DAYS_FROM_OPTIONS = [
  { value: "move_out", label: "Move-out" },
  { value: "termination_and_vacate", label: "Tenancy ends and the resident leaves" },
  { value: "surrender", label: "Keys returned" },
  { value: "forwarding_address", label: "Forwarding address received" },
];
export const RULE_DISCLAIMER = "You maintain these rules. Geiger applies the numbers you enter; it doesn't track law changes and isn't legal advice.";

// Keys (file 1 registry): accelerated rent carries the SODA version from v1; the early-termination fee keeps the Terminate wizard's key.
export const sodaAccelKey = (depositId, period, version) => `soda:${depositId}:accel:${period}:v${Math.max(1, Number(version) || 1)}`;
export const earlyTermKey = (leaseId) => `early-term:${leaseId}`;
export { creditApplicationKey };

const meta = (r) => (r?.metadata && typeof r.metadata === "object" ? r.metadata : {});
const sum = (list, f = (x) => x) => round2((list || []).reduce((s, x) => s + (Number(f(x)) || 0), 0));

// A deposit's SODA state → { status, version, committedAt, committedBy, … } or null; a CORE-04 disposal without one reads as committed v1.
export function sodaOf(deposit) {
  const m = meta(deposit);
  if (m.soda && typeof m.soda === "object") return { ...m.soda, status: m.soda.status || SODA_DRAFT, version: Number(m.soda.version) || 1 };
  if (m.disposition?.committedAt) return { status: SODA_COMMITTED, version: Number(m.disposition.version) || 1, committedAt: m.disposition.committedAt, committedBy: m.disposition.committedBy || null, legacy: true };
  return null;
}
export const isCommitted = (soda) => soda?.status === SODA_COMMITTED;

// Move-out charges from the wizard / the deposit's deductions → [{ id, label, category, amount, posts, glKey, … }] (amounts above zero; ids stable by position when missing).
export function normalizeCharges(list) {
  return (Array.isArray(list) ? list : [])
    .map((c, i) => ({
      id: String(c?.id || `c${i + 1}`),
      label: String(c?.label || c?.category || "Move-out charge").trim(),
      category: String(c?.category || "").trim(),
      amount: round2(c?.amount),
      notes: String(c?.notes || "").trim(),
      invoiceNumber: String(c?.invoiceNumber || "").trim(),
      glAccountId: c?.glAccountId || "",
      ...(c?.inspectionId ? { inspectionId: c.inspectionId } : {}),
    }))
    .filter((c) => c.amount > 0)
    .map((c) => ({ ...c, posts: !OPEN_CHARGE_CATEGORIES.includes(c.category), glKey: deductionGlKey(c.category) }));
}

// Months of accelerated rent after the move-out month (at most MAX_ACCEL_MONTHS) → ["YYYY-MM", …].
export function accelPeriods(moveOut, months) {
  const n = Math.max(0, Math.min(MAX_ACCEL_MONTHS, Math.floor(Number(months) || 0)));
  if (!moveOut || !n) return [];
  const first = addPeriods(periodOf(moveOut), 1);
  return Array.from({ length: n }, (_, i) => addPeriods(first, i));
}

// Accelerated rent rows (months × the monthly amount) → [{ period, label, amount }].
export const accelRows = (moveOut, accelerate) => {
  const amount = round2(accelerate?.amount);
  if (!(amount > 0)) return [];
  return accelPeriods(moveOut, accelerate?.months).map((period) => ({ period, label: `Accelerated rent · ${periodLabel(period)}`, amount }));
};

// Months left on the term after the move-out month (accelerated rent past it is flagged).
export function monthsLeftOnTerm(moveOut, termEnd) {
  if (!moveOut || !termEnd || termEnd <= moveOut) return 0;
  let n = 0;
  for (let p = addPeriods(periodOf(moveOut), 1); p <= periodOf(termEnd) && n < 120; p = addPeriods(p, 1)) n += 1;
  return n;
}

// Unapplied credits to open items, oldest credit to oldest item → [{ creditEntryId, itemEntryId, amount }].
export function planCreditApplications(items, sources) {
  const open = (items || [])
    .filter((i) => i?.entryId && round2(i.open) > 0)
    .map((i) => ({ entryId: i.entryId, date: i.date || "", open: round2(i.open) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const out = [];
  const credits = [...(sources || [])].filter((s) => s?.entryId && round2(s.amount) > 0).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  for (const s of credits) {
    let left = round2(s.amount);
    for (const it of open) {
      if (left <= 0) break;
      if (it.entryId === s.entryId || it.open <= 0) continue;
      const take = round2(Math.min(left, it.open));
      if (take <= 0) continue;
      out.push({ creditEntryId: s.entryId, itemEntryId: it.entryId, amount: take });
      it.open = round2(it.open - take);
      left = round2(left - take);
    }
  }
  return out;
}

// Which open items a close-out credit line settles: a rent true-up its month's rent, a recurring-charge credit its occurrence.
function closeOutTargets(line, items) {
  const key = String(line.key || "");
  if (line.kind === "rent") return items.filter((i) => i.kind === "rent" && i.period === line.period);
  const rc = key.match(/^rc-adj:([^:]+):(\d{4}-\d{2}-\d{2}):/);
  if (rc) return items.filter((i) => i.key === `rc:${rc[1]}:${rc[2]}`);
  return [];
}

// The preview's cascade (spec steps 1–6) on the lease's current open items and credits → what each step moves and the result.
export function finalAccountPlan({ items = [], credits = [], closeOut = null, planDeferred = 0, charges = [], accel = [], earlyTermFee = 0, deposits = [] } = {}) {
  const open = items.filter((i) => round2(i.open) > 0).map((i) => ({ ...i, open: round2(i.open) }));
  const openBefore = sum(open, (i) => i.open);
  let pool = sum(credits, (c) => c.amount);
  const creditsBefore = pool;
  for (const [n, l] of (closeOut?.lines || []).entries()) {
    if (l.kind === "hap" || !round2(l.amount)) continue;
    if (l.amount > 0) {
      open.push({ entryId: `closeout:${n}`, kind: l.kind, period: l.period || "", date: "", open: round2(l.amount), memo: l.label });
      continue;
    }
    let left = round2(-l.amount);
    for (const t of closeOutTargets(l, open)) {
      const take = round2(Math.min(left, t.open));
      t.open = round2(t.open - take);
      left = round2(left - take);
      if (left <= 0) break;
    }
    pool = round2(pool + left);
  }
  const posting = charges.filter((c) => c.posts);
  const added = round2(Math.max(0, round2(planDeferred)) + sum(posting, (c) => c.amount) + sum(accel, (a) => a.amount) + Math.max(0, round2(earlyTermFee)));
  const openAfterCharges = round2(sum(open, (i) => i.open) + added);
  const creditsApplied = round2(Math.min(pool, openAfterCharges));
  let remaining = round2(openAfterCharges - creditsApplied);
  const creditLeft = round2(pool - creditsApplied);
  const perDeposit = deposits.map((d) => {
    const available = round2(Math.max(0, round2(d.held)) + Math.max(0, round2(d.interest)));
    const applied = round2(Math.min(available, remaining));
    remaining = round2(remaining - applied);
    return { id: d.id, kind: d.kind || "", held: round2(d.held), interest: round2(d.interest), available, applied, refund: round2(available - applied), creditRefund: 0 };
  });
  // A credit left after every open item is paid out with the first deposit's refund.
  if (perDeposit.length && creditLeft > 0) {
    perDeposit[0].creditRefund = creditLeft;
    perDeposit[0].refund = round2(perDeposit[0].refund + creditLeft);
  }
  return {
    openBefore,
    creditsBefore,
    closeOut: { credit: round2(closeOut?.credit), charge: round2(closeOut?.charge) },
    planDeferred: Math.max(0, round2(planDeferred)),
    chargesTotal: sum(posting, (c) => c.amount),
    accelTotal: sum(accel, (a) => a.amount),
    earlyTermFee: Math.max(0, round2(earlyTermFee)),
    openAfterCharges,
    credits: pool,
    creditsApplied,
    creditRefund: perDeposit.length ? creditLeft : 0,
    creditLeft: perDeposit.length ? 0 : creditLeft,
    available: sum(perDeposit, (d) => d.available),
    applied: sum(perDeposit, (d) => d.applied),
    refund: sum(perDeposit, (d) => d.refund),
    balanceOwed: remaining,
    deposits: perDeposit,
  };
}

// A revise's preview from the committed result: the charges change by their difference; the credits and deposits re-apply to the new total.
export function revisePlan(result, oldCharges, newCharges) {
  const r = result || {};
  const available = round2(r.available);
  const before = round2(round2(r.applied) + round2(r.balanceOwed) - round2(r.creditRefund));
  const open = round2(before - round2(oldCharges) + round2(newCharges));
  const applied = round2(Math.min(available, Math.max(0, open)));
  const creditRefund = open < 0 ? round2(-open) : 0;
  return { available, open: Math.max(0, open), applied, refund: round2(available - applied + creditRefund), creditRefund, balanceOwed: round2(Math.max(0, open) - applied), chargesBefore: round2(oldCharges), chargesAfter: round2(newCharges) };
}

// What the move-out charges of a final account add up to (posting deductions, accelerated rent, the fee it posted).
export const chargesTotal = ({ charges = [], accel = [], earlyTerm = null } = {}) =>
  round2(sum(normalizeCharges(charges).filter((c) => c.posts), (c) => c.amount) + sum(accel, (a) => a.amount) + (earlyTerm?.include ? round2(earlyTerm.fee) : 0));

// The deposit rule for a lease: active rows of RULE_KIND for its state, the most specific first (property, then city, then statewide), in effect on `asOf`.
export function depositRuleFor(rules, { stateCode = "", city = "", propertyId = "", asOf = "" } = {}) {
  const code = String(stateCode || "").toUpperCase();
  const town = String(city || "").trim().toLowerCase();
  const live = (rules || []).filter(
    (r) =>
      (r.kind || RULE_KIND) === RULE_KIND &&
      (r.status || "active") === "active" &&
      String(r.jurisdictionCode || r.jurisdiction_code || "").toUpperCase() === code &&
      (!asOf || !(r.effectiveFrom || r.effective_from) || String(r.effectiveFrom || r.effective_from) <= asOf) &&
      (!asOf || !(r.effectiveTo || r.effective_to) || String(r.effectiveTo || r.effective_to) >= asOf),
  );
  const rank = (r) => {
    const prop = r.propertyId || r.property_id || "";
    const loc = String(r.locality || "").trim().toLowerCase();
    if (prop) return prop === propertyId ? 0 : 9;
    if (loc) return loc === town ? 1 : 9;
    return 2;
  };
  return live.filter((r) => rank(r) < 9).sort((a, b) => rank(a) - rank(b))[0] || null;
}

// Rule params with their defaults.
export function ruleParams(rule) {
  const p = rule?.params && typeof rule.params === "object" ? rule.params : {};
  const mailClass = p.mailRequired === true ? "first_class" : ["first_class", "certified"].includes(p.mailRequired) ? p.mailRequired : "none";
  return {
    returnDays: Number(p.returnDays) > 0 ? Number(p.returnDays) : null,
    daysFrom: p.daysFrom || "move_out",
    mailRequired: mailClass !== "none",
    mailClass,
    emailAllowed: p.emailAllowed || "unknown",
    requiresForwardingAddress: Boolean(p.requiresForwardingAddress),
    acceleratedRent: p.acceleratedRent || "unknown",
    receiptsOver: Number(p.receiptsOver) > 0 ? Number(p.receiptsOver) : null,
    wording: String(p.wording || "").trim(),
    retentionYears: Number(p.retentionYears) > 0 ? Number(p.retentionYears) : null,
    penaltyNote: String(p.penaltyNote || "").trim(),
  };
}

// The return deadline: the deposit's own, else move-out + the rule's days, else + the policy's.
export function returnDeadline({ moveOut, depositReturnDue = "", rule = null, policyDays = 30 }) {
  if (depositReturnDue) return depositReturnDue;
  if (!moveOut) return "";
  return addDays(moveOut, ruleParams(rule).returnDays || Number(policyDays) || 30);
}

// Warn-only checks for the wizard → [{ tone: "warning" | "info", text }].
export function finalAccountWarnings({ today, moveOut, returnDue, rule, stateName = "", accelMonths = 0, termEnd = "", email = "", address = "", charges = [], notOnLedger = [] }) {
  const out = [];
  const p = ruleParams(rule);
  const where = stateName ? `${stateName} rule` : "Your deposit rule";
  if (moveOut && today && moveOut > today) out.push({ tone: "info", text: `The resident hasn't moved out yet (move-out ${moveOut}); committing now posts the final account dated then.` });
  if (returnDue && today && today > returnDue) out.push({ tone: "warning", text: `The return deadline (${returnDue}) passed ${daysBetween(returnDue, today)} days ago — send the statement and refund now.` });
  if (accelMonths > 0) {
    if (p.acceleratedRent === "prohibited") out.push({ tone: "warning", text: `${where}: accelerated rent isn't allowed against a deposit.` });
    else if (p.acceleratedRent === "mitigation_only") out.push({ tone: "warning", text: `${where}: only rent actually lost before the unit re-lets can be charged (duty to mitigate).` });
    else if (p.acceleratedRent === "capped_fee") out.push({ tone: "warning", text: `${where}: only an agreed, capped early-termination fee applies — check the lease before charging future rent.` });
    const left = monthsLeftOnTerm(moveOut, termEnd);
    if (termEnd && accelMonths > left) out.push({ tone: "warning", text: `${accelMonths} months of accelerated rent runs past the term end (${termEnd}, ${left} left).` });
  }
  if (p.receiptsOver) {
    const missing = charges.filter((c) => c.posts && c.amount > p.receiptsOver && !c.invoiceNumber);
    if (missing.length) out.push({ tone: "warning", text: `${where}: attach receipts or invoices for charges above ${p.receiptsOver} (${missing.map((c) => c.label).join(", ")}).` });
  }
  if (!email) out.push({ tone: "warning", text: "No forwarding email on file — the statement and letter are flagged Mail required." });
  else if (p.mailRequired) out.push({ tone: "info", text: `${where}: a ${p.mailClass === "certified" ? "certified-mail" : "mailed"} copy is required — the letter is flagged Mail required as well as emailed.` });
  else if (p.emailAllowed === "never" || p.emailAllowed === "by_agreement") out.push({ tone: "info", text: `${where}: email counts as delivery ${p.emailAllowed === "never" ? "only alongside a mailed copy" : "only when the resident agreed to it in writing"}.` });
  if (!address) out.push({ tone: "warning", text: p.requiresForwardingAddress ? `${where}: the deadline waits for a forwarding address — ask the resident for one.` : "No forwarding address on file — add one before mailing the letter." });
  for (const d of notOnLedger) out.push({ tone: "warning", text: `${d} isn't on the ledger, so it's left out — bill it or record it received first.` });
  return out;
}

// Whether the letter must be mailed: no email to send it to, or the rule requires a mailed copy.
export const mailRequiredFor = ({ email, rule }) => !email || ruleParams(rule).mailRequired;

// The statement window: move-in to the later of the posting date and the lease's last AR line.
export const finalStatementRange = ({ moveIn, postDate, lastLineDate }) => ({ from: moveIn || postDate, to: maxDate(postDate, lastLineDate || "") });
