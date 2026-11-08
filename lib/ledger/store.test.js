import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAccountIndex, postBuilt } from "./store";

// PLAT-01c: the ledger RPCs refuse a signed-in caller without the permission (42501); readers keep the chart they have.

// A fake client: `accounts` answers every gl_accounts read, `rpc(name)` answers each RPC.
function fakeDb(accounts, rpc) {
  const calls = [];
  const query = { select: () => query, is: () => query, eq: () => query, then: (ok, fail) => Promise.resolve({ data: accounts(), error: null }).then(ok, fail) };
  return { calls, from: () => query, rpc: async (name, args) => (calls.push(name), rpc(name, args)) };
}

const denied = () => ({ data: null, error: { code: "42501", message: "You don't have permission to set up the chart of accounts." } });
const row = (system_key) => ({ id: system_key, name: system_key, account_type: "Asset", system_key });

test("loadAccountIndex: a reader without accounting.post keeps the existing chart", async () => {
  const db = fakeDb(() => [row("operating_cash"), row("rent_income")], denied);
  const idx = await loadAccountIndex(db, "p1");
  assert.deepEqual(db.calls, ["ledger_ensure_default_chart"]);
  assert.ok(idx.byKey.has("rent_income"));
});

test("loadAccountIndex: an empty chart the caller may not seed is an error", async () => {
  const db = fakeDb(() => [], denied);
  await assert.rejects(loadAccountIndex(db, "p1"), (e) => e.code === "42501");
});

test("loadAccountIndex: other seeding failures still throw", async () => {
  const db = fakeDb(() => [row("operating_cash")], () => ({ data: null, error: { code: "57014", message: "timeout" } }));
  await assert.rejects(loadAccountIndex(db, "p1"), /timeout/);
});

test("postBuilt: a refused post throws with the Postgres code", async () => {
  const db = fakeDb(() => [], () => ({ data: null, error: { code: "42501", message: "You don't have permission to post to the ledger." } }));
  const built = { entry: { date: "2026-11-08" }, lines: [] };
  await assert.rejects(postBuilt(db, built, { projectId: "p1" }), (e) => e.code === "42501" && /permission/.test(e.message));
});
