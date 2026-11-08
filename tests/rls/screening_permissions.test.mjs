// RISK-03 screening permissions against the live database, inside one rolled-back transaction (see harness.mjs).
// Run: npm run test:rls   (RLS_APPLY_UP=screening_permission_gates dry-runs that migration's @up first)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DEMO, OTHER, USERS, openHarness } from "./harness.mjs";

let h;
const APP = crypto.randomUUID();
const KEYS = ["order", "view_reports", "decide", "adverse_action", "fraud_review", "criteria"].map((k) => `property.screening.${k}`);
const ok = (r) => !r.code && r.count === 1;
const refused = (r) => r.code === "42501";
const DECIDE = "update property.applications set status = 'Approved', decision = 'Approved' where id = $1";
const RECORD = `update property.applications set metadata = metadata || '{"screening":{"credit":{"status":"Complete","score":700}}}' where id = $1`;

before(async () => {
  h = await openHarness();
  await h.c.query(
    `insert into property.applications (id, project_id, name, status, decision, metadata)
     values ($1, $2, 'RISK-03 applicant', 'Screening', '', '{"screeningReference":"R3-1"}')`,
    [APP, DEMO],
  );
  await h.c.query("insert into property.settings (project_id, key, value) values ($1, 'screening_criteria', '{\"incomeMultiple\":3}')", [DEMO]);
});

after(async () => {
  await h?.close();
});

test("rbac_allows: who holds which screening key (owner * , view_reports for no one else by default)", async () => {
  const matrix = {};
  for (const who of ["owner", "manager", "leasing", "tech", "accountant", "otherOrg", "outsider"]) {
    const r = await h.runAs(who, `select k, property.rbac_allows(k, $1) as allowed from unnest($2::text[]) k`, [DEMO, KEYS]);
    matrix[who] = r.rows.filter((x) => x.allowed).map((x) => x.k.split(".")[2]);
  }
  assert.deepEqual(matrix, {
    owner: ["order", "view_reports", "decide", "adverse_action", "fraud_review", "criteria"],
    manager: ["order", "decide", "adverse_action", "fraud_review", "criteria"],
    leasing: ["order", "decide", "adverse_action"],
    tech: [],
    accountant: [],
    otherOrg: [],
    outsider: [],
  });
  assert.equal(refused(await h.runAs("anon", "select property.rbac_allows($1, $2)", [KEYS[1], DEMO])), true, "anon can't ask");
  assert.deepEqual((await h.runAs("owner", "select property.rbac_allows($1, $2) as a", [KEYS[1], OTHER])).rows[0].a, false, "not across orgs");
});

test("decisions: screening.decide holders record them; the tech and accountant are refused", async () => {
  assert.ok(ok(await h.runAs("manager", DECIDE, [APP])));
  assert.ok(ok(await h.runAs("leasing", DECIDE, [APP])));
  for (const who of ["tech", "accountant"]) {
    const r = await h.runAs(who, DECIDE, [APP]);
    assert.ok(refused(r), `${who}: ${JSON.stringify(r)}`);
    assert.match(r.message, /can't record or change application decisions/);
  }
  // The decision record in metadata (merge_meta, as the app writes it) is gated the same way.
  const meta = `select property.merge_meta('applications', $1, '{"adverseAction":{"reasons":["Credit history"]}}')`;
  assert.ok(refused(await h.runAs("tech", meta, [APP])));
  assert.ok(!(await h.runAs("leasing", meta, [APP])).code);
  // Inserting an already-decided application counts as deciding; a plain submission doesn't.
  const insert = (status) => `insert into property.applications (id, project_id, name, status) values (gen_random_uuid(), '${DEMO}', 'RISK-03 insert', '${status}')`;
  assert.ok(refused(await h.runAs("tech", insert("Denied"))));
  assert.equal((await h.runAs("tech", insert("Submitted"))).count, 1);
  assert.equal((await h.runAs("leasing", insert("Approved"))).count, 1);
});

test("screening records: screening.order holders record them; others can still edit the rest of the application", async () => {
  assert.ok(ok(await h.runAs("leasing", RECORD, [APP])));
  assert.ok(refused(await h.runAs("tech", RECORD, [APP])));
  assert.ok(refused(await h.runAs("accountant", "update property.applications set score = 640 where id = $1", [APP])));
  assert.ok(refused(await h.runAs("tech", `select property.merge_meta('applications', $1, '{"screeningReference":"R3-2"}')`, [APP])));
  // Fields outside screening and decisions stay open to members (01d), and withdrawing isn't a decision.
  assert.ok(ok(await h.runAs("tech", "update property.applications set phone = '555-0303' where id = $1", [APP])));
  assert.ok(ok(await h.runAs("tech", "update property.applications set status = 'Withdrawn' where id = $1", [APP])));
});

test("a custom role with order but not decide records results but can't decide", async () => {
  await h.c.query("savepoint custom");
  try {
    const role = (
      await h.c.query(
        `insert into public.roles (project_id, key, name, permissions, metadata)
         values ($1, 'risk03_screener', 'RISK-03 screener', array['property.applications.view', 'property.screening.order'], '{}') returning id`,
        [DEMO],
      )
    ).rows[0].id;
    await h.c.query("update property.role_grants set role_id = $1 where user_id = $2 and project_id = $3 and deleted_at is null", [role, USERS.accountant, DEMO]);
    assert.ok(ok(await h.runAs("accountant", RECORD, [APP])));
    assert.ok(refused(await h.runAs("accountant", DECIDE, [APP])));
    assert.equal((await h.runAs("accountant", "select property.rbac_allows('property.screening.view_reports', $1) as a", [DEMO])).rows[0].a, false);
  } finally {
    await h.c.query("rollback to savepoint custom");
  }
});

test("the service role and outsiders: the server writes freely; outsiders and anon reach nothing", async () => {
  assert.ok(ok(await h.runAs("service", DECIDE, [APP])));
  assert.equal((await h.runAs("outsider", DECIDE, [APP])).count, 0);
  assert.equal((await h.runAs("otherOrg", DECIDE, [APP])).count, 0);
  assert.ok(refused(await h.runAs("anon", DECIDE, [APP])));
});

test("criteria: the screening_criteria setting needs screening.criteria", async () => {
  const save = `update property.settings set value = '{"incomeMultiple":2.5}' where project_id = $1 and key = 'screening_criteria'`;
  assert.equal((await h.runAs("leasing", save, [DEMO])).count, 0, "the leasing agent's update matches no row");
  assert.ok(refused(await h.runAs("leasing", "insert into property.settings (project_id, key, value) values ($1, 'screening_criteria', '{}')", [DEMO])));
  assert.equal((await h.runAs("manager", save, [DEMO])).count, 1);
  assert.equal((await h.runAs("owner", save, [DEMO])).count, 1);
});
