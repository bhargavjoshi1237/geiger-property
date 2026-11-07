import { test } from "node:test";
import assert from "node:assert/strict";

import { STEP_TYPES, getTrigger } from "@/lib/automations/catalog";
import { PLAYBOOKS, blockingPrerequisites, getPlaybook, playbookConfig } from "./index";
import { generatedRows, planUpdate } from "./install";
import { recommendPlaybooks } from "./recommend";

const READY = { status: { email: true, stripe: { configured: true } }, counts: { bankAccounts: 2, owners: 3, vendors: 5 } };

test("Collections ladder with a $50 fee on day 5 carries exactly those values", () => {
  const pb = getPlaybook("collections_ladder");
  const rows = generatedRows(pb, { feeAmount: 50, feeDay: 5, feeMode: "fixed" }, { installId: "inst-1" });
  const late = rows.find((r) => r.metadata.playbook.workflowKey === "late");
  assert.ok(late, "late workflow generated");
  assert.equal(late.triggerEvent, "rent.overdue");
  assert.equal(late.metadata.trigger.daysOverdue, 1);
  const steps = late.metadata.steps;
  const charge = steps.find((s) => s.type === "post_charge");
  assert.equal(charge.config.amount, 50);
  assert.equal(charge.config.amountType, "fixed");
  assert.equal(charge.config.kind, "late_fee");
  // The run starts on day 1 late, then waits until the fee day.
  const firstWait = steps.find((s) => s.type === "wait");
  assert.equal(late.metadata.trigger.daysOverdue + firstWait.config.days, 5);
  // Ask first gates money and legal steps; the install isn't switched on unless asked.
  assert.equal(late.autonomy, "approve");
  assert.deepEqual(late.metadata.autonomyConfig.appliesTo, ["money", "legal"]);
  assert.equal(late.enabled, false);
  assert.equal(late.status, "Draft");
  assert.ok(steps.some((s) => s.type === "send_email" && s.config.category === "legal"), "demand letter is a legal notice");
});

test("every playbook generates valid workflows with stable, unique step ids", () => {
  const known = new Set(STEP_TYPES.map((s) => s.key));
  for (const pb of PLAYBOOKS) {
    assert.ok(pb.key && pb.title && pb.outcome && pb.area && pb.version >= 1, pb.key);
    const config = playbookConfig(pb, {});
    const a = pb.workflows(config);
    const b = pb.workflows(config);
    assert.deepEqual(a.map((w) => w.steps.map((s) => s.id)), b.map((w) => w.steps.map((s) => s.id)), `${pb.key} ids are stable`);
    for (const w of a) {
      assert.ok(getTrigger(w.triggerEvent), `${pb.key}/${w.key} trigger ${w.triggerEvent}`);
      const ids = new Set();
      for (const s of w.steps) {
        assert.ok(known.has(s.type), `${pb.key}/${w.key} step type ${s.type}`);
        assert.ok(!ids.has(s.id), `${pb.key}/${w.key} duplicate id ${s.id}`);
        ids.add(s.id);
      }
    }
  }
});

test("property scope: one property is a rule, several an OR group", () => {
  const pb = getPlaybook("collections_ladder");
  const one = generatedRows(pb, { propertyIds: ["p1"] }, { installId: "i" })[0];
  assert.deepEqual(one.metadata.conditionRules, [{ field: "property_id", op: "equals", value: "p1" }]);
  const two = generatedRows(pb, { propertyIds: ["p1", "p2"] }, { installId: "i" })[0];
  assert.equal(two.metadata.conditions.op, "or");
  assert.equal(two.metadata.conditions.rules.length, 2);
});

test("missing prerequisites block install and say what to set up", () => {
  assert.deepEqual(blockingPrerequisites(getPlaybook("collections_ladder"), READY), []);
  const blocked = blockingPrerequisites(getPlaybook("collections_ladder"), { status: { email: false } });
  assert.equal(blocked[0].key, "email");
  assert.ok(blocked[0].missing && blocked[0].tab);
  // Capabilities Geiger doesn't have yet never pass.
  assert.equal(blockingPrerequisites(getPlaybook("owner_statements_payouts"), READY)[0].key, "payoutsProvider");
  assert.equal(blockingPrerequisites(getPlaybook("payment_plan_followup"), READY)[0].key, "paymentPlans");
  // Limitations are stated without blocking.
  assert.deepEqual(blockingPrerequisites(getPlaybook("month_end_close"), READY), []);
});

test("a version bump regenerates non-customized workflows only", () => {
  const v1 = getPlaybook("renewal_pipeline");
  const install = { id: "inst", version: 1, config: playbookConfig(v1, {}), automationIds: [] };
  const automations = generatedRows(v1, install.config, { installId: "inst" }).map((r, i) => ({ ...r, id: `a${i}` }));
  automations[1].metadata.playbook.customized = true;
  assert.equal(planUpdate(v1, install, automations).upToDate, true);

  const v2 = {
    ...v1,
    version: 2,
    changes: { ...v1.changes, 2: ["Nudges mention the offer date."] },
    workflows: (c) => [...v1.workflows(c).filter((w) => w.key !== "nudge2"), { key: "final", name: "Final call", triggerEvent: "lease.ending", trigger: { daysBefore: 30 }, steps: [] }],
  };
  const plan = planUpdate(v2, install, automations);
  assert.equal(plan.upToDate, false);
  assert.deepEqual(plan.changes, [{ version: 2, note: "Nudges mention the offer date." }]);
  assert.deepEqual(plan.keepCustomized.map((a) => a.id), ["a1"]);
  assert.deepEqual(plan.regenerate.map((r) => r.automation.id).sort(), ["a0", "a2"]);
  assert.deepEqual(plan.create.map((w) => w.key), ["final"]);
  assert.deepEqual(plan.retire.map((a) => a.id), ["a3"]);
});

test("recommendations appear only while their condition holds", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const owing = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, balance: 100, status: "Current" }));
  const keys = (r) => r.map((x) => x.playbookKey);

  assert.ok(keys(recommendPlaybooks({ tenants: owing(5), now })).includes("collections_ladder"));
  assert.ok(!keys(recommendPlaybooks({ tenants: owing(4), now })).includes("collections_ladder"));
  assert.ok(!keys(recommendPlaybooks({ tenants: owing(9), installs: [{ playbookKey: "collections_ladder", status: "active" }], now })).includes("collections_ladder"));

  const lease = { id: "l1", status: "Active", termEnd: "2026-12-20" };
  assert.ok(keys(recommendPlaybooks({ leases: [lease], renewals: [], now })).includes("renewal_pipeline"));
  assert.ok(!keys(recommendPlaybooks({ leases: [lease], renewals: [{ leaseId: "l1", status: "Offer sent" }], now })).includes("renewal_pipeline"));

  const signal = { detectorKey: "vendor_compliance", status: "open", title: "2 vendor COIs expire soon", recordRefs: [{}, {}] };
  assert.ok(keys(recommendPlaybooks({ signals: [signal], now })).includes("vendor_compliance_chase"));
  assert.ok(!keys(recommendPlaybooks({ signals: [{ ...signal, status: "resolved" }], now })).includes("vendor_compliance_chase"));
});
