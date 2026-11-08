import { round2 } from "@/lib/reports/format";
import { list, sum } from "@/lib/reports/lookups";
import {
  DEPOSIT_OPEN_STATUSES,
  OPEN_BILL_STATUSES,
  URGENT_PRIORITIES,
  addDays,
  billOpenAmount,
  billRows,
  billedLines,
  budgetVarianceRows,
  collectedLines,
  delinquentRows,
  expiringLeases,
  inScope,
  median,
  sumCredit,
  sumDebit,
  trailing,
  trustShortfalls,
  unitRows,
  workOrderRows,
} from "./helpers";
import { dayOf, daysBetweenIso } from "@/lib/reports/periods";

// The metric catalogue (ORCH-03): one named, documented definition per number the product shows.
// Each metric: { key, label, unit, area, description, formula, sources, grain, dimensions,
//   rows(src, p) → record rows, value(rows, src, p) → number|null, record(row) → { type, id, label, amount?, note? } }.
// compute() and sourceRecords() in ./index.js wrap these, so a figure always opens the rows behind it.

const recordLease = (r) => ({ type: r.leaseId ? "lease" : "tenant", id: r.leaseId || r.tenantId, label: [r.tenant, r.unit].filter(Boolean).join(" · "), amount: r.balance });
const recordUnit = (r) => ({ type: "unit", id: r.id, label: [r.label, r.property].filter(Boolean).join(" · "), amount: r.rent, note: r.vacant && r.days !== null ? `${r.days} days vacant` : r.status });
const recordWo = (w) => ({ type: "work_order", id: w.id, label: w.name || "Work order", amount: w.cost || undefined, note: [w.priority, w.status, w.due ? `due ${w.due}` : ""].filter(Boolean).join(" · ") });
const recordLeaseRow = (l) => ({ type: "lease", id: l.id, label: [l.tenantName || l.name, l.unit].filter(Boolean).join(" · "), amount: Number(l.rent) || 0, note: l.end ? `ends ${l.end}` : "" });
const recordBill = (b) => ({ type: "bill", id: b.id, label: [b.vendorName, b.name].filter(Boolean).join(" · ") || "Bill", amount: b.open || Number(b.amount) || 0, note: b.due ? `due ${b.due}` : "" });
const recordLine = (l) => ({ type: l.leaseId ? "lease" : l.tenantId ? "tenant" : "ledger_entry", id: l.leaseId || l.tenantId || l.entryId, label: l.entry?.memo || "Ledger line", amount: Number(l.credit) || Number(l.debit) || 0, note: dayOf(l.date) });

const ratio = (part, whole) => (whole > 0 ? part / whole : null);

// --- Occupancy & vacancy -------------------------------------------------------------

const occupancy = {
  key: "occupancy",
  label: "Occupancy",
  unit: "percent",
  area: "leasing",
  description: "Share of rentable units that are occupied on the day.",
  formula: "Occupied units ÷ units (Draft units excluded). A unit is occupied when a lease covers the day, or its status is Occupied or Notice.",
  sources: ["units", "leases", "properties"],
  grain: "unit",
  dimensions: ["property", "owner"],
  rows: (src, p) => unitRows(src, p).filter((u) => u.occupied),
  value: (rows, src, p) => ratio(rows.length, unitRows(src, p).length),
  record: recordUnit,
};

const physicalVacancy = {
  key: "physical_vacancy",
  label: "Physical vacancy",
  unit: "percent",
  area: "leasing",
  description: "Share of rentable units that are vacant, in make-ready or down with no lease.",
  formula: "Vacant units ÷ units. Vacant = status Vacant, Make-ready or Down with no lease covering the day.",
  sources: ["units", "leases", "properties"],
  grain: "unit",
  dimensions: ["property", "owner"],
  rows: (src, p) => unitRows(src, p).filter((u) => u.vacant),
  value: (rows, src, p) => ratio(rows.length, unitRows(src, p).length),
  record: recordUnit,
};

const economicVacancy = {
  key: "economic_vacancy",
  label: "Economic vacancy",
  unit: "percent",
  area: "leasing",
  description: "Share of potential rent sitting in vacant units.",
  formula: "Market rent of vacant units ÷ market rent of all units (unit rent is the market rent).",
  sources: ["units", "leases", "properties"],
  grain: "unit",
  dimensions: ["property", "owner"],
  rows: (src, p) => unitRows(src, p).filter((u) => u.vacant),
  value: (rows, src, p) => ratio(sum(rows, "rent"), sum(unitRows(src, p), "rent")),
  record: recordUnit,
};

const daysVacant = {
  key: "days_vacant",
  label: "Average days vacant",
  unit: "days",
  area: "leasing",
  description: "How long vacant units have been empty, on average.",
  formula: "Mean of (day − last lease end on record) over vacant units with a known lease end.",
  sources: ["units", "leases", "properties"],
  grain: "unit",
  dimensions: ["property", "owner"],
  rows: (src, p) => unitRows(src, p).filter((u) => u.vacant && u.days !== null),
  value: (rows) => (rows.length ? rows.reduce((s, r) => s + r.days, 0) / rows.length : null),
  record: recordUnit,
};

const vacancyLoss = {
  key: "vacancy_loss",
  label: "Vacancy loss",
  unit: "money",
  area: "leasing",
  description: "Market rent lost to vacant units in the period.",
  formula: "Σ over vacant units of market rent × 12 ÷ 365 × vacant days inside the period (the Occupancy & Vacancy report's loss).",
  sources: ["units", "leases", "properties"],
  grain: "unit",
  dimensions: ["property", "owner", "month"],
  rows: (src, p) => unitRows(src, p).filter((u) => u.vacant),
  value: (rows, src, p) => {
    const rangeDays = Math.max(1, (daysBetweenIso(p.from, p.asOf) ?? 0) + 1);
    return round2(
      rows.reduce((s, u) => {
        const start = u.since && u.since > p.from ? u.since : p.from;
        const inRange = Math.max(0, Math.min(rangeDays, (daysBetweenIso(start, p.asOf) ?? 0) + 1));
        return s + (u.rent * 12 * inRange) / 365;
      }, 0),
    );
  },
  record: recordUnit,
};

const turnTime = {
  key: "turn_time",
  label: "Median turn time",
  unit: "days",
  area: "maintenance",
  description: "Days from move-out to make-ready complete, for turns finished in the last 12 months.",
  formula: "Median of (ready date − move-out date) over unit turns with both dates, ready in the trailing 365 days.",
  sources: ["unitTurns", "properties"],
  grain: "unit_turn",
  dimensions: ["property"],
  rows: (src, p) => {
    const w = trailing(p, 365);
    return list(src.unitTurns)
      .map((t) => ({ ...t, ready: dayOf(t.readyDate), out: dayOf(t.moveOutDate) }))
      .filter((t) => t.ready && t.out && t.ready >= w.from && t.ready <= w.to && inScope(p, t.propertyId));
  },
  value: (rows) => median(rows.map((t) => Math.max(0, daysBetweenIso(t.out, t.ready) ?? 0))),
  record: (t) => ({ type: "unit_turn", id: t.id, label: [t.unit, t.propertyName].filter(Boolean).join(" · ") || "Unit turn", note: `${t.out} → ${t.ready}` }),
};

// --- Collections ---------------------------------------------------------------------

const rentCollected = {
  key: "rent_collected",
  label: "Rent collected",
  unit: "money",
  area: "collections",
  description: "Payments applied to tenant receivables in the period.",
  formula: "Σ credits to accounts receivable from payment entries dated in the period (ledger).",
  sources: ["ledger", "properties"],
  grain: "ledger line",
  dimensions: ["property", "owner", "month"],
  rows: (src, p) => collectedLines(src, p),
  value: (rows) => sumCredit(rows),
  record: recordLine,
};

const rentBilled = {
  key: "rent_billed",
  label: "Rent billed",
  unit: "money",
  area: "collections",
  description: "Rent and fee charges posted to tenant receivables in the period.",
  formula: "Σ debits to accounts receivable from charge and late-fee entries dated in the period (ledger).",
  sources: ["ledger", "properties"],
  grain: "ledger line",
  dimensions: ["property", "owner", "month"],
  rows: (src, p) => billedLines(src, p),
  value: (rows) => sumDebit(rows),
  record: recordLine,
};

const collectionRate = {
  key: "collection_rate",
  label: "Collection rate",
  unit: "percent",
  area: "collections",
  description: "How much of what was billed in the period has been collected.",
  formula: "Rent collected ÷ rent billed, both for the period.",
  sources: ["ledger", "properties"],
  grain: "ledger line",
  dimensions: ["property", "owner", "month"],
  rows: (src, p) => collectedLines(src, p),
  value: (rows, src, p) => ratio(sumCredit(rows), sumDebit(billedLines(src, p))),
  record: recordLine,
};

const delinquentBalance = {
  key: "delinquent_balance",
  label: "Delinquent balance",
  unit: "money",
  area: "collections",
  description: "What tenants owe on the day — the Delinquency report's total.",
  formula: "Σ positive accounts-receivable balances per lease (else tenant) as of the day, from the ledger.",
  sources: ["ledger", "leases", "tenants", "units", "properties"],
  grain: "lease",
  dimensions: ["property", "owner"],
  rows: delinquentRows,
  value: (rows) => round2(sum(rows, "balance")),
  record: recordLease,
};

const delinquentAccounts = {
  ...delinquentBalance,
  key: "delinquent_accounts",
  label: "Delinquent accounts",
  unit: "count",
  description: "Leases (or tenants) with a balance owing on the day.",
  formula: "Count of leases (else tenants) whose accounts-receivable balance is above zero as of the day.",
  value: (rows) => rows.length,
};

const delinquentOver60 = {
  ...delinquentBalance,
  key: "delinquent_over_60",
  label: "Owed over 60 days",
  description: "The part of the delinquent balance from charges more than 60 days old.",
  formula: "Σ open charges aged 61–90 and 90+ days (charge date to the day), per the Delinquency aging.",
  rows: (src, p) => delinquentRows(src, p).filter((r) => r.b61 + r.b91 > 0),
  value: (rows) => round2(sum(rows, (r) => r.b61 + r.b91)),
};

const delinquencyAging = {
  ...delinquentBalance,
  key: "delinquency_aging",
  label: "Delinquency aging",
  description: "The delinquent balance split by the age of the open charges.",
  formula: "Open charges aged from their charge date into 0–30, 31–60, 61–90 and 90+ days.",
  breakdown: (rows) => ({
    b0: round2(sum(rows, "b0")),
    b31: round2(sum(rows, "b31")),
    b61: round2(sum(rows, "b61")),
    b91: round2(sum(rows, "b91")),
  }),
};

// --- Maintenance -----------------------------------------------------------------------

const openWorkOrders = {
  key: "open_work_orders",
  label: "Open work orders",
  unit: "count",
  area: "maintenance",
  description: "Work orders and requests that aren't finished.",
  formula: "Count of work orders whose status isn't Completed, Rejected, Converted, Cancelled, Closed or Draft.",
  sources: ["workOrders", "units", "properties"],
  grain: "work order",
  dimensions: ["property"],
  rows: (src, p) => workOrderRows(src, p).filter((w) => w.open),
  value: (rows) => rows.length,
  record: recordWo,
};

const urgentWorkOrders = {
  ...openWorkOrders,
  key: "urgent_work_orders",
  label: "Urgent or high work orders",
  description: "Open work orders marked Urgent or High.",
  formula: "Open work orders with priority Urgent or High.",
  rows: (src, p) => workOrderRows(src, p).filter((w) => w.open && URGENT_PRIORITIES.includes(w.priority)),
};

const overdueWorkOrders = {
  ...openWorkOrders,
  key: "overdue_work_orders",
  label: "Overdue work orders",
  description: "Open work orders past their due date.",
  formula: "Open work orders whose due date is before the day.",
  rows: (src, p) => workOrderRows(src, p).filter((w) => w.open && w.due && w.due < p.asOf),
};

const workOrderTurnaround = {
  ...openWorkOrders,
  key: "work_order_turnaround",
  label: "Median work-order turnaround",
  unit: "days",
  description: "Days from opening to completion, for work orders completed in the last 90 days.",
  formula: "Median of (completed date − created date) over work orders completed in the trailing 90 days.",
  rows: (src, p) => {
    const w = trailing(p, 90);
    return workOrderRows(src, p).filter((x) => x.completed && x.created && x.completed >= w.from && x.completed <= w.to);
  },
  value: (rows) => median(rows.map((w) => Math.max(0, daysBetweenIso(w.created, w.completed) ?? 0))),
};

// --- Leasing ---------------------------------------------------------------------------

const expiring = (days) => ({
  key: `leases_expiring_${days}`,
  label: `Leases expiring in ${days} days`,
  unit: "count",
  area: "leasing",
  description: `Active leases whose term ends within ${days} days.`,
  formula: `Leases with an active status (Active, Expiring soon, Month-to-month, Notice given, Eviction) whose end date falls in the next ${days} days.`,
  sources: ["leases", "units", "properties"],
  grain: "lease",
  dimensions: ["property", "owner"],
  rows: (src, p) => expiringLeases(src, p, days),
  value: (rows) => rows.length,
  record: recordLeaseRow,
});

const DECIDED = ["Accepted", "Declined", "Moving out"];
const renewalRate = {
  key: "renewal_rate",
  label: "Renewal rate",
  unit: "percent",
  area: "leasing",
  description: "Of the renewals decided for leases ending in the last 12 months (or soon), how many were accepted.",
  formula: "Accepted ÷ (Accepted + Declined + Moving out) over renewals whose current term ends in the trailing 365 days through the next 90.",
  sources: ["renewals", "units", "properties"],
  grain: "renewal",
  dimensions: ["property"],
  rows: (src, p) => {
    const from = addDays(p.asOf, -365);
    const to = addDays(p.asOf, 90);
    const units = new Map(list(src.units).map((u) => [u.id, u]));
    return list(src.renewals).filter((r) => {
      const end = dayOf(r.currentEnd);
      return DECIDED.includes(r.status) && (!end || (end >= from && end <= to)) && inScope(p, units.get(r.unitId)?.propertyId || "");
    });
  },
  value: (rows) => ratio(rows.filter((r) => r.status === "Accepted").length, rows.length),
  record: (r) => ({ type: "renewal", id: r.id, label: [r.tenantName, r.unit].filter(Boolean).join(" · ") || "Renewal", note: r.status }),
};

// --- Payables & accounting -------------------------------------------------------------

const apDue = {
  key: "ap_due",
  label: "Payables due",
  unit: "money",
  area: "accounting",
  description: "Approved bills still open that are overdue or due within 7 days.",
  formula: "Σ (amount − paid) over Open / Partially paid bills that don't need approval or are approved, due on or before the day + 7.",
  sources: ["bills", "properties"],
  grain: "bill",
  dimensions: ["property"],
  rows: (src, p) => {
    const until = addDays(p.asOf, 7);
    return billRows(src, p).filter(
      (b) => OPEN_BILL_STATUSES.includes(b.status) && b.approvalStatus !== "Pending" && b.approvalStatus !== "Rejected" && b.open > 0 && b.due && b.due <= until,
    );
  },
  value: (rows) => round2(sum(rows, "open")),
  record: recordBill,
};

const billsOverdue = {
  ...apDue,
  key: "bills_overdue",
  label: "Bills past due",
  description: "Open bills whose due date has passed.",
  formula: "Σ (amount − paid) over bills with an open amount (not Paid, Void or Draft) whose due date is before the day.",
  rows: (src, p) => billRows(src, p).filter((b) => b.due && b.due < p.asOf && billOpenAmount(b) > 0),
};

const unapprovedBills = {
  ...apDue,
  key: "unapproved_bills",
  label: "Bills awaiting approval",
  unit: "count",
  description: "Bills over the approval limit that nobody has approved yet.",
  formula: "Count of bills with approval status Pending (not Void).",
  rows: (src, p) => billRows(src, p).filter((b) => b.approvalStatus === "Pending" && b.status !== "Void"),
  value: (rows) => rows.length,
};

const trustShortfall = {
  key: "trust_shortfall",
  label: "Trust shortfall",
  unit: "money",
  area: "accounting",
  description: "Trust cash positions below zero — one owner's funds covering another's.",
  formula: "Σ |balance| of trust cash positions (account × owner × property, owner shares by the ownership in force on each line's date) that are negative on the day (ledger).",
  sources: ["ledger", "owners", "properties", "propertyOwners"],
  grain: "trust position",
  dimensions: ["property", "owner"],
  rows: trustShortfalls,
  value: (rows) => round2(rows.reduce((s, r) => s + Math.abs(r.balance), 0)),
  record: (r) => ({ type: r.ownerId ? "owner" : "property", id: r.ownerId || r.propertyId, label: r.account, amount: Math.abs(r.balance) }),
};

const budgetVariance = {
  key: "budget_variance",
  label: "Expense budget variance (YTD)",
  unit: "percent",
  area: "accounting",
  description: "How far year-to-date operating expenses are above (+) or below (−) budget.",
  formula: "(Σ actual expense − Σ budgeted expense) ÷ Σ budgeted expense, January through the day's month, over budgets for the year.",
  sources: ["ledger", "budgets", "budgetLines", "properties"],
  grain: "budget line",
  dimensions: ["property", "month"],
  rows: budgetVarianceRows,
  value: (rows) => {
    const budget = sum(rows, "budget");
    return budget > 0 ? (sum(rows, "actual") - budget) / budget : null;
  },
  record: (r) => ({ type: "budget", id: r.budgetId, label: `${r.account} · ${r.budgetName}`, amount: r.variance, note: r.pct === null ? "" : `${(r.pct * 100).toFixed(0)}% vs budget` }),
};

const depositsDue = {
  key: "deposit_returns_due",
  label: "Deposit returns due",
  unit: "count",
  area: "accounting",
  description: "Security deposits awaiting disposition with a return deadline in the next 7 days or already past.",
  formula: "Deposits with status Pending, Held or Awaiting disposition whose return-due date is on or before the day + 7.",
  sources: ["deposits", "properties"],
  grain: "deposit",
  dimensions: ["property"],
  rows: (src, p) => {
    const until = addDays(p.asOf, 7);
    return list(src.deposits).filter((d) => DEPOSIT_OPEN_STATUSES.includes(d.status) && dayOf(d.returnDue) && dayOf(d.returnDue) <= until && inScope(p, d.propertyId));
  },
  value: (rows) => rows.length,
  record: (d) => ({ type: "deposit", id: d.id, label: [d.tenantName, d.unit].filter(Boolean).join(" · ") || "Deposit", amount: Number(d.amount) || 0, note: `return due ${dayOf(d.returnDue)}` }),
};

export const METRICS = [
  occupancy,
  physicalVacancy,
  economicVacancy,
  daysVacant,
  vacancyLoss,
  turnTime,
  rentCollected,
  rentBilled,
  collectionRate,
  delinquentBalance,
  delinquentAccounts,
  delinquentOver60,
  delinquencyAging,
  openWorkOrders,
  urgentWorkOrders,
  overdueWorkOrders,
  workOrderTurnaround,
  expiring(30),
  expiring(60),
  expiring(90),
  renewalRate,
  apDue,
  billsOverdue,
  unapprovedBills,
  trustShortfall,
  budgetVariance,
  depositsDue,
];

export const METRIC_AREAS = {
  collections: "Collections",
  leasing: "Leasing",
  maintenance: "Maintenance",
  accounting: "Accounting",
};

export const getMetric = (key) => METRICS.find((m) => m.key === key) || null;

// Every report source the given metrics read (plus properties for scoping).
export const metricSources = (keys = METRICS.map((m) => m.key)) => [
  ...new Set(["properties", ...keys.flatMap((k) => getMetric(k)?.sources || [])]),
];
