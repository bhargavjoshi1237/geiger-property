import { test } from "node:test";
import assert from "node:assert/strict";
import { executeJob } from "./jobs/execute";
import { projectError } from "./jobs/contract";
import { actOnReview } from "./orchestration/review_actions";
import { loadMemberParty } from "./portal/session";
import { loadPaymentContext } from "./payments/context";
import { deliverAnnouncement } from "./messaging/announcements";
import { reviewScope } from "./supabase/review_items";
import { setActiveProjectId } from "./supabase/scope";

// PLAT-01b: nothing crosses projects — job failures, portal parties, payments, announcements, the review queue.

// A fake service-role client: `handler(q)` answers each query; every query is kept in `queries`.
function fakeDb(handler = () => ({ data: null, error: null })) {
  const queries = [];
  const from = (table) => {
    const q = { table, op: "select", payload: null, filters: [], single: false };
    queries.push(q);
    const builder = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") {
            const res = handler(q) || { data: null, error: null };
            return (ok, fail) => Promise.resolve(res).then(ok, fail);
          }
          return (...args) => {
            if (["insert", "update", "upsert", "delete"].includes(prop)) [q.op, q.payload] = [prop, args[0]];
            else if (prop === "single" || prop === "maybeSingle") q.single = true;
            else if (prop !== "select") q.filters.push([prop, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  };
  return { queries, from, schema: () => ({ from }), rpc: async () => ({ data: null, error: null }) };
}

const eqOf = (q, col) => q.filters.find((f) => f[0] === "eq" && f[1] === col)?.[2];

// Review items as the job sync sees them: no existing item, inserts echo back, `open` answers the clearing read.
function jobDb(open = []) {
  let n = 0;
  return fakeDb((q) => {
    if (q.table === "job_runs" && q.op === "insert") return { data: { id: "run1" }, error: null };
    if (q.table === "review_items" && q.op === "insert") return { data: { ...q.payload, id: `ri${(n += 1)}` }, error: null };
    if (q.table === "review_items" && q.op === "select") return { data: q.single ? null : open, error: null };
    return { data: q.single ? null : [], error: null };
  });
}
const inserted = (db) => db.queries.filter((q) => q.table === "review_items" && q.op === "insert").map((q) => q.payload);
const cleared = (db) => db.queries.filter((q) => q.table === "review_items" && q.op === "update").map((q) => eqOf(q, "id"));

test("a cron job failure lands in its project's queue; a project-less one is redacted", async () => {
  const job = { key: "t-job", label: "Test job", run: async () => ({ errors: [projectError("p1", "lease Maple 4B: boom"), "Stripe isn't configured"] }) };
  const db = jobDb();
  const res = await executeJob(job, { admin: db, trigger: "cron" });
  assert.deepEqual(res.errors, ["lease Maple 4B: boom (project p1)", "Stripe isn't configured"]);
  const [own, global] = inserted(db);
  assert.equal(own.project_id, "p1");
  assert.match(own.reason_text, /Maple 4B/);
  assert.equal(own.metadata.details, "lease Maple 4B: boom");
  assert.equal(global.project_id, null);
  assert.equal(global.source_type, "job_run");
  assert.doesNotMatch(JSON.stringify(global), /Stripe|Maple/);
  assert.equal(global.metadata.details, undefined);
});

test("a one-project run raises its unattributed errors in that project", async () => {
  const job = { key: "t-job", label: "Test job", run: async () => ({ errors: ["Stripe isn't configured"] }) };
  const db = jobDb();
  await executeJob(job, { admin: db, projectId: "p1", trigger: "manual" });
  assert.deepEqual(inserted(db).map((r) => r.project_id), ["p1"]);
});

test("a clean scope is cleared; a failing scope and a broken cron run are not", async () => {
  const open = [{ id: "a", project_id: "p1", history: [] }, { id: "b", project_id: "p2", history: [] }, { id: "c", project_id: null, history: [] }];
  const failsInP1 = { key: "t-job", run: async () => ({ processed: 1, errors: [projectError("p1", "x")] }) };
  const db = jobDb(open);
  await executeJob(failsInP1, { admin: db, trigger: "cron" });
  assert.deepEqual(cleared(db), ["b", "c"]);

  const broken = { key: "t-job", run: async () => ({ errors: ["database unreachable"] }) };
  const db2 = jobDb(open);
  await executeJob(broken, { admin: db2, trigger: "cron" });
  assert.deepEqual(cleared(db2), []);

  const clean = { key: "t-job", run: async () => ({ processed: 1 }) };
  const db3 = jobDb(open.filter((r) => r.project_id === "p1"));
  await executeJob(clean, { admin: db3, projectId: "p1", trigger: "manual" });
  assert.deepEqual(cleared(db3), ["a"]);
  const read = db3.queries.find((q) => q.table === "review_items" && q.op === "select" && !q.single);
  assert.equal(eqOf(read, "project_id"), "p1");
});

test("staff act only on their own project's review items, never a project-less one", async () => {
  for (const row of [{ id: "r1", project_id: null, source_type: "job_run" }, { id: "r1", project_id: "p2", source_type: "job_run" }]) {
    const db = fakeDb((q) => (q.table === "review_items" ? { data: { status: "open", history: [], ...row }, error: null } : null));
    await assert.rejects(actOnReview(db, { projectId: "p1", id: "r1", action: "dismiss", input: { note: "x" } }), /another project/);
    assert.ok(!db.queries.some((q) => q.op === "update"));
  }
});

test("the review queue reads only the active project's items", () => {
  const filters = [];
  const q = new Proxy({}, { get: (_, prop) => (...args) => (filters.push([prop, ...args]), q) });
  setActiveProjectId("p1");
  reviewScope(q);
  setActiveProjectId(null);
  assert.deepEqual(filters, [["eq", "project_id", "p1"]]);
});

test("a portal member never gets a party record from another project", async () => {
  const party = (projectId) => fakeDb((q) => (q.table === "tenants" ? { data: { id: "t1", project_id: projectId, name: "Pat" }, error: null } : null));
  const member = { id: "m1", role: "resident", project_id: "p1", tenant_id: "t1" };
  assert.equal(await loadMemberParty(party("p2"), member), null);
  assert.equal(await loadMemberParty(party(null), member), null);
  assert.equal(await loadMemberParty(party("p1"), { ...member, project_id: null }), null);
  assert.equal((await loadMemberParty(party("p1"), member))?.id, "t1");
});

test("a payment context refuses a lease from another project, or with none", async () => {
  for (const leaseProject of ["p2", null]) {
    const db = fakeDb((q) => (q.table === "leases" ? { data: { id: "l1", project_id: leaseProject, tenant_id: "t1" }, error: null } : null));
    const res = await loadPaymentContext(db, { projectId: "p1", leaseId: "l1" });
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
    assert.deepEqual(db.queries.map((q) => q.table), ["leases"]);
  }
});

test("an announcement without a project is refused before anything is read or sent", async () => {
  const db = fakeDb();
  const res = await deliverAnnouncement(db, { id: "a1", project_id: null, audience: "All tenants", body: "Hello", channel: "Email" });
  assert.equal(res.ok, false);
  assert.equal(db.queries.length, 0);
});
