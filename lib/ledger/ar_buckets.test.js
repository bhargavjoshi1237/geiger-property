import { test } from "node:test";
import assert from "node:assert/strict";
import { addBuckets, arLineBuckets, billedAmount, billedOf, emptyBuckets } from "./ar_buckets";
import { indexAccounts } from "./postings";
import { sumArMonths } from "./ar_reads";
import { computeMetric } from "@/lib/metrics/index";

// CORE-07: the Overview trend's "Rent billed" and the collection-rate denominator are one definition (billedOf):
// tenant charges and fees, less credit memos and downward true-ups, without security-deposit charges.

const accounts = indexAccounts([
  { id: "ar", accountType: "Asset", subtype: "receivable" },
  { id: "hap", accountType: "Asset", subtype: "subsidy_receivable" },
  { id: "inc", accountType: "Income", subtype: "income" },
]);
let seq = 0;
const ar = (sourceType, debit, credit, extra = {}) => {
  seq += 1;
  const date = extra.date || "2026-11-05";
  return { id: `l${seq}`, entryId: `e${seq}`, date, glAccountId: extra.gl || "ar", debit, credit, leaseId: "L1", tenantId: "T1", propertyId: "P1", appliesToEntryId: extra.appliesTo || "", entry: { id: `e${seq}`, sourceType, date, idempotencyKey: extra.key || "" } };
};
const month = [
  ar("charge", 1500, 0, { key: "rent:L1:2026-11" }), // rent
  ar("charge", 150, 0), // recurring parking
  ar("late_fee", 75, 0, { key: "late:L1:2026-11" }),
  ar("deposit_held", 1500, 0), // security deposit billed through AR: held funds, not billed
  ar("credit", 0, 200, { key: "rent-adj:L1:2026-11:1" }), // downward rent true-up
  ar("credit", 0, 50), // courtesy credit
  ar("concession", 0, 100), // move-in special (CORE-05)
  ar("payment", 0, 1200),
  ar("write_off", 0, 25), // bad debt: a settlement, not a billing correction
  ar("deposit_return", 0, 300), // deposit applied: a settlement
  ar("charge", 999, 0, { gl: "hap" }), // housing authority's share: never tenant billed (HOUS-01)
];
const BILLED = 1500 + 150 + 75 - 200 - 50 - 100;

test("billedOf pins the shared definition: charges and fees, less credits and true-ups, deposits excluded", () => {
  const b = month.filter((l) => l.glAccountId === "ar").reduce((acc, l) => addBuckets(acc, arLineBuckets(l.entry.sourceType, l.debit, l.credit)), emptyBuckets());
  assert.deepEqual(b, { charged: 3225, collected: 1200, credited: 675, transferred: 0, net: 1350, depositsCharged: 1500, billingCredits: 350 });
  assert.equal(billedOf(b), BILLED);
  assert.equal(billedAmount("deposit_held", 1500, 0), 0);
  assert.equal(billedAmount("write_off", 0, 25), 0);
  assert.equal(billedAmount("concession", 0, 100), -100);
});

test("the trend (ledger_ar_monthly rows) and the collection-rate metric (ledger lines) read the same billed figure", () => {
  // The view's row for this lease and month, as the SQL buckets it.
  const viewRow = { propertyId: "P1", leaseId: "L1", tenantId: "T1", month: "2026-11", charged: 3225, collected: 1200, credited: 675, transferred: 0, net: 1350, depositsCharged: 1500, billingCredits: 350 };
  const trend = sumArMonths([viewRow]).get("2026-11");
  const src = { properties: [{ id: "P1" }], ledger: { accounts, lines: month } };
  const params = { asOf: "2026-11-30", from: "2026-11-01", to: "2026-11-30" };
  assert.equal(trend.billed, BILLED);
  assert.equal(computeMetric("rent_billed", src, params).value, BILLED);
  assert.ok(Math.abs(computeMetric("collection_rate", src, params).value - 1200 / BILLED) < 1e-9);
  assert.equal(trend.collected, computeMetric("rent_collected", src, params).value);
});
