import { test } from "node:test";
import assert from "node:assert/strict";

import { explainConditions, evaluateConditions, stepCategory, isSideEffectStep } from "@/lib/automations/catalog";
import { autonomyOf, decideAutonomy, decideMoneyGuardrails, resolveGuardrails, GUARDRAIL_DEFAULTS } from "./autonomy";
import { canContact, quietHoursEnd } from "@/lib/messaging/consent";
import { reasonFromError, describeReason, ReviewableError } from "./reasons";

const late = { status: "Late", balance: 412, priority: "Low", metadata: { source: "tenant" } };

test("conditions: AND groups explain each rule with expected and actual", () => {
  const ex = explainConditions([{ field: "balance", op: "gt", value: "100" }, { field: "status", op: "equals", value: "late" }], late, "tenant");
  assert.equal(ex.matched, true);
  assert.equal(ex.results.length, 2);
  assert.deepEqual(
    ex.results.map((r) => [r.label, r.opLabel, r.expected, r.actual, r.passed]),
    [
      ["Balance", "is greater than", "100", "412", true],
      ["Status", "is", "late", "Late", true],
    ],
  );
});

test("conditions: (status = late AND balance > 100) OR priority = Urgent", () => {
  const group = {
    op: "or",
    rules: [
      { op: "and", rules: [{ field: "status", op: "equals", value: "late" }, { field: "balance", op: "gt", value: "100" }] },
      { field: "priority", op: "equals", value: "Urgent" },
    ],
  };
  const cases = [
    [{ status: "Late", balance: 412, priority: "Low" }, true],
    [{ status: "Late", balance: 50, priority: "Low" }, false],
    [{ status: "Late", balance: 50, priority: "Urgent" }, true],
    [{ status: "Current", balance: 900, priority: "Low" }, false],
    [{ status: "Current", balance: 900, priority: "urgent" }, true],
    [{ status: "late", balance: "101", priority: "" }, true],
    [{ status: "Late", balance: 100, priority: "High" }, false],
    [{}, false],
    [{ priority: "Urgent" }, true],
    [{ status: "Late", balance: 101 }, true],
    [{ status: "Notice", balance: 5000, priority: "Medium" }, false],
    [{ status: "LATE", balance: 1000.5, priority: "Medium" }, true],
  ];
  for (const [row, want] of cases) assert.equal(evaluateConditions(group, row), want, JSON.stringify(row));
});

test("conditions: metadata fields and empty rules", () => {
  assert.equal(evaluateConditions([{ field: "source", op: "equals", value: "tenant" }], late), true);
  assert.equal(evaluateConditions([], late), true);
  assert.equal(explainConditions(undefined, late).matched, true);
});

test("step categories gate legal notices separately from messages", () => {
  assert.equal(stepCategory({ type: "send_email", config: { category: "legal" } }), "legal");
  assert.equal(stepCategory({ type: "send_email", config: {} }), "message");
  assert.equal(stepCategory({ type: "post_charge" }), "money");
  assert.equal(isSideEffectStep({ type: "notify" }), false);
  assert.equal(isSideEffectStep({ type: "wait" }), false);
  assert.equal(isSideEffectStep({ type: "assign" }), true);
});

test("autonomy modes", () => {
  const suggest = autonomyOf({ autonomy: "suggest" });
  assert.equal(decideAutonomy(suggest, { category: "message" })?.kind, "decision");
  assert.equal(decideAutonomy(suggest, { category: "internal" }), null);

  const askFirst = autonomyOf({ autonomy: "approve", autonomyConfig: { appliesTo: ["money", "legal"] } });
  assert.equal(decideAutonomy(askFirst, { category: "money", amount: 5 })?.kind, "approval");
  assert.equal(decideAutonomy(askFirst, { category: "message" }), null);

  const over50 = autonomyOf({ autonomy: "approve_over", autonomyConfig: { threshold: 50 } });
  assert.equal(decideAutonomy(over50, { category: "money", amount: 45 }), null);
  assert.equal(decideAutonomy(over50, { category: "money", amount: 75 })?.kind, "approval");
  assert.equal(decideAutonomy(over50, { category: "money", amount: 50 })?.kind, "approval");
  assert.equal(decideAutonomy(over50, { category: "message" }), null);

  assert.equal(decideAutonomy(autonomyOf({ autonomy: "auto" }), { category: "money", amount: 9999 }), null);
  assert.equal(autonomyOf({}).mode, "auto");
});

test("money guardrails: per-run and per-day caps", () => {
  const g = resolveGuardrails({ company: { maxChargePerRun: 100, maxChargesPerDay: 3 } });
  assert.equal(decideMoneyGuardrails(g, { amount: 60, chargedThisRun: 0, chargesToday: 0 }), null);
  assert.equal(decideMoneyGuardrails(g, { amount: 60, chargedThisRun: 50, chargesToday: 0 })?.reasonCode, "guardrail_money_cap");
  assert.equal(decideMoneyGuardrails(g, { amount: 10, chargedThisRun: 0, chargesToday: 3 })?.reasonCode, "guardrail_daily_charges");
});

test("guardrails cascade from company to property overrides", () => {
  const g = resolveGuardrails({
    company: { maxChargePerRun: 200, quietHours: { enabled: true, start: "22:00", end: "07:00" } },
    property: { metadata: { guardrailOverrides: { maxChargePerRun: 75, quietHours: { start: "20:00" } } } },
  });
  assert.equal(g.maxChargePerRun, 75);
  assert.deepEqual(g.quietHours, { enabled: true, start: "20:00", end: "07:00" });
  assert.equal(resolveGuardrails().maxMessagesPerRecordPerWeek, GUARDRAIL_DEFAULTS.maxMessagesPerRecordPerWeek);
});

test("quiet hours cross midnight and defer to the window end", () => {
  const window = { start: "21:00", end: "08:00", tz: "UTC" };
  const at2230 = new Date("2026-11-08T22:30:00Z");
  assert.equal(quietHoursEnd(at2230, window).toISOString(), "2026-11-09T08:00:00.000Z");
  const at0300 = new Date("2026-11-09T03:00:00Z");
  assert.equal(quietHoursEnd(at0300, window).toISOString(), "2026-11-09T08:00:00.000Z");
  assert.equal(quietHoursEnd(new Date("2026-11-09T12:00:00Z"), window), null);
  // 22:30 in New York (UTC-5 in November) is 03:30 UTC; the window ends at 08:00 local = 13:00 UTC.
  const ny = quietHoursEnd(new Date("2026-11-09T03:30:00Z"), { start: "21:00", end: "08:00", tz: "America/New_York" });
  assert.equal(ny.toISOString(), "2026-11-09T13:00:00.000Z");
});

test("consent: do-not-contact blocks all but legal and emergency; SMS needs opt-in", () => {
  const dnc = { email: "a@b.co", metadata: { doNotContact: true } };
  assert.deepEqual(canContact(dnc, { channel: "email", category: "message" }), { ok: false, reason: "dnc" });
  assert.equal(canContact(dnc, { channel: "email", category: "legal" }).ok, true);
  assert.equal(canContact({ phone: "+1555", metadata: {} }, { channel: "sms" }).reason, "no_consent");
  assert.equal(canContact({ email: "a@b.co", metadata: { emailOptIn: false } }, { channel: "email", category: "message" }).ok, true);
  assert.equal(canContact({ email: "a@b.co", metadata: { emailOptIn: false } }, { channel: "email", category: "announcement" }).reason, "opted_out");
});

test("reasons: errors classify into plain-language reasons", () => {
  assert.equal(reasonFromError(new Error("No email address on file")), "no_recipient_email");
  assert.equal(reasonFromError(new Error("HTTP 502")), "provider_error");
  assert.equal(reasonFromError(new Error("something odd")), "unexpected_error");
  const e = new ReviewableError("no_recipient_email", { recipient: "Maya Patel", workflow: "Rent reminder" });
  assert.equal(reasonFromError(e), "no_recipient_email");
  assert.equal(e.message, `Maya Patel has no email address, so "Rent reminder" couldn't send its message.`);
  assert.equal(describeReason("nope").code, "unexpected_error");
});
