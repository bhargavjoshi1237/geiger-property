import { SOURCE_LABELS, accountLabel, isDebitNormal, openItems, round2 } from "@/lib/ledger/postings";
import { dayBefore, dayOf, daysBetweenIso, monthKeyOf, monthsIn } from "./periods";

// Pure report math over double-entry ledger lines (normalizeLine shape, each
// optionally carrying its `entry`) and an account index ({ byId, byKey, list }).
// Shared by the report screens and the scheduled-reports job.

const dr = (l) => Number(l.debit) || 0;
const cr = (l) => Number(l.credit) || 0;
const acctOf = (accounts, l) => accounts.byId.get(l.glAccountId) || null;
const isCash = (a) => a?.subtype === "cash";

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

// Opening (before from), period debits/credits, closing (through to) per account.
export function trialBalance(lines, accounts, { from, to } = {}) {
  const per = new Map();
  for (const l of lines) {
    const a = acctOf(accounts, l);
    if (!a) continue;
    const d = dayOf(l.date);
    if (to && d > to) continue;
    const row = per.get(a.id) || { id: a.id, number: a.number, name: a.name, accountType: a.accountType, account: a, openDr: 0, openCr: 0, debit: 0, credit: 0 };
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

// Balance sheet as of a date. Unclosed income − expense shows as current earnings.
export function balanceSheet(lines, accounts, asOf) {
  const per = new Map();
  let earnings = 0;
  for (const l of scopeLines(lines, { to: asOf })) {
    const a = acctOf(accounts, l);
    if (!a) continue;
    if (a.accountType === "Income") {
      earnings += cr(l) - dr(l);
      continue;
    }
    if (a.accountType === "Expense") {
      earnings -= dr(l) - cr(l);
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
  if (earnings) equity.push({ id: "earnings", label: "Current earnings (income − expenses)", amount: earnings, accountType: "Equity" });
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
  const moves = cashByEntry(scopeLines(scoped, { from, to }), accounts);
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
export function payableAging(lines, accounts, asOf) {
  const ap = scopeLines(lines, { to: asOf }).filter((l) => acctOf(accounts, l)?.subtype === "payable");
  const rows = [];
  for (const [vendorId, ls] of groupBy(ap, (l) => dimOf(l, "vendorId") || "none")) {
    const entries = new Map(ls.map((l) => [l.entryId, l.entry]));
    for (const i of openItems(ls, accounts, "payable")) {
      const entry = entries.get(i.entryId) || {};
      const due = dayOf(entry.metadata?.dueDate) || dayOf(i.date);
      const days = daysBetweenIso(due, asOf) ?? 0;
      const row = { id: i.entryId, vendorId: vendorId === "none" ? "" : vendorId, propertyId: entry.propertyId || "", memo: i.memo || "Bill", billDate: i.date, dueDate: due, daysPastDue: Math.max(0, days), amount: i.amount, paid: i.paid, open: i.open, current: 0, b1: 0, b31: 0, b61: 0, b91: 0 };
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

// Trust cash per account × owner × property as of a date.
export function trustPositions(lines, accounts, asOf) {
  const per = new Map();
  for (const l of scopeLines(lines, { to: asOf })) {
    const a = acctOf(accounts, l);
    if (!isCash(a) || !a.isTrust) continue;
    const key = `${a.id}|${l.ownerId || ""}|${l.propertyId || ""}`;
    const r = per.get(key) || { id: key, account: accountLabel(a), systemKey: a.systemKey, ownerId: l.ownerId || "", propertyId: l.propertyId || "", balance: 0 };
    r.balance += dr(l) - cr(l);
    per.set(key, r);
  }
  return [...per.values()].map((r) => ({ ...r, balance: round2(r.balance) })).filter((r) => r.balance);
}

// Security deposits held per lease (else tenant) from the deposits liability.
export function depositsHeldByLease(lines, accounts, asOf) {
  const out = new Map();
  for (const l of scopeLines(lines, { to: asOf })) {
    const a = acctOf(accounts, l);
    if (a?.subtype !== "deposits") continue;
    const key = dimOf(l, "leaseId") || (dimOf(l, "tenantId") ? `tenant:${dimOf(l, "tenantId")}` : "");
    if (!key) continue;
    out.set(key, round2((out.get(key) || 0) + cr(l) - dr(l)));
  }
  return out;
}

// Cash paid per vendor in a range: per entry, Σ (credit − debit) on cash lines.
export function vendorPayments(lines, accounts, range = {}) {
  const per = new Map();
  for (const l of scopeLines(lines, range)) {
    const a = acctOf(accounts, l);
    if (!isCash(a)) continue;
    const vendorId = dimOf(l, "vendorId");
    if (!vendorId) continue;
    const r = per.get(vendorId) || { vendorId, total: 0, entries: new Set(), last: "" };
    r.total += cr(l) - dr(l);
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

// One owner's activity: lines tagged with the owner, plus untagged property lines
// that aren't the manager's own side of a fee posting.
export function ownerLines(lines, { ownerId, propertyIds = [] }) {
  const props = new Set(propertyIds);
  return lines.filter((l) => {
    const o = dimOf(l, "ownerId");
    if (o) return o === ownerId;
    return props.has(dimOf(l, "propertyId")) && l.entry?.sourceType !== "management_fee";
  });
}

// Owner statement totals for a range (cash in trust excludes deposit trust).
export function ownerStatement(lines, accounts, { from, to }) {
  const depositCash = accounts.byKey.get("deposit_cash")?.id;
  const fees = accounts.byKey.get("management_fees")?.id;
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
    let kind = "";
    if (a.accountType === "Income") {
      t.income += -amt;
      row.income += -amt;
      kind = "Income";
    } else if (a.id === fees) {
      t.fees += amt;
      row.fees += amt;
      kind = "Management fee";
    } else if (a.accountType === "Expense") {
      t.expenses += amt;
      row.expenses += amt;
      kind = "Expense";
    } else if (a.subtype === "contribution") {
      t.contributions += -amt;
      row.contributions += -amt;
      kind = "Contribution";
    } else if (a.subtype === "distribution") {
      t.distributions += amt;
      row.distributions += amt;
      kind = "Distribution";
    }
    if (trustCash) {
      if (amt > 0) t.receipts += amt;
      else t.disbursements += -amt;
    }
    byProperty.set(p, row);
    if (kind) {
      // Money in to the owner is positive, money out negative.
      detail.push({ id: l.id, date: d, kind, memo: l.memo || l.entry?.memo || "", account: accountLabel(a), propertyId: row.propertyId, source: sourceLabel(l.entry?.sourceType), amount: round2(-amt) });
    }
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
