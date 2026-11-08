import { test } from "node:test";
import assert from "node:assert/strict";
import { closeDecision, latestApproval } from "./close_period";
import { getPlaybook } from "@/lib/orchestration/playbooks";

// CORE-40: the month-end playbook locks the month only after an approval, in order, with every check passing.

const MARCH = { key: "2027-03", start: "2027-03-01", end: "2027-03-31", label: "March 2027" };
const base = { period: MARCH, lockedThrough: "2027-02-28", today: "2027-04-03", approved: true };

test("closeDecision: closes the next month once approved and clean", () => {
  assert.deepEqual(closeDecision(base), { action: "close", reason: "" });
  assert.equal(closeDecision({ ...base, lockedThrough: "" }).action, "close", "a first close may be any ended month");
});

test("closeDecision: hands the close to a person otherwise", () => {
  assert.equal(closeDecision({ ...base, approved: false }).action, "handoff");
  assert.equal(closeDecision({ ...base, lockedThrough: "2027-03-31" }).action, "skip");
  assert.match(closeDecision({ ...base, lockedThrough: "2027-01-31" }).reason, /February 2027 isn't closed yet/);
  assert.match(closeDecision({ ...base, today: "2027-03-31" }).reason, /hasn't ended/);
  const failing = closeDecision({ ...base, failing: [{ label: "Bank accounts reconciled through the period end" }] });
  assert.equal(failing.action, "handoff");
  assert.match(failing.reason, /1 check still fails: bank accounts reconciled/);
});

test("latestApproval: the newest approval on the run", () => {
  assert.equal(latestApproval({ metadata: {} }), null);
  const run = { metadata: { approvals: { 1: { by: "Ann", at: "2027-04-03T10:00:00Z" }, 4: { by: "Bo", byId: "u2", at: "2027-04-03T11:00:00Z" } } } };
  assert.equal(latestApproval(run).by, "Bo");
});

test("the month-end playbook asks first, then closes the period", () => {
  const pb = getPlaybook("month_end_close");
  assert.ok(pb.version >= 2);
  const types = pb.workflows(pb.defaults())[0].steps.map((s) => s.type);
  assert.deepEqual(types, ["month_end_checks", "request_approval", "close_period"]);
});
