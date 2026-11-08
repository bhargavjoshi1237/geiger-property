import test from "node:test";
import assert from "node:assert/strict";
import { autopayDue } from "./autopay";

// Autopay must collect this month's rent even when it runs before the billing job (CORE-01).

const plan = { id: "plan-1", project_id: "project-1", lease_id: "lease-1", amount_mode: "balance" };

function fakes({ failBilling = false } = {}) {
  const calls = [];
  let billed = false;
  return {
    calls,
    loadContext: async () => {
      calls.push(billed ? "balance after billing" : "balance");
      return { ok: true, settings: {}, policies: { rentDueDay: 1 }, balance: billed ? 2060 : 0 };
    },
    billLease: async (_admin, leaseId) => {
      calls.push(`bill ${leaseId}`);
      if (failBilling) throw new Error("ledger offline");
      billed = true;
    },
  };
}

test("autopay bills the lease before it reads the balance", async () => {
  const f = fakes();
  const due = await autopayDue({}, plan, { today: "2027-01-01", billLease: f.billLease, loadContext: f.loadContext });
  assert.equal(due.amount, 2060);
  assert.deepEqual(f.calls, ["balance", "bill lease-1", "balance after billing"]);
});

test("before the charge day autopay neither bills nor collects", async () => {
  const f = fakes();
  const due = await autopayDue({}, { ...plan, charge_day: 5 }, { today: "2027-01-01", billLease: f.billLease, loadContext: f.loadContext });
  assert.equal(due.result, "skipped");
  assert.deepEqual(f.calls, ["balance"]);
});

test("a billing failure fails the run instead of recording nothing due", async () => {
  const f = fakes({ failBilling: true });
  const due = await autopayDue({}, plan, { today: "2027-01-01", billLease: f.billLease, loadContext: f.loadContext });
  assert.equal(due.result, "failed");
  assert.match(due.message, /couldn't bill the lease first/);
});
