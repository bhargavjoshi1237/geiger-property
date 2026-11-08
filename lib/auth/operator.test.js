import { test } from "node:test";
import assert from "node:assert/strict";

import { isOperator, operatorEmails } from "./operator";
import { OPERATOR_KINDS, recordOperatorEvent } from "@/lib/operator/events";

// PLAT-01h: /operator is for confirmed emails on PROPERTY_OPERATOR_EMAILS; the store files project-less events and bumps repeats.

const env = { PROPERTY_OPERATOR_EMAILS: " Ops@Example.com, second@example.com;third@example.com" };

test("operator: a confirmed, listed email only", () => {
  assert.deepEqual(operatorEmails(env), ["ops@example.com", "second@example.com", "third@example.com"]);
  assert.equal(isOperator({ email: "OPS@example.com", email_confirmed_at: "2026-01-01" }, env), true);
  assert.equal(isOperator({ email: "ops@example.com" }, env), false, "unconfirmed");
  assert.equal(isOperator({ email: "someone@example.com", email_confirmed_at: "2026-01-01" }, env), false);
  assert.equal(isOperator({ email: "ops@example.com", email_confirmed_at: "2026-01-01" }, {}), false, "nobody without the variable");
  assert.equal(isOperator(null, env), false);
});

// A fake service-role client over operator_events: `open` answers the dedupe read.
function fakeAdmin(open = []) {
  const calls = [];
  const from = (table) => {
    const call = { table, op: "select", payload: null, filters: [] };
    calls.push(call);
    const b = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") return (resolve) => resolve(call.op === "select" ? { data: open, error: null } : { data: { id: "new" }, error: null });
          return (...args) => {
            if (["insert", "update"].includes(prop)) [call.op, call.payload] = [prop, args[0]];
            else if (prop !== "select") call.filters.push([prop, ...args]);
            return b;
          };
        },
      },
    );
    return b;
  };
  return { calls, from };
}

test("operator events: new events insert; an open repeat is bumped; unknown kinds are ignored", async () => {
  const fresh = fakeAdmin([]);
  assert.equal(await recordOperatorEvent(fresh, { kind: "job_failure", source: "billing", summary: "Billing failed", detail: { message: "x" }, dedupeKey: "job:billing:1" }), "new");
  const insert = fresh.calls.find((c) => c.op === "insert");
  assert.equal(insert.payload.kind, "job_failure");
  assert.equal(insert.payload.dedupe_key, "job:billing:1");

  const repeat = fakeAdmin([{ id: "e1", occurrences: 2 }]);
  assert.equal(await recordOperatorEvent(repeat, { kind: "job_failure", source: "billing", summary: "Billing failed", dedupeKey: "job:billing:1" }), "e1");
  assert.equal(repeat.calls.find((c) => c.op === "update").payload.occurrences, 3);
  assert.equal(repeat.calls.some((c) => c.op === "insert"), false);

  assert.equal(await recordOperatorEvent(fakeAdmin(), { kind: "nope", summary: "x" }), null);
  assert.deepEqual(Object.keys(OPERATOR_KINDS), ["inbound_unattributed", "job_failure"]);
});
