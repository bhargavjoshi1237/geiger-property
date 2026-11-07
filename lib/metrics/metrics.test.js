import { test } from "node:test";
import assert from "node:assert/strict";
import { indexAccounts } from "@/lib/ledger/postings";
import { delinquencyReport, occupancyReport } from "@/lib/reports/defs_operations";
import { METRICS, computeMetric, sourceRecords } from "./index";

// Metric definitions over a small fixture shaped like the demo seed (report-source rows). Each
// metric is checked by hand, and the shared ones against the report that publishes the same number.

const ASOF = "2026-11-08";
const accounts = indexAccounts([
  { id: "ar", name: "Accounts receivable", accountType: "Asset", subtype: "receivable", systemKey: "accounts_receivable" },
  { id: "rent", name: "Rent income", accountType: "Income", subtype: "income", systemKey: "rent_income" },
  { id: "cash", name: "Trust cash", accountType: "Asset", subtype: "cash", isTrust: true, systemKey: "trust_cash" },
  { id: "repairs", name: "Repairs", accountType: "Expense", subtype: "expense" },
]);
const entry = (id, sourceType, date, memo = "") => ({ id, sourceType, date, memo, status: "Posted", metadata: {} });
const line = (o) => ({ propertyId: "p1", debit: 0, credit: 0, ...o, entry: o.entry, account: accounts.byId.get(o.glAccountId) });

const charge = (id, lease, date, amount) => [
  line({ id: `${id}a`, entryId: id, date, glAccountId: "ar", debit: amount, leaseId: lease, tenantId: `t-${lease}`, entry: entry(id, "charge", date) }),
  line({ id: `${id}b`, entryId: id, date, glAccountId: "rent", credit: amount, leaseId: lease, entry: entry(id, "charge", date) }),
];
const payment = (id, lease, date, amount, applies) => [
  line({ id: `${id}a`, entryId: id, date, glAccountId: "cash", debit: amount, leaseId: lease, ownerId: "o1", entry: entry(id, "payment", date) }),
  line({ id: `${id}b`, entryId: id, date, glAccountId: "ar", credit: amount, leaseId: lease, tenantId: `t-${lease}`, appliesToEntryId: applies, entry: entry(id, "payment", date) }),
];

const src = {
  properties: [{ id: "p1", name: "Harbor Lofts" }, { id: "p2", name: "Pinecrest" }],
  units: [
    { id: "u1", label: "101", propertyId: "p1", status: "Occupied", rent: 1500 },
    { id: "u2", label: "102", propertyId: "p1", status: "Vacant", rent: 1400, leaseEnd: "2026-10-09" },
    { id: "u3", label: "201", propertyId: "p2", status: "Occupied", rent: 1600 },
    { id: "u4", label: "202", propertyId: "p2", status: "Draft", rent: 1000 },
  ],
  leases: [
    { id: "l1", unitId: "u1", propertyId: "p1", tenantId: "t-l1", tenantName: "Maya Patel", status: "Active", termStart: "2026-01-01", termEnd: "2026-11-30", rent: 1500 },
    { id: "l3", unitId: "u3", propertyId: "p2", tenantId: "t-l3", tenantName: "Sam Okafor", status: "Active", termStart: "2026-02-01", termEnd: "2027-01-20", rent: 1600 },
  ],
  tenants: [{ id: "t-l1", name: "Maya Patel" }, { id: "t-l3", name: "Sam Okafor" }],
  ledger: {
    accounts,
    lines: [
      ...charge("c1", "l1", "2026-08-01", 1500),
      ...payment("y1", "l1", "2026-08-03", 1500, "c1"),
      ...charge("c2", "l1", "2026-11-01", 1500),
      ...payment("y2", "l1", "2026-11-04", 1100, "c2"),
      ...charge("c3", "l3", "2026-08-01", 1600).map((l) => ({ ...l, propertyId: "p2" })),
      ...charge("c4", "l3", "2026-11-01", 1600).map((l) => ({ ...l, propertyId: "p2" })),
    ],
  },
  workOrders: [
    { id: "w1", name: "Leak", unitId: "u1", propertyId: "p1", status: "Open", priority: "Urgent", dueDate: "2026-11-01", createdAt: "2026-10-30T10:00:00Z" },
    { id: "w2", name: "Paint", unitId: "u2", propertyId: "p1", status: "Completed", priority: "Low", createdAt: "2026-10-01T10:00:00Z", completedDate: "2026-10-05" },
    { id: "w3", name: "Door", unitId: "u3", propertyId: "p2", status: "Completed", priority: "Medium", createdAt: "2026-10-10T10:00:00Z", completedDate: "2026-10-20" },
    { id: "w4", name: "Draft", unitId: "u3", propertyId: "p2", status: "Draft", priority: "High" },
  ],
  renewals: [
    { id: "r1", leaseId: "l1", unitId: "u1", status: "Accepted", currentEnd: "2026-11-30" },
    { id: "r2", leaseId: "lx", unitId: "u3", status: "Declined", currentEnd: "2026-06-30" },
    { id: "r3", leaseId: "ly", unitId: "u3", status: "Offer sent", currentEnd: "2026-12-30" },
  ],
  bills: [
    { id: "b1", vendorName: "Rainier Plumbing", propertyId: "p1", status: "Open", approvalStatus: "Not required", amount: 900, amountPaid: 0, dueDate: "2026-11-01" },
    { id: "b2", vendorName: "Summit", propertyId: "p1", status: "Open", approvalStatus: "Pending", amount: 3000, amountPaid: 0, dueDate: "2026-11-12" },
    { id: "b3", vendorName: "Acme", propertyId: "p2", status: "Partially paid", approvalStatus: "Approved", amount: 500, amountPaid: 200, dueDate: "2026-11-14" },
    { id: "b4", vendorName: "Paid Co", propertyId: "p2", status: "Paid", approvalStatus: "Approved", amount: 100, amountPaid: 100, dueDate: "2026-10-01" },
  ],
  unitTurns: [{ id: "x1", unit: "102", propertyId: "p1", moveOutDate: "2026-09-01", readyDate: "2026-09-15" }],
  budgets: [{ id: "bg1", name: "2026 Harbor", propertyId: "p1", year: 2026, status: "Approved" }],
  budgetLines: [
    { id: "bl1", budgetId: "bg1", glAccountId: "repairs", month: 1, amount: 1000 },
    { id: "bl2", budgetId: "bg1", glAccountId: "repairs", month: 12, amount: 5000 },
  ],
  deposits: [{ id: "d1", tenantName: "Ex Tenant", propertyId: "p1", status: "Awaiting disposition", returnDue: "2026-11-10", amount: 1500 }],
};
src.ledger.lines.push(
  line({ id: "e1a", entryId: "e1", date: "2026-03-01", glAccountId: "repairs", debit: 1250, entry: entry("e1", "bill", "2026-03-01") }),
  line({ id: "e1b", entryId: "e1", date: "2026-03-01", glAccountId: "cash", credit: 1250, ownerId: "o1", entry: entry("e1", "bill", "2026-03-01") }),
  // Owner o2 was paid 300 from trust it never funded: a shortfall.
  line({ id: "d1a", entryId: "d1", date: "2026-10-15", glAccountId: "cash", credit: 300, ownerId: "o2", propertyId: "p2", entry: entry("d1", "distribution", "2026-10-15") }),
  line({ id: "d1b", entryId: "d1", date: "2026-10-15", glAccountId: "rent", debit: 300, ownerId: "o2", propertyId: "p2", entry: entry("d1", "distribution", "2026-10-15") }),
);

const v = (key, params = {}) => computeMetric(key, src, { asOf: ASOF, ...params }).value;
const reportStat = (def, label, f) => def.compute(src, { preset: "custom", from: "2026-11-01", to: ASOF, propertyId: "all", ...f }).stats.find((s) => s.label === label).value;

test("every metric is documented and drills down to records", () => {
  for (const m of METRICS) {
    assert.ok(m.label && m.description && m.formula && m.unit && m.sources.length, `${m.key} documented`);
    const out = computeMetric(m.key, src, { asOf: ASOF });
    assert.equal(out.key, m.key);
    for (const r of sourceRecords(m.key, src, { asOf: ASOF })) assert.ok(r.type && r.id && r.label !== undefined, `${m.key} record`);
  }
});

test("delinquent balance equals the Delinquency report, overall and per property", () => {
  // l1 owes 400 (Nov), l3 owes 3,200 (Aug + Nov).
  assert.equal(v("delinquent_balance"), 3600);
  assert.equal(reportStat(delinquencyReport, "Total delinquent"), "$3,600.00");
  assert.equal(v("delinquent_balance", { propertyId: "p2" }), 3200);
  assert.equal(reportStat(delinquencyReport, "Total delinquent", { propertyId: "p2" }), "$3,200.00");
  assert.equal(v("delinquent_accounts"), 2);
  assert.equal(v("delinquent_over_60"), 1600);
  assert.deepEqual(computeMetric("delinquency_aging", src, { asOf: ASOF }).breakdown, { b0: 2000, b31: 0, b61: 0, b91: 1600 });
});

test("collections: billed, collected and collection rate for the month", () => {
  assert.equal(v("rent_billed"), 3100);
  assert.equal(v("rent_collected"), 1100);
  assert.ok(Math.abs(v("collection_rate") - 1100 / 3100) < 1e-9);
  assert.equal(v("rent_collected", { propertyId: "p2" }), 0);
});

test("occupancy and vacancy match the Occupancy report", () => {
  assert.ok(Math.abs(v("occupancy") - 2 / 3) < 1e-9);
  assert.equal(reportStat(occupancyReport, "Occupancy"), "67%");
  assert.ok(Math.abs(v("physical_vacancy") - 1 / 3) < 1e-9);
  assert.ok(Math.abs(v("economic_vacancy") - 1400 / 4500) < 1e-9);
  assert.equal(v("days_vacant"), 30);
  assert.equal(v("turn_time"), 14);
});

test("work orders: open, urgent, overdue and median turnaround", () => {
  assert.equal(v("open_work_orders"), 1);
  assert.equal(v("urgent_work_orders"), 1);
  assert.equal(v("overdue_work_orders"), 1);
  assert.equal(v("work_order_turnaround"), 7);
});

test("leasing: expirations and renewal rate", () => {
  assert.equal(v("leases_expiring_30"), 1);
  assert.equal(v("leases_expiring_90"), 2);
  assert.equal(v("renewal_rate"), 0.5);
});

test("payables, trust, budget and deposits", () => {
  assert.equal(v("bills_overdue"), 900);
  assert.equal(v("ap_due"), 1200);
  assert.equal(v("unapproved_bills"), 1);
  assert.equal(v("trust_shortfall"), 300);
  assert.ok(Math.abs(v("budget_variance") - 0.25) < 1e-9);
  assert.equal(v("deposit_returns_due"), 1);
});
