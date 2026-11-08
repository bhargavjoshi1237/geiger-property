import { test } from "node:test";
import assert from "node:assert/strict";

import { scopedTo } from "@/lib/supabase/scope";
import { actOnReview } from "@/lib/orchestration/review_actions";
import { proposedActionHandler } from "@/lib/orchestration/proposed_actions";
import { sendStaffMessage } from "@/lib/messaging/send";
import { loadMergeRecords } from "@/lib/messaging/context";

// PLAT-01f: service-role code behind staff routes never reads or writes another project's rows.

// A fake service-role client that records each query (table, op, payload, filters); `handler(q)` answers it.
function fakeDb(handler = () => null) {
  const queries = [];
  const from = (table) => {
    const q = { table, op: "select", payload: null, filters: [] };
    queries.push(q);
    const builder = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") return (ok, fail) => Promise.resolve(handler(q) || { data: null, error: null }).then(ok, fail);
          return (...args) => {
            if (["insert", "update", "upsert", "delete"].includes(prop)) [q.op, q.payload] = [prop, args[0]];
            else if (!["select", "single", "maybeSingle", "order", "limit"].includes(prop)) q.filters.push([prop, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };
  return { queries, from, schema: () => ({ from }) };
}

const projectOf = (q) => q.filters.find((f) => f[0] === "eq" && f[1] === "project_id")?.[2];

test("scopedTo: reads and updates are narrowed, inserts stamped, another project's row refused", async () => {
  const db = fakeDb();
  const scoped = scopedTo(db, "p1");
  await scoped("tenants").select("*").eq("id", "t1");
  await scoped("tenants").update({ name: "Pat" }).eq("id", "t1");
  await scoped("activity").insert([{ summary: "x" }]);
  await scoped("activity").insert({ summary: "y", project_id: "p1" });
  assert.deepEqual(db.queries.map(projectOf), ["p1", "p1", undefined, undefined]);
  assert.deepEqual(db.queries[2].payload, [{ summary: "x", project_id: "p1" }]);
  assert.deepEqual(db.queries[3].payload, { summary: "y", project_id: "p1" });
  assert.throws(() => scoped("activity").insert({ project_id: "p2" }), /another project/);
  assert.throws(() => scoped("tenants").update({ project_id: "p2" }), /another project/);
  assert.equal(typeof scoped("tenants").delete, "undefined");
  assert.throws(() => scopedTo(db, null), /project is required/);
});

test("review queue: re-running a scheduled job needs settings.manage", async () => {
  const row = { id: "r1", project_id: "p1", source_type: "job_run", status: "open", history: [], metadata: { jobKey: "signals" } };
  const db = fakeDb((q) => (q.table === "review_items" ? { data: row, error: null } : null));
  await assert.rejects(actOnReview(db, { projectId: "p1", id: "r1", action: "retry" }), /Manage settings/);
  assert.ok(!db.queries.some((q) => q.table === "job_runs"));
  assert.equal(projectOf(db.queries[0]), "p1");
});

test("review queue: a run named by a review item is read inside the item's project", async () => {
  const row = { id: "r1", project_id: "p1", source_type: "automation_run", source_id: "run9", status: "open", history: [] };
  const db = fakeDb((q) => (q.table === "review_items" ? { data: row, error: null } : null));
  await assert.rejects(actOnReview(db, { projectId: "p1", id: "r1", action: "retry" }), /no longer exists/);
  const run = db.queries.find((q) => q.table === "automation_runs");
  assert.equal(projectOf(run), "p1");
});

test("intake suggestions: a bill confirm needs accounting.post, and records load inside the item's project", async () => {
  const item = { projectId: "p1", proposedAction: { type: "intake_confirm_bill", recordId: "b1" } };
  const db = fakeDb();
  const res = await proposedActionHandler("intake_confirm_bill")(db, item, { actor: { name: "Sam" } });
  assert.equal(res.ok, false);
  assert.equal(db.queries.length, 0);

  const db2 = fakeDb();
  const req = await proposedActionHandler("intake_confirm_request")(db2, { projectId: "p1", proposedAction: { recordId: "w1" } }, {});
  assert.equal(req.ok, false);
  assert.equal(projectOf(db2.queries[0]), "p1");
});

test("staff messages: the thread, recipient and merge records come from the route's project only", async () => {
  const db = fakeDb();
  const res = await sendStaffMessage({ db, projectId: "p1", actor: { id: "u1" }, input: { threadId: "th-from-p2", body: "Hi" } });
  assert.equal(res.ok, false);
  assert.equal(projectOf(db.queries[0]), "p1");

  const db2 = fakeDb();
  await sendStaffMessage({ db: db2, projectId: "p1", actor: { id: "u1" }, input: { recipient: { type: "tenant", id: "t-from-p2" }, body: "Hi" } });
  assert.equal(projectOf(db2.queries[0]), "p1");

  const db3 = fakeDb();
  await loadMergeRecords(db3, { projectId: "p1", leaseId: "l1", tenantId: "t1", propertyId: "pr1", ownerId: "o1", vendorId: "v1" });
  assert.ok(db3.queries.length >= 5);
  for (const q of db3.queries) assert.equal(projectOf(q), "p1", q.table);
});
