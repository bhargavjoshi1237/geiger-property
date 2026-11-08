import { test } from "node:test";
import assert from "node:assert/strict";
import { PAUSED_REASON, executeJob, runScheduledJob } from "./execute";

// CORE-10 executor: the running-row lock, the pause switch, as-of runs and once-a-day alerts (fake PostgREST client).

// Every query is kept in `queries`; `handler(q)` answers it ({ data, error }).
function fakeDb(handler) {
  const queries = [];
  const from = (table) => {
    const q = { table, op: "select", payload: null, filters: [], single: false };
    queries.push(q);
    const builder = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") {
            const res = handler(q) || { data: q.single ? null : [], error: null };
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
  return { queries, from, schema: () => ({ from }), rpc: async () => ({ data: [], error: null }) };
}

const eqOf = (q, col) => q.filters.find((f) => f[0] === "eq" && f[1] === col)?.[2];
const setting = (q, key, value) => q.table === "settings" && eqOf(q, "key") === key && { data: [{ value, project_id: eqOf(q, "project_id") }], error: null };
const runInserts = (db) => db.queries.filter((q) => q.table === "job_runs" && q.op === "insert").map((q) => q.payload);

// Senders captured instead of sent.
function capture() {
  const sent = { notify: [], email: [] };
  return {
    sent,
    deps: {
      notify: async (_admin, input) => (sent.notify.push(input), { id: "n1" }),
      sendEmail: async (input) => (sent.email.push(input), { ok: true }),
    },
  };
}

test("a second start while a run holds the lock is logged as skipped_locked and never runs the job", async () => {
  let ran = 0;
  const job = { key: "t-lock", label: "Lock test", run: async () => ((ran += 1), { processed: 1 }) };
  const db = fakeDb((q) => {
    if (q.table === "job_runs" && q.op === "insert" && q.payload.status === "running") return { data: null, error: { code: "23505", message: "duplicate key" } };
    if (q.table === "job_runs" && q.op === "insert") return { data: { id: "locked-1" }, error: null };
    if (q.table === "job_runs" && q.op === "select") return { data: [{ status: "succeeded" }], error: null };
    return null;
  });
  const res = await executeJob(job, { admin: db, projectId: "p-lock", trigger: "manual" });
  assert.equal(ran, 0);
  assert.equal(res.status, "skipped_locked");
  assert.equal(res.runId, "locked-1");
  assert.deepEqual(runInserts(db).map((r) => r.status), ["running", "skipped_locked"]);
  // Running rows older than the lock window were abandoned first, in the same scope.
  const abandon = db.queries.find((q) => q.table === "job_runs" && q.op === "update");
  assert.equal(abandon.payload.status, "abandoned");
  assert.equal(eqOf(abandon, "status"), "running");
  assert.equal(eqOf(abandon, "project_id"), "p-lock");
  assert.ok(abandon.filters.some((f) => f[0] === "lt" && f[1] === "started_at"));
});

test("a scheduled run that finds the lock held twice in a row alerts the project once", async () => {
  const job = { key: "t-lock2", label: "Lock test", run: async () => ({}) };
  const { sent, deps } = capture();
  const db = fakeDb((q) => {
    if (q.table === "job_runs" && q.op === "insert" && q.payload.status === "running") return { data: null, error: { code: "23505", message: "duplicate key" } };
    if (q.table === "job_runs" && q.op === "insert") return { data: { id: "locked-2" }, error: null };
    if (q.table === "job_runs" && q.op === "select") return { data: [{ status: "skipped_locked" }], error: null };
    return setting(q, "notifications", { alertEmails: ["alerts@example.invalid"] }) || null;
  });
  const res = await executeJob(job, { admin: db, projectId: "p-lock2", trigger: "cron", deps });
  assert.equal(res.status, "skipped_locked");
  assert.equal(sent.notify.length, 1);
  assert.match(sent.notify[0].title, /stuck/);
  assert.equal(sent.notify[0].url, "/project/p-lock2/automations?jobs=open");
  assert.deepEqual(sent.email.map((e) => [e.to, e.notification]), [["alerts@example.invalid", "staff_alerts"]]);
});

test("a paused project is skipped on schedule (logged once a day) and by hand, except for jobs that only derive data", async () => {
  let ran = 0;
  const job = { key: "t-pause", label: "Pause test", run: async () => ((ran += 1), { processed: 1 }) };
  const db = fakeDb((q) => setting(q, "billing_settings", { jobsPaused: true }) || (q.table === "job_runs" && q.op === "insert" ? { data: { id: "skip-1" }, error: null } : null));
  const res = await executeJob(job, { admin: db, projectId: "p-pause", trigger: "cron" });
  assert.equal(res.status, "skipped");
  assert.equal(res.reason, PAUSED_REASON);
  assert.deepEqual(runInserts(db).map((r) => [r.status, r.trigger_source, r.metadata.reason]), [["skipped", "cron", PAUSED_REASON]]);
  assert.equal((await executeJob(job, { admin: db, projectId: "p-pause", trigger: "manual" })).status, "skipped");
  assert.equal(ran, 0);

  // Logged once a day: a skip already logged today isn't logged again.
  const again = fakeDb((q) => setting(q, "billing_settings", { jobsPaused: true }) || (q.table === "job_runs" && q.op === "select" ? { data: [{ id: "earlier" }], error: null } : null));
  assert.equal((await executeJob(job, { admin: again, projectId: "p-pause", trigger: "cron" })).runId, "earlier");
  assert.equal(runInserts(again).length, 0);

  const derive = { ...job, manualWhilePaused: true };
  const db2 = fakeDb((q) => setting(q, "billing_settings", { jobsPaused: true }) || (q.table === "job_runs" && q.op === "insert" ? { data: { id: "r1" }, error: null } : null));
  assert.equal((await executeJob(derive, { admin: db2, projectId: "p-pause", trigger: "manual" })).status, "succeeded");
  assert.equal((await executeJob(derive, { admin: db2, projectId: "p-pause", trigger: "cron" })).status, "skipped");
  assert.equal(ran, 1);
  // A test may stand in for the switch without touching it.
  assert.equal((await executeJob(job, { admin: db2, projectId: "p-pause", trigger: "cron", overrides: { jobsPaused: false } })).status, "succeeded");
});

test("as-of runs: only jobs that allow it, never in the future, at noon in the company time zone", async () => {
  let seen = null;
  const ledgerJob = { key: "t-asof", label: "Ledger test", asOf: true, run: async ({ now }) => ((seen = now.toISOString()), { processed: 1 }) };
  const db = fakeDb((q) => setting(q, "company_profile", { timezone: "America/Los_Angeles" }) || (q.table === "job_runs" && q.op === "insert" ? { data: { id: "r-asof" }, error: null } : null));
  const res = await executeJob(ledgerJob, { admin: db, projectId: "p-asof", trigger: "manual", asOf: "2026-10-15" });
  assert.equal(res.status, "succeeded");
  assert.equal(seen, "2026-10-15T19:00:00.000Z");
  assert.equal(runInserts(db)[0].metadata.asOf, "2026-10-15");

  const future = await executeJob(ledgerJob, { admin: db, projectId: "p-asof", trigger: "manual", asOf: "2099-01-01" });
  assert.equal(future.ok, false);
  assert.match(future.error, /future/);
  const reminders = await executeJob({ key: "t-mail", label: "Reminders", run: async () => ({}) }, { admin: db, projectId: "p-asof", trigger: "manual", asOf: "2026-10-15" });
  assert.match(reminders.error, /can't run as of a past date/);
});

test("a failed scheduled run alerts once a day: a claimed dedupe key sends nothing", async () => {
  const job = { key: "t-fail", label: "Fail test", run: async () => ({ errors: ["GEIGER_EMAIL_API_KEY rejected"] }) };
  const first = capture();
  const db = fakeDb((q) => (q.table === "job_runs" && q.op === "insert" ? { data: { id: "r-fail" }, error: null } : setting(q, "notifications", { alertEmails: ["a@example.invalid", "A@example.invalid", "b@example.invalid"] }) || null));
  const res = await executeJob(job, { admin: db, projectId: "p-fail", trigger: "cron", deps: first.deps });
  assert.equal(res.status, "failed");
  assert.equal(first.sent.notify.length, 1);
  assert.equal(first.sent.notify[0].category, "jobs");
  assert.deepEqual(first.sent.email.map((e) => e.to), ["A@example.invalid", "b@example.invalid"], "one email per recipient, case-insensitive");
  const claim = db.queries.find((q) => q.table === "notification_sends" && q.op === "insert");
  assert.match(claim.payload.dedupe_key, /^job-alert:t-fail:p-fail:\d{4}-\d{2}-\d{2}$/);

  const second = capture();
  const claimed = fakeDb((q) => (q.table === "notification_sends" && q.op === "insert" ? { data: null, error: { code: "23505" } } : q.table === "job_runs" && q.op === "insert" ? { data: { id: "r2" }, error: null } : null));
  await executeJob(job, { admin: claimed, projectId: "p-fail", trigger: "cron", deps: second.deps });
  assert.equal(second.sent.notify.length + second.sent.email.length, 0);

  // A manual run reports to the person who ran it; no alert.
  const manual = capture();
  await executeJob(job, { admin: db, projectId: "p-fail", trigger: "manual", deps: manual.deps });
  assert.equal(manual.sent.notify.length, 0);
});

test("a cron fan-out writes one parent row and one child row per project, and stops starting projects past its deadline", async () => {
  let n = 0;
  const job = { key: "t-fan", label: "Fan test", run: async ({ projectId }) => ({ processed: projectId === "p1" ? 2 : 1 }) };
  const db = fakeDb((q) => (q.table === "job_runs" && q.op === "insert" ? { data: { id: `run-${(n += 1)}` }, error: null } : null));
  const res = await runScheduledJob(job, { admin: db, projects: ["p1", "p2"] });
  assert.equal(res.status, "succeeded");
  assert.equal(res.processed, 3);
  const rows = runInserts(db);
  assert.deepEqual(rows.map((r) => [r.project_id, r.trigger_source, r.metadata.parentRunId || null]), [[null, "cron", null], ["p1", "cron", "run-1"], ["p2", "cron", "run-1"]]);

  const late = await runScheduledJob(job, { admin: fakeDb((q) => (q.table === "job_runs" && q.op === "insert" ? { data: { id: "p" }, error: null } : null)), projects: ["p1", "p2"], deadline: Date.now() - 1 });
  assert.equal(late.status, "failed");
  assert.match(late.errors[0], /Out of time before 2 projects/);
});
