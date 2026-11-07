import { test } from "node:test";
import assert from "node:assert/strict";

import { needsApproval, prepareBill, workOrderGlKey } from "./bills";

test("approval: only amounts over a set limit wait", () => {
  assert.equal(needsApproval(300, 500), false);
  assert.equal(needsApproval(500, 500), false);
  assert.equal(needsApproval(800, 500), true);
  assert.equal(needsApproval(800, 0), false);
});

test("gl key: repairs by default, turns and capital by work order", () => {
  assert.equal(workOrderGlKey({ category: "Plumbing" }), "repairs_maintenance");
  assert.equal(workOrderGlKey({ category: "Plumbing", unitTurnId: "t1" }), "turnover");
  assert.equal(workOrderGlKey({ category: "Make-ready" }), "turnover");
  assert.equal(workOrderGlKey({ category: "HVAC", metadata: { expenseType: "Capital" } }), "capital_improvements");
});

test("prepareBill: limit 500 posts 300, holds 800 and copies dimensions", () => {
  const wo = { id: "w1", property_id: "p1", unit_id: "u1", vendor_id: "v1", category: "Plumbing", metadata: { jobId: "j1" } };
  const ok = prepareBill({ name: "A", amount: 300 }, { approvalLimit: 500, workOrder: wo });
  assert.equal(ok.row.approval_status, "Not required");
  assert.equal(ok.approvalRequired, false);
  assert.equal(ok.glKey, "repairs_maintenance");
  assert.deepEqual([ok.row.property_id, ok.row.unit_id, ok.row.job_id, ok.row.work_order_id, ok.row.vendor_id], ["p1", "u1", "j1", "w1", "v1"]);
  const held = prepareBill({ name: "B", amount: 800 }, { approvalLimit: 500, workOrder: wo });
  assert.equal(held.row.approval_status, "Pending");
});

test("prepareBill: explicit GL wins and a portal Pending stays Pending", () => {
  const r = prepareBill({ amount: 10, glAccountId: "g1", approvalStatus: "Pending" }, { approvalLimit: 0 });
  assert.equal(r.glKey, null);
  assert.equal(r.row.gl_account_id, "g1");
  assert.equal(r.row.approval_status, "Pending");
});
