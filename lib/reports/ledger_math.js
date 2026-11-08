import { SOURCE_LABELS, accountLabel, isDebitNormal, openItems, round2 } from "@/lib/ledger/postings";
import { heldInRange, isManagerSide, lineAllocation, ownerTagOf, ownersOn, pctHistory, shareLabel } from "@/lib/ledger/ownership";
import { bankCashGl } from "@/lib/ledger/conversion";
import { money } from "./format";
import { dayBefore, dayOf, daysBetweenIso, formatIso, monthKeyOf, monthName, monthsIn } from "./periods";
import { RETAINED_EARNINGS_KEY } from "@/lib/ledger/chart";
import { fiscalYearRange } from "@/lib/ledger/periods";

// Pure report math over double-entry ledger lines (normalizeLine shape, each
// optionally carrying its `entry`) and an account index ({ byId, byKey, list }).
// Shared by the report screens and the scheduled-reports job.

const dr = (l) => Number(l.debit) || 0;
const cr = (l) => Number(l.credit) || 0;
const acctOf = (accounts, l) => accounts.byId.get(l.glAccountId) || null;
export const isCash = (a) => a?.subtype === "cash";

// Normal-sign balance of an account from debit/credit totals.
const normal = (a, debit, credit) => round2(isDebitNormal(a?.accountType) ? debit - credit : credit - debit);

export const sourceLabel = (t) => SOURCE_LABELS[t] || (t ? String(t).replace(/_/g, " ") : "Entry");

// Lines narrowed to a property and/or an inclusive date window.
export function scopeLines(lines, { propertyId, from, to } = {}) {
  return (lines || []).filter((l) => {
    if (propertyId && propertyId !== "all" && l.propertyId !== propertyId) return false;
    const d = dayOf(l.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// Dimension of a line. Lines carry their own (inherited from the entry unless a
// posting cleared it, e.g. the manager's side of a fee), so no entry fallback.
export const dimOf = (l, key) => l[key] || "";

// --- Trial balance & GL detail --------------------------------------------------

const isEarnings = (a) => a?.accountType === "Income" || a?.accountType === "Expense";

// Virtual retained-earnings row for reports when the chart has no retained_earnings account (CORE-40).
const RETAINED_VIRTUAL = { id: "retained_earnings", number: "3900", name: "Retained Earnings", accountType: "Equity", systemKey: RETAINED_EARNINGS_KEY };

// Opening (before from), period debits/credits, closing (through to) per account.
// With fyStart (1–12) income and expense open at the fiscal-year start of `from`; earlier years roll into retained earnings (virtual close).
export function trialBalance(lines, accounts, { from, to, fyStart } = {}) {
  const per = new Map();
  const yearStart = fyStart && from ? fiscalYearRange(from, fyStart).start : "";
  const retained = accounts.byKey?.get(RETAINED_EARNINGS_KEY) || RETAINED_VIRTUAL;
  const rowOf = (a) => per.get(a.id) || { id: a.id, number: a.number, name: a.name, accountType: a.accountType, account: a, openDr: 0, openCr: 0, debit: 0, credit: 0 };
  for (const l of lines) {
    let a = acctOf(accounts, l);
    if (!a) continue;
    const d = dayOf(l.date);
    if (to && d > to) continue;
    // Prior fiscal years' income and expense open on retained earnings instead.
    if (yearStart && d < yearStart && isEarnings(a)) a = retained;
    const row = rowOf(a);
    if (from && d < from) {
      row.openDr += dr(l);
      row.openCr += cr(l);
    } else {
      row.debit += dr(l);
      row.credit += cr(l);
    }
    per.set(a.id, row);
  }
  const rows = [...per.values()]
    .map((r) => {
      const closingDr = r.openDr + r.debit;
      const closingCr = r.openCr + r.credit;
      const net = round2(closingDr - closingCr);
      return {
        id: r.id,
        number: r.number,
        name: r.name,
        label: accountLabel(r.account),
        accountType: r.accountType,
        opening: normal(r.account, r.openDr, r.openCr),
        debit: round2(r.debit),
        credit: round2(r.credit),
        closing: normal(r.account, closingDr, closingCr),
        closingDr: net > 0 ? net : 0,
        closingCr: net < 0 ? -net : 0,
      };
    })
    .filter((r) => r.opening || r.debit || r.credit || r.closing)
    .sort((x, y) => String(x.number).localeCompare(String(y.number), undefined, { numeric: true }));
  const sum = (k) => round2(rows.reduce((s, r) => s + r[k], 0));
  const totals = { label: "Totals", debit: sum("debit"), credit: sum("credit"), closingDr: sum("closingDr"), closingCr: sum("closingCr"), isTotal: true };
  return { rows, totals, balanced: totals.closingDr === totals.closingCr && totals.debit === totals.credit };
}

// Every line in range grouped by account, with an opening row and running balance.
export function glDetail(lines, accounts, { from, to, glAccountId } = {}) {
  const groups = new Map();
  const sorted = [...lines].sort(
    (x, y) => dayOf(x.date).localeCompare(dayOf(y.date)) || String(x.entry?.createdAt || "").localeCompare(String(y.entry?.createdAt || "")) || x.lineNo - y.lineNo,
  );
  for (const l of sorted) {
    const a = acctOf(accounts, l);
    if (!a || (glAccountId && glAccountId !== "all" && a.id !== glAccountId)) continue;
    const d = dayOf(l.date);
    if (to && d > to) continue;
    const g = groups.get(a.id) || { account: a, openDr: 0, openCr: 0, lines: [] };
    if (from && d < from) {
      g.openDr += dr(l);
      g.openCr += cr(l);
    } else g.lines.push(l);
    groups.set(a.id, g);
  }
  const rows = [];
  const summary = [];
  const ordered = [...groups.values()].sort((x, y) =>
    String(x.account.number).localeCompare(String(y.account.number), undefined, { numeric: true }),
  );
  for (const g of ordered) {
    const label = accountLabel(g.account);
    let bal = normal(g.account, g.openDr, g.openCr);
    if (!g.lines.length && !bal) continue;
    rows.push({ id: `${g.account.id}:open`, kind: "opening", date: from || "", account: label, memo: "Opening balance", source: "", debit: null, credit: null, balance: bal });
    let pd = 0;
    let pc = 0;
    for (const l of g.lines) {
      bal = round2(bal + (isDebitNormal(g.account.accountType) ? dr(l) - cr(l) : cr(l) - dr(l)));
      pd += dr(l);
      pc += cr(l);
      rows.push({
        id: l.id,
        kind: "line",
        entryId: l.entryId,
        date: l.date,
        account: label,
        memo: l.memo || l.entry?.memo || "",
        source: sourceLabel(l.entry?.sourceType),
        status: l.entry?.status === "void" ? "Void" : l.entry?.reversalOf ? "Reversal" : "Posted",
        debit: dr(l) || null,
        credit: cr(l) || null,
        balance: bal,
      });
    }
    summary.push({ id: g.account.id, account: label, accountType: g.account.accountType, opening: normal(g.account, g.openDr, g.openCr), debit: round2(pd), credit: round2(pc), closing: bal, count: g.lines.length });
  }
  return { rows, summary };
}

// --- Statements -----------------------------------------------------------------

// Income statement for an inclusive range: income and expense accounts.
export function incomeStatement(lines, accounts, range = {}) {
  const per = new Map();
  for (const l of scopeLines(lines, range)) {
    const a = acctOf(accounts, l);
    if (!a || (a.accountType !== "Income" && a.accountType !== "Expense")) continue;
    const r = per.get(a.id) || { id: a.id, account: a, label: accountLabel(a), accountType: a.accountType, debit: 0, credit: 0 };
    r.debit += dr(l);
    r.credit += cr(l);
    per.set(a.id, r);
  }
  const rows = [...per.values()].map((r) => ({ ...r, amount: normal(r.account, r.debit, r.credit) })).filter((r) => r.amount);
  const sortNum = (x, y) => String(x.account.number).localeCompare(String(y.account.number), undefined, { numeric: true });
  const income = rows.filter((r) => r.accountType === "Income").sort(sortNum);
  const expenses = rows.filter((r) => r.accountType === "Expense").sort(sortNum);
  const totalIncome = round2(income.reduce((s, r) => s + r.amount, 0));
  const totalExpense = round2(expenses.reduce((s, r) => s + r.amount, 0));
  return { income, expenses, totalIncome, totalExpense, net: round2(totalIncome - totalExpense) };
}

// Balance sheet as of a date. Without fyStart all income − expense shows as current earnings; with fyStart (1–12, CORE-40)
// it splits into retained earnings (the 3900 account plus income − expense before the fiscal year of asOf) and current year earnings.
export function balanceSheet(lines, accounts, asOf, { fyStart } = {}) {
  const per = new Map();
  const yearStart = fyStart && asOf ? fiscalYearRange(asOf, fyStart).start : "";
  const retainedId = yearStart ? accounts.byKey?.get(RETAINED_EARNINGS_KEY)?.id || null : null;
  let earnings = 0;
  let prior = 0;
  for (const l of scopeLines(lines, { to: asOf })) {
    const a = acctOf(accounts, l);
    if (!a) continue;
    if (isEarnings(a) || a.id === retainedId) {
      const amount = cr(l) - dr(l);
      if (yearStart && (dayOf(l.date) < yearStart || a.id === retainedId)) prior += amount;
      else earnings += amount;
      continue;
    }
    const r = per.get(a.id) || { id: a.id, account: a, label: accountLabel(a), accountType: a.accountType, debit: 0, credit: 0 };
    r.debit += dr(l);
    r.credit += cr(l);
    per.set(a.id, r);
  }
  const rows = [...per.values()]
    .map((r) => ({ ...r, amount: normal(r.account, r.debit, r.credit) }))
    .filter((r) => r.amount)
    .sort((x, y) => String(x.account.number).localeCompare(String(y.account.number), undefined, { numeric: true }));
  const pick = (t) => rows.filter((r) => r.accountType === t);
  const assets = pick("Asset");
  const liabilities = pick("Liability");
  const equity = pick("Equity");
  earnings = round2(earnings);
  prior = round2(prior);
  if (yearStart) {
    if (prior) equity.push({ id: "retained_earnings", label: "Retained earnings (prior years)", amount: prior, accountType: "Equity" });
    if (earnings) equity.push({ id: "earnings", label: "Current year earnings", amount: earnings, accountType: "Equity" });
  } else if (earnings) equity.push({ id: "earnings", label: "Current earnings (income − expenses)", amount: earnings, accountType: "Equity" });
  const total = (xs) => round2(xs.reduce((s, r) => s + r.amount, 0));
  const totalAssets = total(assets);
  const totalLiabilities = total(liabilities);
  const totalEquity = total(equity);
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    retainedEarnings: prior,
    currentYearEarnings: yearStart ? earnings : null,
    fiscalYearStart: yearStart || null,
    balanced: round2(totalAssets - totalLiabilities - totalEquity) === 0,
  };
}

const CASH_CATEGORY = {
  contribution: "Financing",
  distribution: "Financing",
  deposit_held: "Security deposits",
  deposit_return: "Security deposits",
  deposit_interest: "Security deposits",
};
export const CASH_CATEGORIES = ["Operating", "Financing", "Security deposits"];

// Net cash movement per entry (transfers between cash accounts net to zero).
function cashByEntry(lines, accounts) {
  const per = new Map();
  for (const l of lines) {
    const a = acctOf(accounts, l);
    if (!isCash(a)) continue;
    const e = per.get(l.entryId) || { entryId: l.entryId, date: l.date, entry: l.entry, delta: 0 };
    e.delta += dr(l) - cr(l);
    per.set(l.entryId, e);
  }
  return [...per.values()].map((e) => ({ ...e, delta: round2(e.delta) })).filter((e) => e.delta);
}

// Cash flow for a range: opening/closing cash, by activity and by month.
export function cashFlow(lines, accounts, { from, to, propertyId } = {}) {
  const scoped = scopeLines(lines, { propertyId });
  const before = cashByEntry(scopeLines(scoped, { to: from ? dayBefore(from) : undefined }), accounts);
  const opening = from ? round2(before.reduce((s, e) => s + e.delta, 0)) : 0;
  return cashFlowSummary(opening, cashByEntry(scopeLines(scoped, { from, to }), accounts), { from, to });
}

// Opening cash plus cash moves ({ date, entry: { sourceType }, delta }) → the cash flow; the line and aggregate paths share it (CORE-41).
export function cashFlowSummary(opening, moves, { from, to } = {}) {
  const cats = new Map(CASH_CATEGORIES.map((c) => [c, { id: c, label: c, inflow: 0, outflow: 0 }]));
  const months = new Map(monthsIn({ from, to }).map((k) => [k, { id: k, key: k, inflow: 0, outflow: 0 }]));
  for (const m of moves) {
    const c = cats.get(CASH_CATEGORY[m.entry?.sourceType] || "Operating");
    const mk = months.get(monthKeyOf(m.date));
    if (m.delta > 0) {
      c.inflow += m.delta;
      if (mk) mk.inflow += m.delta;
    } else {
      c.outflow -= m.delta;
      if (mk) mk.outflow -= m.delta;
    }
  }
  const fin = (r) => ({ ...r, inflow: round2(r.inflow), outflow: round2(r.outflow), net: round2(r.inflow - r.outflow) });
  const byCategory = [...cats.values()].map(fin);
  const byMonth = [...months.values()].map(fin);
  const inflow = round2(byCategory.reduce((s, r) => s + r.inflow, 0));
  const outflow = round2(byCategory.reduce((s, r) => s + r.outflow, 0));
  return { opening, inflow, outflow, net: round2(inflow - outflow), closing: round2(opening + inflow - outflow), byCategory, byMonth };
}

// --- Sub-ledgers ------------------------------------------------------------------

export const AR_BUCKETS = [
  { key: "b0", label: "0–30 days" },
  { key: "b31", label: "31–60 days" },
  { key: "b61", label: "61–90 days" },
  { key: "b91", label: "90+ days" },
];

export const AP_BUCKETS = [
  { key: "current", label: "Current" },
  { key: "b1", label: "1–30 days" },
  { key: "b31", label: "31–60 days" },
  { key: "b61", label: "61–90 days" },
  { key: "b91", label: "90+ days" },
];

const arBucket = (days) => (days > 90 ? "b91" : days > 60 ? "b61" : days > 30 ? "b31" : "b0");
const apBucket = (days) => (days <= 0 ? "current" : days > 90 ? "b91" : days > 60 ? "b61" : days > 30 ? "b31" : "b1");

function groupBy(lines, keyOf) {
  const map = new Map();
  for (const l of lines) {
    const k = keyOf(l);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  }
  return map;
}

// Receivable aging per lease (else tenant) as of a date, from open charges.
export function receivableAging(lines, accounts, asOf) {
  const ar = scopeLines(lines, { to: asOf }).filter((l) => acctOf(accounts, l)?.subtype === "receivable");
  const groups = groupBy(ar, (l) => (dimOf(l, "leaseId") ? `lease:${dimOf(l, "leaseId")}` : dimOf(l, "tenantId") ? `tenant:${dimOf(l, "tenantId")}` : ""));
  const rows = [];
  for (const [key, ls] of groups) {
    const balance = round2(ls.reduce((s, l) => s + dr(l) - cr(l), 0));
    const items = openItems(ls, accounts, "receivable");
    const out = { id: key, leaseId: dimOf(ls[0], "leaseId"), tenantId: ls.map((l) => dimOf(l, "tenantId")).find(Boolean) || "", propertyId: ls.map((l) => dimOf(l, "propertyId")).find(Boolean) || "", unitId: ls.map((l) => dimOf(l, "unitId")).find(Boolean) || "", b0: 0, b31: 0, b61: 0, b91: 0, open: 0, oldestDays: 0, items: [] };
    for (const i of items) {
      const days = Math.max(0, daysBetweenIso(i.date, asOf) ?? 0);
      out[arBucket(days)] += i.open;
      out.open += i.open;
      out.oldestDays = Math.max(out.oldestDays, days);
      out.items.push({ ...i, days });
    }
    const payments = ls.filter((l) => l.entry?.sourceType === "payment" && cr(l) > 0).map((l) => dayOf(l.date)).sort();
    for (const b of ["b0", "b31", "b61", "b91", "open"]) out[b] = round2(out[b]);
    out.balance = balance;
    out.credit = round2(Math.max(0, out.open - balance));
    out.lastPayment = payments[payments.length - 1] || "";
    if (out.open > 0.004 || balance > 0.004) rows.push(out);
  }
  return rows.sort((x, y) => y.balance - x.balance);
}

// Open payables per vendor bill as of a date, bucketed by days past due.
// AP lines group by payee (CORE-04): the vendor, else the tenant (deposit refunds), else the owner.
const payeeOf = (l) => {
  for (const [type, dim] of [["vendor", "vendorId"], ["tenant", "tenantId"], ["owner", "ownerId"]]) if (dimOf(l, dim)) return `${type}:${dimOf(l, dim)}`;
  return "none";
};

export function payableAging(lines, accounts, asOf) {
  const ap = scopeLines(lines, { to: asOf }).filter((l) => acctOf(accounts, l)?.subtype === "payable");
  const rows = [];
  for (const [payee, ls] of groupBy(ap, payeeOf)) {
    const entries = new Map(ls.map((l) => [l.entryId, l.entry]));
    const [payeeType, payeeId = ""] = payee === "none" ? ["", ""] : payee.split(":");
    for (const i of openItems(ls, accounts, "payable")) {
      const entry = entries.get(i.entryId) || {};
      const due = dayOf(entry.metadata?.dueDate) || dayOf(i.date);
      const days = daysBetweenIso(due, asOf) ?? 0;
      const row = { id: i.entryId, payeeType, payeeId, vendorId: payeeType === "vendor" ? payeeId : "", propertyId: entry.propertyId || "", memo: i.memo || "Bill", billDate: i.date, dueDate: due, daysPastDue: Math.max(0, days), amount: i.amount, paid: i.paid, open: i.open, current: 0, b1: 0, b31: 0, b61: 0, b91: 0 };
      row[apBucket(days)] = i.open;
      rows.push(row);
    }
  }
  return rows.sort((x, y) => y.daysPastDue - x.daysPastDue);
}

// Cash lines in range with an opening balance and running balance.
export function cashRegister(lines, accounts, { from, to, bankAccountId, glAccountId } = {}) {
  const match = (l) => {
    const a = acctOf(accounts, l);
    if (!isCash(a)) return false;
    if (bankAccountId && bankAccountId !== "all" && l.bankAccountId !== bankAccountId) return false;
    if (glAccountId && glAccountId !== "all" && a.id !== glAccountId) return false;
    return true;
  };
  const cash = lines.filter(match);
  const opening = round2(cash.filter((l) => from && dayOf(l.date) < from).reduce((s, l) => s + dr(l) - cr(l), 0));
  let bal = opening;
  const rows = scopeLines(cash, { from, to })
    .sort((x, y) => dayOf(x.date).localeCompare(dayOf(y.date)) || String(x.entry?.createdAt || "").localeCompare(String(y.entry?.createdAt || "")))
    .map((l) => {
      bal = round2(bal + dr(l) - cr(l));
      const e = l.entry || {};
      return {
        id: l.id,
        entryId: l.entryId,
        date: l.date,
        type: sourceLabel(e.sourceType),
        sourceType: e.sourceType || "",
        memo: l.memo || e.memo || "",
        reference: e.metadata?.checkNumber || e.metadata?.reference || e.metadata?.method || "",
        account: accountLabel(acctOf(accounts, l)),
        bankAccountId: l.bankAccountId || "",
        vendorId: dimOf(l, "vendorId"),
        tenantId: dimOf(l, "tenantId"),
        ownerId: dimOf(l, "ownerId"),
        propertyId: dimOf(l, "propertyId"),
        status: e.status === "void" ? "Void" : e.reversalOf ? "Reversal" : l.cleared ? "Cleared" : "Open",
        deposit: dr(l) || null,
        payment: cr(l) || null,
        balance: bal,
      };
    });
  return { opening, closing: bal, rows };
}

// Trust cash per account × property as of a date; with an ownership index, per owner in whole cents (lineAllocation) plus an unassigned remainder.
export function trustPositions(lines, accounts, asOf, ownership = null) {
  const per = new Map();
  const add = (a, l, ownerId, amount) => {
    const key = `${a.id}|${ownerId}|${l.propertyId || ""}`;
    const r = per.get(key) || { id: key, account: accountLabel(a), systemKey: a.systemKey, ownerId, propertyId: l.propertyId || "", balance: 0 };
    r.balance += amount;
    per.set(key, r);
  };
  for (const l of scopeLines(lines, { to: asOf })) {
    const a = acctOf(accounts, l);
    if (!isCash(a) || !a.isTrust) continue;
    const amount = dr(l) - cr(l);
    if (!ownership) {
      add(a, l, "", amount);
      continue;
    }
    const split = lineAllocation(l, ownership);
    for (const o of split.owners) add(a, l, o.ownerId, o.debit - o.credit);
    const rest = split.unassigned.debit - split.unassigned.credit;
    if (rest) add(a, l, "", rest);
  }
  return [...per.values()].map((r) => ({ ...r, balance: round2(r.balance) })).filter((r) => r.balance);
}

// Security deposits held per lease (else tenant) from the deposits liability; `systemKeys` narrows it (e.g. 2100 only).
export function depositsHeldByLease(lines, accounts, asOf, { systemKeys } = {}) {
  const out = new Map();
  for (const l of scopeLines(lines, { to: asOf })) {
    const a = acctOf(accounts, l);
    if (a?.subtype !== "deposits" || (systemKeys && !systemKeys.includes(a.systemKey))) continue;
    const key = dimOf(l, "leaseId") || (dimOf(l, "tenantId") ? `tenant:${dimOf(l, "tenantId")}` : "");
    if (!key) continue;
    out.set(key, round2((out.get(key) || 0) + cr(l) - dr(l)));
  }
  return out;
}

// Security deposits per lease: ledger held (2100) and interest (2110) against the open deposit records, matched as Deposit Detail shows them.
export function depositLeaseRows(lines, accounts, asOf, deposits = []) {
  const held = depositsHeldByLease(lines, accounts, asOf, { systemKeys: ["security_deposits"] });
  const interestHeld = depositsHeldByLease(lines, accounts, asOf, { systemKeys: ["deposit_interest_payable"] });
  // The liability lines' own property and unit, for owner shares when deposits sit in the rent trust.
  const dims = new Map();
  for (const l of scopeLines(lines, { to: asOf })) {
    if (acctOf(accounts, l)?.subtype !== "deposits") continue;
    const key = dimOf(l, "leaseId") || (dimOf(l, "tenantId") ? `tenant:${dimOf(l, "tenantId")}` : "");
    if (key && !dims.get(key)?.propertyId) dims.set(key, { propertyId: dimOf(l, "propertyId"), unitId: dimOf(l, "unitId"), tenantId: dimOf(l, "tenantId") });
  }
  const entryDates = new Map();
  for (const l of lines || []) if (!entryDates.has(l.entryId)) entryDates.set(l.entryId, dayOf(l.date));
  const recorded = new Map();
  for (const d of Array.isArray(deposits) ? deposits : []) {
    // Not held yet on the date: its ledger posting (or recorded receipt) comes later.
    const since = entryDates.get(d.chargeEntryId) || dayOf(d.metadata?.receivedOn || d.receivedOn);
    if (asOf && since && since > asOf) continue;
    const key = d.leaseId || (d.tenantId ? `tenant:${d.tenantId}` : `deposit:${d.id}`);
    // CORE-04: a record is on the ledger once it has a charge_entry_id; a returned, partly returned or forfeited one holds nothing (the rest was applied to charges).
    const disposed = Boolean(d.applyEntryId || d.metadata?.disposition?.committedAt);
    const open = !disposed && (["Held", "Awaiting disposition"].includes(d.status) || (d.status === "Pending" && Boolean(d.chargeEntryId)));
    const amt = open ? Number(d.amount) || 0 : 0;
    const r = recorded.get(key) || { amount: 0, statuses: new Set(), location: "", deposit: d, unposted: 0, unpostedAmount: 0 };
    r.amount += amt;
    if (open && !d.chargeEntryId) {
      r.unposted += 1;
      r.unpostedAmount += amt;
    }
    r.statuses.add(d.status);
    r.location = r.location || d.heldLocation || "";
    recorded.set(key, r);
  }
  return [...new Set([...held.keys(), ...recorded.keys()])].map((key) => {
    const rec = recorded.get(key);
    const ledger = round2(held.get(key) || 0);
    const amount = round2(rec?.amount || 0);
    const diff = round2(ledger - amount);
    const match = rec?.unposted || (!ledger && amount) ? "unposted" : Math.abs(diff) < 0.01 ? "match" : diff > 0 ? "over" : "under";
    return {
      key,
      deposit: rec?.deposit || {},
      location: rec?.location || "",
      status: rec ? [...rec.statuses].join(", ") : "Ledger only",
      recorded: amount,
      ledger,
      interest: round2(interestHeld.get(key) || 0),
      diff,
      match,
      unpostedAmount: round2(rec?.unpostedAmount || (match === "unposted" ? amount : 0)),
      ...(dims.get(key) || { propertyId: "", unitId: "", tenantId: "" }),
    };
  });
}

// A year-to-date expense brought over at conversion with its vendor (INTL-04) counts as paid to that vendor; a voided one doesn't.
const ytdPaid = (l, a) => a?.accountType === "Expense" && l.entry?.metadata?.conversion === true && l.entry?.status !== "void" && Boolean(dimOf(l, "vendorId"));

// Cash paid per vendor in a range: per entry, Σ (credit − debit) on cash lines, plus year-to-date payments brought over at conversion.
export function vendorPayments(lines, accounts, range = {}) {
  const per = new Map();
  for (const l of scopeLines(lines, range)) {
    const a = acctOf(accounts, l);
    const ytd = ytdPaid(l, a);
    if (!isCash(a) && !ytd) continue;
    const vendorId = dimOf(l, "vendorId");
    if (!vendorId) continue;
    const r = per.get(vendorId) || { vendorId, total: 0, entries: new Set(), last: "" };
    r.total += ytd ? dr(l) - cr(l) : cr(l) - dr(l);
    r.entries.add(l.entryId);
    if (dayOf(l.date) > r.last) r.last = dayOf(l.date);
    per.set(vendorId, r);
  }
  return [...per.values()].map((r) => ({ vendorId: r.vendorId, total: round2(r.total), payments: r.entries.size, last: r.last }));
}

// Management-fee postings in a range → [{ entryId, date, propertyId, ownerId, amount }].
export function managementFeePostings(lines, accounts, range = {}) {
  const feeId = accounts.byKey.get("management_fees")?.id;
  const per = new Map();
  for (const l of scopeLines(lines, range)) {
    if (l.glAccountId !== feeId) continue;
    const r = per.get(l.entryId) || { id: l.entryId, entryId: l.entryId, date: dayOf(l.date), propertyId: dimOf(l, "propertyId"), ownerId: dimOf(l, "ownerId"), memo: l.entry?.memo || "", amount: 0 };
    r.amount += dr(l) - cr(l);
    per.set(l.entryId, r);
  }
  return [...per.values()].map((r) => ({ ...r, amount: round2(r.amount) })).filter((r) => r.amount);
}

// Income (accrual) per property in a range, excluding the manager's fee income.
export function incomeByProperty(lines, accounts, range = {}) {
  const feeIncome = accounts.byKey.get("management_fee_income")?.id;
  const out = new Map();
  for (const l of scopeLines(lines, range)) {
    const a = acctOf(accounts, l);
    if (a?.accountType !== "Income" || a.id === feeIncome) continue;
    const p = dimOf(l, "propertyId");
    if (!p) continue;
    out.set(p, round2((out.get(p) || 0) + cr(l) - dr(l)));
  }
  return out;
}

// Owner-statement bucket of a line's account, and the sign that makes the bucket positive.
const OWNER_KINDS = {
  income: { label: "Income", sign: -1 },
  fees: { label: "Management fee", sign: 1 },
  expenses: { label: "Expense", sign: 1 },
  contributions: { label: "Contribution", sign: -1 },
  distributions: { label: "Distribution", sign: 1 },
};
function ownerKindOf(a, feeId) {
  if (a.accountType === "Income") return "income";
  if (a.id === feeId) return "fees";
  if (a.accountType === "Expense") return "expenses";
  if (a.subtype === "contribution") return "contributions";
  if (a.subtype === "distribution") return "distributions";
  return "";
}

// Owner statement totals for a range over one owner's lines (ownerScopedLines, already their share); funds in trust exclude deposit trust.
export function ownerStatement(lines, accounts, { from, to }) {
  const depositCash = accounts.byKey.get("deposit_cash")?.id;
  const feeId = accounts.byKey.get("management_fees")?.id;
  const t = { opening: 0, closing: 0, income: 0, expenses: 0, fees: 0, contributions: 0, distributions: 0, receipts: 0, disbursements: 0 };
  const byProperty = new Map();
  const detail = [];
  for (const l of lines) {
    const a = acctOf(accounts, l);
    if (!a) continue;
    const d = dayOf(l.date);
    if (to && d > to) continue;
    const trustCash = isCash(a) && a.isTrust && a.id !== depositCash;
    const amt = dr(l) - cr(l);
    if (trustCash) {
      if (from && d < from) t.opening += amt;
      t.closing += amt;
    }
    if (from && d < from) continue;
    const p = dimOf(l, "propertyId") || "none";
    const row = byProperty.get(p) || { id: p, propertyId: p === "none" ? "" : p, income: 0, expenses: 0, fees: 0, distributions: 0, contributions: 0 };
    const kind = ownerKindOf(a, feeId);
    if (kind) {
      const v = OWNER_KINDS[kind].sign * amt;
      t[kind] += v;
      row[kind] += v;
      // Money in to the owner is positive, money out negative.
      detail.push({ id: l.id, date: d, kind: OWNER_KINDS[kind].label, memo: l.memo || l.entry?.memo || "", account: accountLabel(a), propertyId: row.propertyId, source: sourceLabel(l.entry?.sourceType), amount: round2(-amt) });
    }
    if (trustCash) {
      if (amt > 0) t.receipts += amt;
      else t.disbursements += -amt;
    }
    byProperty.set(p, row);
  }
  for (const k of Object.keys(t)) t[k] = round2(t[k]);
  t.noi = round2(t.income - t.expenses - t.fees);
  const props = [...byProperty.values()]
    .map((r) => {
      const out = { ...r };
      for (const k of ["income", "expenses", "fees", "distributions", "contributions"]) out[k] = round2(out[k]);
      out.net = round2(out.income - out.expenses - out.fees);
      return out;
    })
    .filter((r) => r.income || r.expenses || r.fees || r.distributions || r.contributions);
  detail.sort((x, y) => x.date.localeCompare(y.date));
  return { totals: t, byProperty: props, detail };
}

// "By property" rows of an owner statement: properties held in the range or with activity in it, each with "Your share".
export function ownerPropertyRows(statement, ownership, ownerId, range, nameOf = () => "Property") {
  const ids = [...new Set([...heldInRange(ownership, ownerId, range), ...statement.byProperty.map((r) => r.propertyId).filter(Boolean)])];
  return ids
    .map((pid) => {
      const r = statement.byProperty.find((x) => x.propertyId === pid) || { income: 0, expenses: 0, fees: 0, distributions: 0, contributions: 0, net: 0 };
      return { ...r, id: pid, propertyId: pid, name: nameOf(pid) || "Property", share: shareLabel(pctHistory(ownership, pid, ownerId, range)) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Per-month owner statement totals (same buckets as ownerStatement), newest first.
export function ownerStatementMonths(lines, accounts) {
  const feeId = accounts.byKey.get("management_fees")?.id;
  const months = new Map();
  for (const l of lines) {
    const a = acctOf(accounts, l);
    const kind = a ? ownerKindOf(a, feeId) : "";
    if (!kind) continue;
    const m = monthKeyOf(l.date);
    const b = months.get(m) || { month: m, income: 0, expenses: 0, fees: 0, distributions: 0, contributions: 0 };
    b[kind] += OWNER_KINDS[kind].sign * (dr(l) - cr(l));
    months.set(m, b);
  }
  return [...months.values()]
    .map((b) => {
      const out = { month: b.month };
      for (const k of Object.keys(OWNER_KINDS)) out[k] = round2(b[k]);
      out.net = round2(out.income - out.expenses - out.fees);
      return out;
    })
    .sort((x, y) => y.month.localeCompare(x.month));
}

// --- Bank & three-way trust reconciliation (INTL-05) ------------------------------------

const DEPOSIT_BANK = "Security deposit";
const openBanks = (banks) => (Array.isArray(banks) ? banks : []).filter((b) => b && b.status !== "Closed");

// One bank's lines: every line on its own GL, or on a shared system GL the lines tagged to it or to no bank (as Bank Reconciliation reads them).
export function bankLinesOf(lines, bank, accounts) {
  const glAccountId = bank ? bankCashGl(bank, accounts) || "" : "";
  const ownGl = Boolean(bank?.glAccountId && accounts.byId.has(bank.glAccountId));
  const mine = glAccountId ? (lines || []).filter((l) => l.glAccountId === glAccountId && (ownGl || !l.bankAccountId || l.bankAccountId === bank.id)) : [];
  return { glAccountId, ownGl, lines: mine };
}

// Trust banks: Trust and Security deposit accounts, and any open bank whose cash GL is a trust account.
export function isTrustBank(bank, accounts) {
  if (!bank || bank.status === "Closed") return false;
  if (bank.accountType === "Trust" || bank.accountType === DEPOSIT_BANK) return true;
  return Boolean(accounts.byId.get(bankCashGl(bank, accounts))?.isTrust);
}

const isDepositBank = (bank, accounts) => bank?.accountType === DEPOSIT_BANK || accounts.byId.get(bankCashGl(bank, accounts))?.systemKey === "deposit_cash";

// The deposit bank that holds the security deposit liability (the first open one).
export const depositTrustBank = (banks, accounts) => openBanks(banks).find((b) => isDepositBank(b, accounts)) || null;

// The trust bank resident money lands in (tenant credits and undeposited receipts reconcile there): a Trust bank on the trust_cash GL first.
export function rentTrustBank(banks, accounts) {
  const trust = openBanks(banks).filter((b) => isTrustBank(b, accounts) && !isDepositBank(b, accounts));
  const onTrustCash = (b) => accounts.byId.get(bankCashGl(b, accounts))?.systemKey === "trust_cash";
  return trust.find((b) => b.accountType === "Trust" && onTrustCash(b)) || trust.find((b) => b.accountType === "Trust") || trust.find(onTrustCash) || null;
}

// "deposit" holds security deposits, "rent" receives resident money, "other" holds owner funds only (reserves).
export function trustRole(bank, banks, accounts) {
  if (isDepositBank(bank, accounts)) return "deposit";
  return rentTrustBank(banks, accounts)?.id === bank?.id ? "rent" : "other";
}

// Latest finalized reconciliation of a bank on or before a date (by statement date, then finalize time).
export function latestFinalized(reconciliations, bankAccountId, asOf) {
  return (
    (reconciliations || [])
      .filter((r) => r.bankAccountId === bankAccountId && r.status === "Finalized" && dayOf(r.statementDate) && (!asOf || dayOf(r.statementDate) <= asOf))
      .sort((a, b) => dayOf(b.statementDate).localeCompare(dayOf(a.statementDate)) || String(b.finalizedAt || "").localeCompare(String(a.finalizedAt || "")))[0] || null
  );
}

// Was the line on a finalized statement dated on or before `statementDate`?
function clearedThrough(line, recsById, statementDate) {
  if (line.reconciliationId) {
    const rec = recsById.get(line.reconciliationId);
    return Boolean(rec) && rec.status === "Finalized" && dayOf(rec.statementDate) <= statementDate;
  }
  return Boolean(line.cleared && line.clearedOn && dayOf(line.clearedOn) <= statementDate);
}

// A bank line as a reconciliation item (the caller sets the amount).
const itemOf = (l) => ({
  id: l.id,
  entryId: l.entryId,
  date: dayOf(l.date),
  type: sourceLabel(l.entry?.sourceType),
  memo: l.memo || l.entry?.memo || "",
  reference: l.metadata?.checkNumber || l.entry?.metadata?.checkNumber || l.entry?.metadata?.reference || l.entry?.metadata?.receiptNumber || "",
  propertyId: dimOf(l, "propertyId"),
  leaseId: dimOf(l, "leaseId"),
  tenantId: dimOf(l, "tenantId"),
  ownerId: dimOf(l, "ownerId"),
  vendorId: dimOf(l, "vendorId"),
});
const itemsTotal = (rows) => round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
const byDate = (a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id));
const debitItems = (ls) => ls.filter((l) => dr(l) > 0).map((l) => ({ ...itemOf(l), amount: round2(dr(l)) })).sort(byDate);
const creditItems = (ls) => ls.filter((l) => cr(l) > 0).map((l) => ({ ...itemOf(l), amount: round2(cr(l)) })).sort(byDate);
const netOf = (ls) => round2(ls.reduce((s, l) => s + dr(l) - cr(l), 0));

// Bank lines through `asOf` not on a statement through `statementDate`: deposits in transit (debits) and outstanding checks (credits).
export function outstandingItems(bankLines, reconciliations, statementDate, asOf = statementDate) {
  const recs = new Map((reconciliations || []).map((r) => [r.id, r]));
  const open = (bankLines || []).filter((l) => dayOf(l.date) <= asOf && !clearedThrough(l, recs, statementDate));
  const deposits = debitItems(open);
  const checks = creditItems(open);
  return { deposits, checks, depositsTotal: itemsTotal(deposits), checksTotal: itemsTotal(checks) };
}

const bankSummary = (bank) => (bank ? { name: bank.name || "", bankName: bank.bankName || "", last4: bank.last4 || "", accountType: bank.accountType || "" } : null);
const compactItem = (r) => {
  const out = { id: r.id, date: r.date, type: r.type, memo: r.memo, reference: r.reference, amount: r.amount };
  for (const k of ["vendorId", "tenantId", "ownerId", "leaseId"]) if (r[k]) out[k] = r[k];
  return out;
};

// What finalizing signs off, kept on the row (metadata.snapshot) so later back-dated postings can't change the printed reconciliation.
export function reconciliationSnapshot({ lines, bank, glAccountId, statementDate, statementBalance, openingBalance = 0, clearedIds = [], finalizedAt, finalizedBy = null }) {
  const cleared = new Set(clearedIds);
  const through = (lines || []).filter((l) => dayOf(l.date) <= statementDate);
  const now = through.filter((l) => cleared.has(l.id));
  const open = through.filter((l) => !l.reconciliationId && !cleared.has(l.id));
  const deposits = debitItems(open);
  const checks = creditItems(open);
  const statement = round2(statementBalance);
  const outstandingDeposits = itemsTotal(deposits);
  const outstandingChecks = itemsTotal(checks);
  const adjustedBank = round2(statement + outstandingDeposits - outstandingChecks);
  const bookBalance = netOf(through);
  return {
    version: 1,
    bankAccountId: bank?.id || "",
    glAccountId: glAccountId || "",
    bank: bankSummary(bank),
    statementDate,
    statementBalance: statement,
    openingBalance: round2(openingBalance),
    clearedDeposits: round2(now.reduce((s, l) => s + dr(l), 0)),
    clearedWithdrawals: round2(now.reduce((s, l) => s + cr(l), 0)),
    outstandingDepositIds: deposits.map((r) => r.id),
    outstandingCheckIds: checks.map((r) => r.id),
    outstanding: { deposits: deposits.map(compactItem), checks: checks.map(compactItem) },
    outstandingDeposits,
    outstandingChecks,
    adjustedBank,
    bookBalance,
    difference: round2(adjustedBank - bookBalance),
    finalizedAt: finalizedAt || "",
    finalizedBy,
  };
}

// A finalized reconciliation as printed: its snapshot, or one rebuilt from today's ledger for rows finalized before snapshots were kept.
export function bankReconciliationView(rec, { lines, accounts, bankAccounts = [], reconciliations = [] }) {
  if (!rec) return null;
  const bank = (bankAccounts || []).find((b) => b.id === rec.bankAccountId) || null;
  const own = bank ? bankLinesOf(lines, bank, accounts) : { lines: (lines || []).filter((l) => l.glAccountId === rec.glAccountId) };
  const byId = new Map((lines || []).map((l) => [l.id, l]));
  const S = dayOf(rec.statementDate);
  const clearedIds = Array.isArray(rec.metadata?.clearedLineIds) ? rec.metadata.clearedLineIds : [];
  const clearedLines = clearedIds.map((id) => byId.get(id)).filter(Boolean);
  let snapshot = rec.metadata?.snapshot && typeof rec.metadata.snapshot === "object" ? rec.metadata.snapshot : null;
  const reconstructed = !snapshot;
  if (!snapshot) {
    const previous = (reconciliations || [])
      .filter((r) => r.id !== rec.id && r.bankAccountId === rec.bankAccountId && r.status === "Finalized" && dayOf(r.statementDate) && dayOf(r.statementDate) < S)
      .sort((a, b) => dayOf(b.statementDate).localeCompare(dayOf(a.statementDate)))[0];
    const out = outstandingItems(own.lines, reconciliations, S);
    const statement = round2(rec.statementBalance);
    const book = netOf(own.lines.filter((l) => dayOf(l.date) <= S));
    const adjustedBank = round2(statement + out.depositsTotal - out.checksTotal);
    snapshot = {
      bank: bankSummary(bank),
      statementDate: S,
      statementBalance: statement,
      openingBalance: round2(previous?.statementBalance || 0),
      clearedDeposits: round2(clearedLines.reduce((s, l) => s + dr(l), 0)),
      clearedWithdrawals: round2(clearedLines.reduce((s, l) => s + cr(l), 0)),
      outstanding: { deposits: out.deposits.map(compactItem), checks: out.checks.map(compactItem) },
      outstandingDeposits: out.depositsTotal,
      outstandingChecks: out.checksTotal,
      adjustedBank,
      bookBalance: book,
      difference: round2(adjustedBank - book),
      finalizedAt: rec.finalizedAt || "",
      finalizedBy: null,
    };
  }
  const cleared = { deposits: debitItems(clearedLines), withdrawals: creditItems(clearedLines) };
  return { rec, bank, snapshot, reconstructed, cleared, missingCleared: clearedIds.length - clearedLines.length };
}

// Tenant credits per lease through a date: prepaid rent (2200) plus unapplied payments sitting as a credit on the tenant's receivable.
export function tenantCreditRows(lines, accounts, asOf) {
  const per = new Map();
  for (const l of scopeLines(lines, { to: asOf })) {
    const a = acctOf(accounts, l);
    if (a?.subtype !== "prepaid" && a?.subtype !== "receivable") continue;
    const key = dimOf(l, "leaseId") || (dimOf(l, "tenantId") ? `tenant:${dimOf(l, "tenantId")}` : "");
    if (!key) continue;
    const r = per.get(key) || { id: key, leaseId: dimOf(l, "leaseId"), tenantId: "", propertyId: "", unitId: "", prepaid: 0, receivable: 0 };
    if (a.subtype === "prepaid") r.prepaid += cr(l) - dr(l);
    else r.receivable += dr(l) - cr(l);
    for (const k of ["tenantId", "propertyId", "unitId"]) r[k] = r[k] || dimOf(l, k);
    per.set(key, r);
  }
  return [...per.values()]
    .map((r) => {
      const prepaid = round2(r.prepaid);
      const unapplied = round2(Math.max(0, -r.receivable));
      return { id: r.id, leaseId: r.leaseId, tenantId: r.tenantId, propertyId: r.propertyId, unitId: r.unitId, prepaid, unapplied, credit: round2(prepaid + unapplied) };
    })
    .filter((r) => r.credit);
}

// Why a trust line's money can't be traced to an owner.
function untaggedReason(l, ownership) {
  if (isManagerSide(l)) return "Manager's side of a fee";
  if (!l.propertyId && !ownerTagOf(l)) return "No owner or property";
  if (!ownersOn(ownership, l.propertyId, dayOf(l.date)).length) return `No owner on ${formatIso(dayOf(l.date))}`;
  return "Ownership under 100%";
}

// Owners' whole-cent shares of tenant money held on a property as of a date → { owners: [{ ownerId, amount }], unassigned }.
function heldShares(amount, propertyId, asOf, ownership) {
  const split = lineAllocation({ propertyId, date: asOf, debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0 }, ownership);
  return { owners: split.owners.map((o) => ({ ownerId: o.ownerId, amount: round2(o.debit - o.credit) })), unassigned: round2(split.unassigned.debit - split.unassigned.credit) };
}

const STATUS_SHORT = { balanced: "Balanced", out_of_balance: "Out of balance", not_reconciled: "Not reconciled" };

// Bank side of a three-way: the statement, what's outstanding through the date, and the signed-off book for back-dating checks.
function bankSideOf(rec, bankLines, reconciliations, asOf) {
  if (!rec) return null;
  const S = dayOf(rec.statementDate);
  const out = outstandingItems(bankLines, reconciliations, S, asOf);
  const snap = rec.metadata?.snapshot && typeof rec.metadata.snapshot === "object" ? rec.metadata.snapshot : null;
  return {
    reconciliationId: rec.id,
    statementDate: S,
    statementBalance: round2(rec.statementBalance),
    outstandingIn: out.depositsTotal,
    outstandingOut: out.checksTotal,
    adjusted: round2(Number(rec.statementBalance) + out.depositsTotal - out.checksTotal),
    depositsInTransit: out.deposits,
    outstandingChecks: out.checks,
    stale: monthKeyOf(S) < monthKeyOf(asOf),
    finalizedAt: rec.finalizedAt || "",
    finalizedBy: snap?.finalizedBy || null,
    snapshotBook: snap ? round2(snap.bookBalance) : null,
    bookAtStatement: netOf(bankLines.filter((l) => dayOf(l.date) <= S)),
  };
}

// Owner positions on a bank's lines net of the tenant money inside them → { ownerRows, untaggedLines }.
function ownerLiabilities(bookLines, tenantHeld, asOf, ownership) {
  const per = new Map();
  const untaggedLines = [];
  const row = (ownerId, propertyId) => {
    const key = `${ownerId}|${propertyId || ""}`;
    if (!per.has(key)) per.set(key, { id: key, ownerId, propertyId: propertyId || "", position: 0, held: 0 });
    return per.get(key);
  };
  for (const l of bookLines) {
    const split = ownership ? lineAllocation(l, ownership) : { owners: [], unassigned: { debit: dr(l), credit: cr(l) } };
    for (const o of split.owners) row(o.ownerId, l.propertyId).position += o.debit - o.credit;
    const rest = round2(split.unassigned.debit - split.unassigned.credit);
    if (rest) untaggedLines.push({ ...itemOf(l), amount: rest, reason: untaggedReason(l, ownership) });
  }
  // Tenant credits and deposits held here sit inside the owners' positions: each owner's share comes out by ownership on the date.
  for (const t of tenantHeld) {
    if (!t.amount) continue;
    const shares = heldShares(t.amount, t.propertyId, asOf, ownership);
    for (const o of shares.owners) row(o.ownerId, t.propertyId).held += o.amount;
    if (!shares.unassigned) continue;
    untaggedLines.push({
      id: `held:${t.id}`,
      date: asOf,
      type: t.label,
      memo: "",
      reference: "",
      propertyId: t.propertyId || "",
      leaseId: t.leaseId || "",
      tenantId: t.tenantId || "",
      ownerId: "",
      vendorId: "",
      amount: -shares.unassigned,
      reason: t.propertyId ? `Held for a tenant; no owner on ${formatIso(asOf)}` : "Held for a tenant; no property",
    });
  }
  const ownerRows = [];
  for (const r of per.values()) {
    const position = round2(r.position);
    const held = round2(r.held);
    if (!position && !held) continue;
    const funds = round2(position - held);
    ownerRows.push({ id: r.id, ownerId: r.ownerId, propertyId: r.propertyId, position, held, funds, state: funds < 0 ? "short" : "ok" });
  }
  return { ownerRows, untaggedLines: untaggedLines.sort(byDate) };
}

// Three-way trust reconciliation of one bank as of a date: adjusted bank ↔ book trust cash ↔ the owner, tenant and deposit ledgers.
export function threeWayTrust({ lines, accounts, reconciliations = [], bankAccounts = [], asOf, bankAccountId, ownership = null, deposits = [] }) {
  const bank = (bankAccounts || []).find((b) => b.id === bankAccountId) || null;
  if (!bank) return null;
  const role = trustRole(bank, bankAccounts, accounts);
  const own = bankLinesOf(lines, bank, accounts);
  const gl = accounts.byId.get(own.glAccountId) || null;
  const cashLines = own.lines.filter((l) => dayOf(l.date) <= asOf);
  // Receipts not yet banked (1050) belong to the rent trust's book.
  const undepositedId = role === "rent" ? accounts.byKey.get("undeposited_funds")?.id : null;
  const undepositedLines = undepositedId ? scopeLines(lines, { to: asOf }).filter((l) => l.glAccountId === undepositedId) : [];
  const book = { glAccountId: own.glAccountId, account: gl ? accountLabel(gl) : "", cash: netOf(cashLines), undeposited: netOf(undepositedLines) };
  book.total = round2(book.cash + book.undeposited);
  const rec = latestFinalized(reconciliations, bank.id, asOf);
  const bankSide = bankSideOf(rec, own.lines, reconciliations, asOf);

  // Deposits belong to the deposit bank, or to the rent trust when the project has no deposit bank.
  const depositBank = depositTrustBank(bankAccounts, accounts);
  const holdsDeposits = role === "deposit" ? depositBank?.id === bank.id : role === "rent" && !depositBank;
  const depositRows = holdsDeposits ? depositLeaseRows(lines, accounts, asOf, deposits).filter((r) => r.ledger || r.interest || r.recorded || r.match === "unposted") : [];
  const principal = itemsTotal(depositRows.map((r) => ({ amount: r.ledger })));
  const interest = itemsTotal(depositRows.map((r) => ({ amount: r.interest })));
  const creditRows = role === "rent" ? tenantCreditRows(lines, accounts, asOf) : [];
  const tenantCredits = itemsTotal(creditRows.map((r) => ({ amount: r.credit })));

  let ownerRows = [];
  let untaggedLines = [];
  let depositsHeld = 0;
  let interestFunded = 0;
  if (role === "deposit") {
    // CORE-04 pays accrued interest as a rent credit, so only interest the account actually holds counts as held here.
    interestFunded = holdsDeposits ? round2(Math.min(interest, Math.max(0, book.total - principal))) : 0;
    depositsHeld = round2(principal + interestFunded);
  } else {
    depositsHeld = holdsDeposits ? round2(principal + interest) : 0;
    const tenantHeld = [
      ...creditRows.map((r) => ({ id: r.id, leaseId: r.leaseId, tenantId: r.tenantId, propertyId: r.propertyId, amount: r.credit, label: "Tenant credit" })),
      ...depositRows.map((r) => ({ id: r.key, leaseId: r.key.includes(":") ? "" : r.key, tenantId: r.tenantId, propertyId: r.propertyId, amount: round2(r.ledger + r.interest), label: "Security deposit" })),
    ];
    ({ ownerRows, untaggedLines } = ownerLiabilities([...cashLines, ...undepositedLines], tenantHeld, asOf, ownership));
  }
  const owners = itemsTotal(ownerRows.map((r) => ({ amount: r.funds })));
  const beneficiaries = {
    owners,
    tenantCredits,
    deposits: depositsHeld,
    principal,
    interest,
    interestFunded,
    total: round2(owners + tenantCredits + depositsHeld),
    positions: itemsTotal(ownerRows.map((r) => ({ amount: r.position }))),
    ownerRows,
    creditRows,
    depositRows,
  };
  const gap = round2(book.total - beneficiaries.total);
  const differences = {
    bank: bankSide ? round2(bankSide.adjusted - book.cash) : null,
    untagged: role === "deposit" ? 0 : gap,
    deposits: role === "deposit" ? gap : 0,
    unposted: itemsTotal(depositRows.map((r) => ({ amount: r.unpostedAmount }))),
  };
  const untagged = { total: differences.untagged, lines: untaggedLines };

  const parts = [];
  if (differences.bank) parts.push(`bank ${money(differences.bank)}`);
  if (differences.untagged) parts.push(`untagged ${money(differences.untagged)}`);
  if (differences.deposits) parts.push(`deposits ${money(differences.deposits)}`);
  if (differences.unposted) parts.push(`unposted deposits ${money(differences.unposted)}`);
  let status;
  if (parts.length) status = { key: "out_of_balance", label: `Out of balance (${parts.join(" · ")})`, detail: parts.join(" · ") };
  else if (!bankSide) status = { key: "not_reconciled", label: "Not reconciled (no finalized statement)", detail: `No finalized statement on or before ${formatIso(asOf)}` };
  else if (bankSide.stale) status = { key: "not_reconciled", label: `Not reconciled for ${monthName(monthKeyOf(asOf))}`, detail: `Last statement ${formatIso(bankSide.statementDate)}` };
  else status = { key: "balanced", label: "Balanced", detail: "Bank, book and ledgers agree" };
  status.short = STATUS_SHORT[status.key];

  const exceptions = [];
  const flag = (id, severity, check, detail, amount = null, ref = {}) => exceptions.push({ id, severity, check, detail, amount, ...ref });
  if (!bankSide) flag("no-statement", "error", "Bank statement", `No finalized reconciliation on or before ${formatIso(asOf)}; finalize the statement in Bank Reconciliation.`);
  else if (bankSide.stale) flag("stale", "warning", "Bank statement", `The latest finalized statement is ${formatIso(bankSide.statementDate)}; reconcile the ${monthName(monthKeyOf(asOf))} statement to sign off this period.`);
  if (differences.bank) flag("bank", "error", "Adjusted bank vs book", "The adjusted bank balance doesn't match the trust cash on the books.", differences.bank);
  if (bankSide && bankSide.snapshotBook !== null && bankSide.snapshotBook !== bankSide.bookAtStatement) {
    flag("backdated", "warning", "Back-dated postings", `The book through ${formatIso(bankSide.statementDate)} was ${money(bankSide.snapshotBook)} at sign-off and is ${money(bankSide.bookAtStatement)} now.`, round2(bankSide.bookAtStatement - bankSide.snapshotBook));
  }
  if (differences.untagged) flag("untagged", "error", "Untagged trust money", `${untaggedLines.length} trust ${untaggedLines.length === 1 ? "item" : "items"} can't be traced to an owner or tenant.`, differences.untagged);
  for (const r of ownerRows.filter((x) => x.state === "short")) flag(`short:${r.id}`, "error", "Negative owner position", "Owner funds are overdrawn.", r.funds, { ownerId: r.ownerId, propertyId: r.propertyId });
  if (differences.deposits) flag("deposits", "error", "Deposit cash vs deposits held", "Deposit trust cash doesn't match the security deposits held for tenants.", differences.deposits);
  if (role === "deposit" && round2(interest - interestFunded)) {
    flag("interest", "info", "Deposit interest", "Accrued deposit interest isn't held in this account; it's paid to the tenant as a rent credit from owner funds.", round2(interest - interestFunded));
  }
  for (const r of depositRows.filter((x) => x.match === "unposted")) flag(`unposted:${r.key}`, "error", "Unposted deposit", "Recorded on the lease but not on the ledger.", r.unpostedAmount, { leaseKey: r.key });
  for (const r of depositRows.filter((x) => x.match === "over" || x.match === "under")) flag(`mismatch:${r.key}`, "warning", "Deposit record vs ledger", "The deposit record and the ledger disagree.", r.diff, { leaseKey: r.key });
  if (book.undeposited) flag("undeposited", "info", "Undeposited funds", "Receipts recorded but not yet deposited to the bank.", book.undeposited);

  return { bankAccount: bank, role, holdsDeposits, asOf, book, bank: bankSide, beneficiaries, untagged, differences, status, exceptions };
}
