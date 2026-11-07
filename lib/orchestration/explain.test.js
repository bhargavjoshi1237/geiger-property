import { test } from "node:test";
import assert from "node:assert/strict";

import { explainConditions } from "@/lib/automations/catalog";
import { explainRun } from "./explain";

test("rent-overdue run explains each condition and the sentence form", () => {
  const record = { name: "Maya Patel", balance: 412, status: "Current" };
  const run = {
    status: "completed",
    metadata: {
      explanation: {
        trigger: { type: "rent.overdue", context: { balance: 412, minBalance: 100, daysLate: 6, daysOverdue: 5 } },
        conditions: explainConditions([{ field: "balance", op: "gt", value: "100" }], record, "tenant"),
        record: { type: "tenant", id: "t1", label: "Maya Patel" },
      },
    },
  };
  const ex = explainRun(run);
  assert.equal(ex.headline, "Ran because Maya Patel's balance ($412) is over $100 and rent is 6 days late (rule: at least 5) and 1 condition held.");
  assert.deepEqual(ex.conditions, [{ depth: 0, passed: true, text: "Balance is greater than 100 — it's 412" }]);
});

test("skipped runs say which condition failed", () => {
  const run = {
    status: "skipped",
    metadata: {
      explanation: {
        trigger: { type: "work_order.created", context: {} },
        conditions: explainConditions([{ field: "priority", op: "equals", value: "Urgent" }], { priority: "Low" }, "work_order"),
        record: { type: "work_order", id: "w1", label: "Leaky tap" },
      },
    },
  };
  assert.equal(explainRun(run).headline, "Didn't run: Priority is Urgent, but it's Low.");
});

test("runs without an explanation degrade gracefully", () => {
  assert.match(explainRun({ status: "completed", metadata: {} }).headline, /before explanations existed/);
});
