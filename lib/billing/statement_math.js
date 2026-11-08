import { SOURCE_LABELS, runningLedger } from "@/lib/ledger/postings";
import { depositsHeldByLease, receivableAging } from "@/lib/reports/ledger_math";
import { formatIso } from "@/lib/reports/periods";
import { money } from "@/lib/reports/format";
import { classifyEntry } from "./ar_summary";
import { chargeLabel } from "./payment_rules";
import { addPeriods, dueDateFor, periodLabel, periodOf, round2 } from "./periods";

// Resident statement math (CORE-12), pure and browser-safe: one lease's tenant AR (and deposit) lines → opening, activity with a running
// balance, totals, closing, aging and deposits held, plus the report sections the staff screen, the HTML and the portal all render.

const BUCKETS = ["b0", "b31", "b61", "b91"];
export const AGING_LABELS = { b0: "0–30 days", b31: "31–60 days", b61: "61–90 days", b91: "90+ days" };
const net = (l) => (Number(l.debit) || 0) - (Number(l.credit) || 0);
// An AR-only re-allocation (a credit applied to a charge, CORE-13) moves no balance, so it isn't an activity row.
const isAllocation = (r) => Math.abs(r.amount) < 0.005 && r.lines.length > 1 && r.lines.every((l) => l.appliesToEntryId);

// What an activity row says: rent and late fees by month, reversals and voids flagged.
function describe(row) {
  const entry = row.lines[0]?.entry || {};
  const { kind, period } = classifyEntry(entry);
  const base = ["rent", "late_fee"].includes(kind) ? chargeLabel({ kind, period }) : row.memo || SOURCE_LABELS[row.sourceType] || "Entry";
  if (row.reversalOf) return `Reversal · ${base}`;
  return row.status === "void" ? `${base} (voided)` : base;
}

// Aging at the period end with any unapplied credit taken off the oldest bucket first, so the buckets sum to a positive closing balance.
export function statementAging(arLines, accounts, to, closing) {
  if (!(closing > 0.004)) return null;
  const row = receivableAging(arLines, accounts, to)[0] || {};
  const b = Object.fromEntries(BUCKETS.map((k) => [k, round2(row[k])]));
  let credit = round2(BUCKETS.reduce((s, k) => s + b[k], 0) - closing);
  for (const k of [...BUCKETS].reverse()) {
    if (credit <= 0) break;
    const take = round2(Math.min(credit, b[k]));
    b[k] = round2(b[k] - take);
    credit = round2(credit - take);
  }
  // A balance with no open charge behind it (e.g. a carried debit) ages as current.
  const short = round2(closing - BUCKETS.reduce((s, k) => s + b[k], 0));
  if (short > 0) b.b0 = round2(b.b0 + short);
  return { ...b, total: closing };
}

// One lease's statement figures for [from, to] from its AR and deposit lines (each with `entry`); receipts maps payment entry id → receipt number.
export function statementMath({ lines = [], accounts, leaseId, from, to, receipts = new Map() }) {
  const subtypeOf = (l) => accounts.byId.get(l.glAccountId)?.subtype;
  const ar = lines.filter((l) => subtypeOf(l) === "receivable" && l.date <= to);
  const opening = round2(ar.filter((l) => l.date < from).reduce((s, l) => s + net(l), 0));
  const closing = round2(ar.reduce((s, l) => s + net(l), 0));
  const rows = runningLedger("lease", ar, accounts).filter((r) => r.date >= from);
  // A void and its reversal both inside the window net to zero and are left off.
  const inWindow = new Set(rows.map((r) => r.entryId));
  const hidden = new Set();
  for (const r of rows) if (r.reversalOf && inWindow.has(r.reversalOf)) hidden.add(r.entryId).add(r.reversalOf);
  let balance = opening;
  let charges = 0;
  let payments = 0;
  let credits = 0;
  const activity = [];
  for (const r of rows) {
    if (hidden.has(r.entryId) || isAllocation(r)) continue;
    balance = round2(balance + r.amount);
    charges += r.charge;
    if (r.sourceType === "payment") payments += r.payment;
    else credits += r.payment;
    activity.push({ id: r.entryId, entryId: r.entryId, date: r.date, description: describe(r), type: SOURCE_LABELS[r.sourceType] || "Entry", sourceType: r.sourceType, reference: receipts.get(r.entryId) || "", charge: r.charge || null, payment: r.payment || null, balance });
  }
  const deposits = depositsHeldByLease(lines, accounts, to, {}).get(leaseId) || 0;
  return {
    opening,
    charges: round2(charges),
    payments: round2(payments),
    credits: round2(credits),
    closing,
    amountDue: closing > 0 ? closing : 0,
    credit: closing < 0 ? round2(-closing) : 0,
    activity,
    aging: statementAging(ar, accounts, to, closing),
    depositsHeld: round2(deposits),
  };
}

// The rent due date after the statement period (policy due day), when the closing balance is due.
export const statementDueDate = (to, dueDay = 1) => dueDateFor(addPeriods(periodOf(to), 1), dueDay);

// "October 2026", or "Nov 1 – Nov 8, 2026 (to date)" for the current month, or the bare range for a custom window.
export function statementPeriodLabel({ period, from, to, toDate }) {
  if (period && !toDate) return periodLabel(period);
  const range = `${formatIso(from, { month: "short", day: "numeric" })} – ${formatIso(to)}`;
  return toDate ? `${range} (to date)` : range;
}

// The closing line in words: what's owed, a credit, or paid in full.
export const closingText = (st) => (st.closing < 0 ? `${money(st.credit)} credit on account` : st.closing > 0 ? money(st.closing) : "Paid in full");

// Headline figures (report stats, the HTML's tiles).
export function statementStats(st) {
  return [
    { label: "Opening balance", value: money(st.opening), footer: `On ${formatIso(st.from)}` },
    { label: "Charges", value: money(st.charges) },
    { label: "Payments & credits", value: money(round2(st.payments + st.credits)) },
    { label: st.closing < 0 ? "Credit on account" : "Closing balance", value: st.closing < 0 ? money(st.credit) : money(st.closing), footer: `On ${formatIso(st.to)}` },
    { label: "Amount due", value: money(st.amountDue), footer: st.amountDue > 0 ? (st.dueDate ? `By ${formatIso(st.dueDate)}` : "") : "Nothing due" },
  ];
}

// Report sections shared by the Report Library, the statement page and the print batch.
export function statementSections(st) {
  const sections = [
    {
      key: "summary",
      title: "Summary",
      description: statementPeriodLabel(st),
      kind: "statement",
      span: "half",
      columns: [
        { key: "label", header: "Line" },
        { key: "amount", header: "Amount", format: "money" },
      ],
      rows: [
        { id: "open", label: "Opening balance", amount: st.opening },
        { id: "chg", label: "Charges", amount: st.charges },
        { id: "pay", label: "Payments", amount: -st.payments },
        { id: "crd", label: "Credits & adjustments", amount: -st.credits },
      ],
      totals: { label: st.closing < 0 ? "Closing balance (credit)" : "Closing balance", amount: st.closing },
    },
    {
      key: "aging",
      title: "Balance by age",
      description: st.aging ? `Unpaid charges on ${formatIso(st.to)} by how long they've been open.` : st.closing < 0 ? `${money(st.credit)} credit on account — it applies to your next charges.` : "Nothing is owed.",
      span: "half",
      columns: [...Object.entries(AGING_LABELS).map(([key, header]) => ({ key, header, format: "money" })), { key: "total", header: "Total", format: "money" }],
      rows: st.aging ? [{ id: "aging", ...st.aging }] : [],
      emptyTitle: st.closing < 0 ? `Credit on account: ${money(st.credit)}` : "Paid in full",
    },
    {
      key: "activity",
      title: "Activity",
      description: `Opening balance ${money(st.opening)} on ${formatIso(st.from)}.`,
      columns: [
        { key: "date", header: "Date", format: "date" },
        { key: "description", header: "Description" },
        ...(st.activity.some((r) => r.reference) ? [{ key: "reference", header: "Receipt" }] : []),
        { key: "charge", header: "Charges", format: "money", blank: true },
        { key: "payment", header: "Payments & credits", format: "money", blank: true },
        { key: "balance", header: "Balance", format: "money" },
      ],
      rows: st.activity,
      totals: { charge: st.charges, payment: round2(st.payments + st.credits), balance: st.closing },
      emptyTitle: "No charges or payments in this period",
    },
  ];
  if (st.plan?.installments?.length) {
    sections.push({
      key: "plan",
      title: "Payment plan",
      description: `${st.plan.name || "Payment plan"} · ${money(st.plan.remaining)} still to bill`,
      columns: [
        { key: "seq", header: "Installment", format: "number" },
        { key: "dueDate", header: "Due", format: "date" },
        { key: "amount", header: "Amount", format: "money" },
        { key: "status", header: "Status" },
      ],
      rows: st.plan.installments,
    });
  }
  return sections;
}
