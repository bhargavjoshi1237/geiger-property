import { test } from "node:test";
import assert from "node:assert/strict";

import { aggregateRuns, attributeCollections, isCollectionsAutomation } from "./impact";
import { DEFAULT_MINUTES, hoursFromRows, minutesFromRows, resolveMinutes } from "./value";

const run = (over) => ({ automation_id: "a1", status: "completed", started_at: "2026-11-01T10:00:00Z", finished_at: "2026-11-06T10:00:00Z", log: [], ...over });

test("runs, completions and completed steps roll up by the day they happened", () => {
  const runs = [
    run({
      log: [
        { type: "send_email", status: "ok", at: "2026-11-01T10:00:01Z" },
        { type: "wait", status: "waiting", at: "2026-11-01T10:00:02Z" },
        { type: "send_email", status: "warning", at: "2026-11-06T10:00:00Z" },
        { type: "post_charge", status: "error", at: "2026-11-06T10:00:00Z" },
      ],
    }),
    run({ status: "failed", finished_at: "2026-11-02T09:00:00Z", log: [{ type: "notify", status: "ok", at: "2026-11-02T09:00:00Z" }] }),
    run({ status: "skipped", log: [] }),
  ];
  const v = aggregateRuns(runs, "2026-11-01");
  assert.equal(v.get("2026-11-01|a1|runs"), 2);
  assert.equal(v.get("2026-11-06|a1|runs_completed"), 1);
  assert.equal(v.get("2026-11-02|a1|runs_failed"), 1);
  assert.equal(v.get("2026-11-01|a1|steps.send_email"), 1);
  assert.equal(v.get("2026-11-06|a1|steps.send_email"), 1);
  assert.equal(v.get("2026-11-02|a1|steps.notify"), 1);
  assert.equal(v.has("2026-11-06|a1|steps.post_charge"), false, "failed steps don't count");
  assert.equal(v.has("2026-11-01|a1|steps.wait"), false, "waits cost no time");
  // Only dates inside the window are produced.
  assert.equal(aggregateRuns(runs, "2026-11-03").has("2026-11-01|a1|runs"), false);
});

test("payments count once, against the latest collections run within 14 days", () => {
  const runs = [
    { automationId: "early", startedAt: "2026-10-01T08:00:00Z", tenantId: "t1" },
    { automationId: "late", startedAt: "2026-10-05T08:00:00Z", tenantId: "t1" },
    { automationId: "lease", startedAt: "2026-10-05T08:00:00Z", leaseId: "l9" },
  ];
  const out = attributeCollections(
    [
      { date: "2026-10-10", amount: 300, tenantId: "t1" },
      { date: "2026-10-30", amount: 200, tenantId: "t1" },
      { date: "2026-10-04", amount: 50, tenantId: "t1" },
      { date: "2026-10-06", amount: 75, tenantId: "t2", leaseId: "l9" },
      { date: "2026-09-30", amount: 999, tenantId: "t1" },
    ],
    runs,
  );
  assert.deepEqual(out, [
    { date: "2026-10-10", automationId: "late", amount: 300 },
    { date: "2026-10-04", automationId: "early", amount: 50 },
    { date: "2026-10-06", automationId: "lease", amount: 75 },
  ]);
});

test("editing minutes per task recalculates hours saved", () => {
  const rows = [
    { metric: "steps.send_email", value: 30 },
    { metric: "steps.post_charge", value: 6 },
    { metric: "runs", value: 40 },
  ];
  assert.equal(minutesFromRows(rows, DEFAULT_MINUTES), 30 * 4 + 6 * 5);
  assert.equal(hoursFromRows(rows, DEFAULT_MINUTES), 2.5);
  const edited = resolveMinutes({ minutes: { send_email: 10 } });
  assert.equal(edited.post_charge, DEFAULT_MINUTES.post_charge);
  assert.equal(minutesFromRows(rows, edited), 30 * 10 + 6 * 5);
  assert.equal(hoursFromRows(rows, edited), 5.5);
  assert.equal(resolveMinutes({ minutes: { send_email: -3 } }).send_email, DEFAULT_MINUTES.send_email);
});

test("collections automations are recognised by playbook, trigger or starter", () => {
  assert.equal(isCollectionsAutomation({ metadata: { playbook: { key: "collections_ladder" } } }), true);
  assert.equal(isCollectionsAutomation({ trigger_event: "rent.overdue", metadata: {} }), true);
  assert.equal(isCollectionsAutomation({ metadata: { builtIn: "collections" } }), true);
  assert.equal(isCollectionsAutomation({ trigger_event: "lease.created", metadata: {} }), false);
});
