import { test } from "node:test";
import assert from "node:assert/strict";
import { indexAccounts } from "@/lib/ledger/postings";
import { CLOSE_CHECKS, checklistSnapshot, evaluateCloseChecks, missingOverrides } from "./close_checks";

// CORE-40 close checklist: each check from loaded data for one period → { key, label, ok, count, link, detail }.

const PERIOD = { start: "2027-03-01", end: "2027-03-31", key: "2027-03" };
const ACCT = indexAccounts([
  { id: "trust", accountType: "Asset", subtype: "cash", isTrust: true, systemKey: "trust_cash" },
  { id: "undep", accountType: "Asset", subtype: "cash", isTrust: true, systemKey: "undeposited_funds" },
  { id: "rent", accountType: "Income", subtype: "income", systemKey: "rent_income" },
]);
const CLEAN = {
  accounts: ACCT,
  unbalanced: [],
  periodLines: [{ id: "l1", gl_account_id: "rent" }],
  balanceLines: [{ gl_account_id: "trust", property_id: "p1", debit: 500, credit: 0 }],
  banks: [{ id: "b1", name: "Trust", status: "Active" }, { id: "b2", name: "Old", status: "Closed" }],
  bankActivity: new Set(["b1"]),
  reconciliations: [{ bank_account_id: "b1", statement_date: "2027-03-28", status: "Finalized" }],
  bills: [],
  recurring: [],
  fees: { expected: [{ propertyId: "p1", key: "mgmt:p1:2027-03" }], posted: new Set(["mgmt:p1:2027-03"]) },
  undeposited: 0,
};
const byKey = (rs) => Object.fromEntries(rs.map((r) => [r.key, r]));

test("a clean month passes every check, in catalogue order with links", () => {
  const rs = evaluateCloseChecks(CLEAN, PERIOD);
  assert.deepEqual(rs.map((r) => r.key), CLOSE_CHECKS.map((c) => c.key));
  assert.ok(rs.every((r) => r.ok && r.count === 0), JSON.stringify(rs.filter((r) => !r.ok)));
  assert.equal(byKey(rs).bank_reconciled.link, "Bank Reconciliation");
});

test("each failure is counted and explained", () => {
  const rs = byKey(
    evaluateCloseChecks(
      {
        ...CLEAN,
        unbalanced: [{ entry_id: "e9" }],
        periodLines: [{ id: "l1", gl_account_id: "rent" }, { id: "l2", gl_account_id: "gone" }, { id: "l3", gl_account_id: null }],
        balanceLines: [
          { gl_account_id: "trust", property_id: "p1", debit: 0, credit: 120 },
          { gl_account_id: "trust", property_id: "p2", debit: 50, credit: 0 },
          { gl_account_id: "undep", property_id: "p1", debit: 75, credit: 0 },
        ],
        reconciliations: [{ bank_account_id: "b1", statement_date: "2027-03-20", status: "Finalized" }],
        bills: [
          { approval_status: "Pending", status: "Open", bill_date: "2027-03-10", amount: 200 },
          { approval_status: "Pending", status: "Void", bill_date: "2027-03-10", amount: 999 },
          { approval_status: "Pending", status: "Open", bill_date: "2027-04-02", amount: 50 },
        ],
        recurring: [{ amount: 25, next_date: "2027-03-15", ends_on: null }, { amount: 25, next_date: "2027-03-15", ends_on: "2027-03-01" }],
        fees: { expected: [{ propertyId: "p1", key: "mgmt:p1:2027-03" }], posted: new Set() },
        undeposited: 75,
      },
      PERIOD,
    ),
  );
  assert.equal(rs.unbalanced.count, 1);
  assert.equal(rs.missing_gl.count, 2);
  assert.equal(rs.trust_negative.count, 1);
  assert.match(rs.trust_negative.detail, /\$120\.00 short/);
  assert.equal(rs.bank_reconciled.count, 1, "a statement dated more than a week before month end doesn't cover it");
  assert.match(rs.bank_reconciled.detail, /Trust/);
  assert.equal(rs.bills_pending.count, 1, "void bills and bills after the period don't count");
  assert.equal(rs.recurring_posted.count, 1, "a charge that ended before its next date is done");
  assert.equal(rs.management_fees.count, 1);
  assert.equal(rs.undeposited_funds.count, 1);
  assert.ok(Object.values(rs).every((r) => r.ok === (r.count === 0)));
});

test("a bank with no activity by the period end needs no reconciliation", () => {
  const rs = byKey(evaluateCloseChecks({ ...CLEAN, bankActivity: new Set(), reconciliations: [] }, PERIOD));
  assert.equal(rs.bank_reconciled.ok, true);
});

test("overrides: failing checks need a note; the snapshot keeps it", () => {
  const results = [
    { key: "a", label: "A", ok: true, count: 0 },
    { key: "b", label: "B", ok: false, count: 2 },
  ];
  assert.deepEqual(missingOverrides(results, {}).map((r) => r.key), ["b"]);
  assert.deepEqual(missingOverrides(results, { b: "  " }).map((r) => r.key), ["b"]);
  assert.deepEqual(missingOverrides(results, { b: "statement late" }), []);
  assert.deepEqual(checklistSnapshot(results, { b: " statement late " }), [
    { key: "a", label: "A", ok: true, count: 0 },
    { key: "b", label: "B", ok: false, count: 2, note: "statement late" },
  ]);
});
