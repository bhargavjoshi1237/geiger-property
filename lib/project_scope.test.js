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

// Review items as the job sync sees them: no existing item, inserts echo back, `open` (narrowed by its project filter) answers the clearing read.
// A cron run fans out to `projects` (property.job_projects); `rpcError` breaks that read.
function jobDb(open = [], { projects = ["p1"], rpcError = null } = {}) {
  let n = 0;
  const inScope = (q, r) => q.filters.every(([op, col, v]) => col !== "project_id" || !["eq", "is"].includes(op) || r.project_id === v);
  const db = fakeDb((q) => {
    if (q.table === "job_runs" && q.op === "insert") return { data: { id: "run1" }, error: null };
    if (q.table === "review_items" && q.op === "insert") return { data: { ...q.payload, id: `ri${(n += 1)}` }, error: null };
    if (q.table === "review_items" && q.op === "select") return { data: q.single ? null : open.filter((r) => inScope(q, r)), error: null };
    return { data: q.single ? null : [], error: null };
  });
  db.rpc = async () => (rpcError ? { data: null, error: { message: rpcError } } : { data: projects, error: null });
  return db;
}
const inserted = (db) => db.queries.filter((q) => q.table === "review_items" && q.op === "insert").map((q) => q.payload);
const cleared = (db) => db.queries.filter((q) => q.table === "review_items" && q.op === "update").map((q) => eqOf(q, "id"));

test("a cron run's failures land in each project's own run and queue; a broken fan-out goes to the operator store only", async () => {
  const job = { key: "t-job", label: "Test job", run: async () => ({ errors: [projectError("p1", "lease Maple 4B: boom"), "Stripe isn't configured"] }) };
  const db = jobDb();
  const res = await executeJob(job, { admin: db, trigger: "cron" });
  assert.deepEqual(res.projects.map((p) => [p.projectId, p.errors]), [["p1", ["lease Maple 4B: boom", "Stripe isn't configured"]]]);
  const [own, unattributed] = inserted(db);
  assert.equal(own.project_id, "p1");
  assert.match(own.reason_text, /Maple 4B/);
  assert.equal(own.metadata.details, "lease Maple 4B: boom");
  assert.equal(unattributed.project_id, "p1");
  const child = db.queries.find((q) => q.table === "job_runs" && q.op === "insert" && q.payload.project_id === "p1");
  assert.equal(child.payload.trigger_source, "cron");
  assert.equal(child.payload.metadata.parentRunId, "run1");

  const broken = jobDb([], { rpcError: "database unreachable" });
  const out = await executeJob(job, { admin: broken, trigger: "cron" });
  assert.equal(out.status, "failed");
  assert.deepEqual(inserted(broken), [], "no member's review queue gets a project-less item");
  const [event] = broken.queries.filter((q) => q.table === "operator_events" && q.op === "insert").map((q) => q.payload);
  assert.equal(event.kind, "job_failure");
  assert.equal(event.source, "t-job");
  assert.match(event.detail.message, /unreachable/, "operators see the full message");
  assert.match(event.dedupe_key, /^job:t-job:/);
});

test("a clean cron run resolves the job's open operator events; a one-project run never touches them", async () => {
  const clean = { key: "t-job", run: async () => ({ processed: 1 }) };
  const db = jobDb([], { projects: ["p1"] });
  await executeJob(clean, { admin: db, trigger: "cron" });
  const resolve = db.queries.find((q) => q.table === "operator_events" && q.op === "update");
  assert.ok(resolve?.payload.resolved_at);
  assert.deepEqual([eqOf(resolve, "kind"), eqOf(resolve, "source")], ["job_failure", "t-job"]);
  const one = jobDb();
  await executeJob(clean, { admin: one, projectId: "p1", trigger: "manual" });
  assert.equal(one.queries.some((q) => q.table === "operator_events"), false);
});

test("every job run is one project's: cron calls run() once per project and never without one (PLAT-01h)", async () => {
  const seen = [];
  const job = { key: "t-job", run: async ({ projectId }) => (seen.push(projectId), { errors: ["plain string error"] }) };
  const db = jobDb([], { projects: ["p1", "p2"] });
  await executeJob(job, { admin: db, trigger: "cron" });
  assert.deepEqual(seen, ["p1", "p2"]);
  assert.deepEqual(inserted(db).map((r) => r.project_id), ["p1", "p2"], "an unattributed errors.push belongs to the run's project");
  const execute = (await import("node:fs")).readFileSync("lib/jobs/execute.js", "utf8");
  assert.equal((execute.match(/\bjob\.run\(/g) || []).length, 1, "job.run is called only from runProject");
  assert.match(execute.slice(execute.indexOf("async function runProject"), execute.indexOf("export async function listJobProjects")), /\bjob\.run\(\{ admin, now, projectId,/);
});

test("a one-project run raises its unattributed errors in that project", async () => {
  const job = { key: "t-job", label: "Test job", run: async () => ({ errors: ["Stripe isn't configured"] }) };
  const db = jobDb();
  await executeJob(job, { admin: db, projectId: "p1", trigger: "manual" });
  assert.deepEqual(inserted(db).map((r) => r.project_id), ["p1"]);
});

test("a clean scope is cleared; a failing scope and a broken cron run are not", async () => {
  const open = [{ id: "a", project_id: "p1", history: [] }, { id: "b", project_id: "p2", history: [] }, { id: "c", project_id: null, history: [] }];
  const failsInP1 = { key: "t-job", run: async ({ projectId }) => ({ processed: 1, errors: projectId === "p1" ? [projectError("p1", "x")] : [] }) };
  const db = jobDb(open, { projects: ["p1", "p2"] });
  await executeJob(failsInP1, { admin: db, trigger: "cron" });
  assert.deepEqual(cleared(db), ["b", "c"]);

  const db2 = jobDb(open, { rpcError: "database unreachable" });
  await executeJob(failsInP1, { admin: db2, trigger: "cron" });
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
