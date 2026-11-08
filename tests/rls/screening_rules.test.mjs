// RISK-05 screening rules against the live database, inside one rolled-back transaction (see harness.mjs).
// Run: npm run test:rls   (RLS_APPLY_UP=screening_rules dry-runs that migration's @up first)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DEMO, OTHER, openHarness } from "./harness.mjs";

let h;
const SHARED = crypto.randomUUID();
const OWN = crypto.randomUUID();
const OTHERS = crypto.randomUUID();
const PROPERTY = crypto.randomUUID();
const refused = (r) => r.code === "42501";
const insertRule = (id, project, key, extra = "") =>
  `insert into property.screening_rules (id, project_id, jurisdiction_code, scope, rule_key, title, topic, effects, status, source_url, verified_on${extra ? ", notes" : ""})
   values ('${id}', ${project ? `'${project}'` : "null"}, 'US-ZZ', 'state', '${key}', 'RISK-05 test rule', 'criminal', '{"criminal":{"allowed":false}}', 'active', 'https://example.gov/rule', '2026-11-08'${extra ? `, '${extra}'` : ""})`;
const OVERRIDE = `update property.properties set metadata = metadata || '{"screeningJurisdictionOverride":"US-NY-NYC"}' where id = '${PROPERTY}'`;

before(async () => {
  h = await openHarness();
  await h.c.query(insertRule(SHARED, null, "risk05_shared"));
  await h.c.query(insertRule(OWN, DEMO, "risk05_own"));
  await h.c.query(insertRule(OTHERS, OTHER, "risk05_other_org"));
  await h.c.query("insert into property.properties (id, project_id, name, city, state, metadata) values ($1, $2, 'RISK-05 test property', 'Oakland', 'CA', '{}')", [PROPERTY, DEMO]);
});

after(async () => {
  await h?.close();
});

const visible = async (who) =>
  (await h.runAs(who, "select id from property.screening_rules where id = any($1::uuid[])", [[SHARED, OWN, OTHERS]])).rows?.map((r) => r.id).sort() ?? null;

test("reads: signed-in users see the shared catalog, members their project's own rules, anon nothing", async () => {
  const r = await h.runAs("anon", "select count(*) from property.screening_rules");
  assert.ok(refused(r), `anon: ${JSON.stringify(r)}`);
  assert.deepEqual(await visible("outsider"), [SHARED]);
  assert.deepEqual(await visible("leasing"), [SHARED, OWN].sort());
  assert.deepEqual(await visible("manager"), [SHARED, OWN].sort());
  assert.deepEqual(await visible("otherOrg"), [SHARED, OTHERS].sort());
});

test("writes: screening.criteria holders add their project's rules; nobody adds or edits a shared rule from a client", async () => {
  assert.ok(refused(await h.runAs("leasing", insertRule(crypto.randomUUID(), DEMO, "risk05_leasing"))), "leasing agent lacks screening.criteria");
  assert.equal((await h.runAs("manager", insertRule(crypto.randomUUID(), DEMO, "risk05_manager"))).count, 1);
  assert.ok(refused(await h.runAs("manager", insertRule(crypto.randomUUID(), null, "risk05_global"))), "shared rows come from the service role");
  assert.equal((await h.runAs("manager", "update property.screening_rules set title = 'changed' where id = $1", [SHARED])).count, 0, "shared row not updatable");
  assert.equal((await h.runAs("leasing", "update property.screening_rules set title = 'changed' where id = $1", [OWN])).count, 0);
  assert.equal((await h.runAs("manager", "update property.screening_rules set title = 'changed' where id = $1", [OWN])).count, 1);
  assert.ok(refused(await h.runAs("manager", "delete from property.screening_rules where id = $1", [OWN])), "no hard delete");
  assert.equal((await h.runAs("manager", "update property.screening_rules set deleted_at = now() where id = $1", [OWN])).count, 1, "soft delete");
  assert.equal((await h.runAs("service", insertRule(crypto.randomUUID(), null, "risk05_service"))).count, 1);
});

test("an active rule needs a source link and a verified date; codes and topics are checked", async () => {
  const missing = await h.runAs("manager", `insert into property.screening_rules (project_id, jurisdiction_code, scope, rule_key, title, topic, status) values ('${DEMO}', 'US-CA', 'state', 'risk05_unsourced', 'x', 'fees', 'active')`);
  assert.equal(missing.code, "23514", JSON.stringify(missing));
  const pending = await h.runAs("manager", `insert into property.screening_rules (project_id, jurisdiction_code, scope, rule_key, title, topic, status) values ('${DEMO}', 'US-CA', 'state', 'risk05_pending', 'x', 'fees', 'pending')`);
  assert.equal(pending.count, 1, "a pending draft may wait for its source");
  assert.equal((await h.run(`insert into property.screening_rules (jurisdiction_code, scope, rule_key, title, topic, status) values ('CA', 'state', 'k', 'x', 'fees', 'pending')`)).code, "23514");
  assert.equal((await h.run(`insert into property.screening_rules (jurisdiction_code, scope, rule_key, title, topic, status) values ('US-CA', 'state', 'k', 'x', 'housing', 'pending')`)).code, "23514");
  assert.equal((await h.run(insertRule(crypto.randomUUID(), null, "risk05_shared"))).code, "23505", "one shared rule per jurisdiction and key");
});

test("a property's screening jurisdiction override needs screening.criteria; other edits don't", async () => {
  const r = await h.runAs("leasing", OVERRIDE);
  assert.ok(refused(r), JSON.stringify(r));
  assert.match(r.message, /can't change the screening jurisdiction/);
  assert.equal((await h.runAs("leasing", `update property.properties set metadata = metadata || '{"county":"Alameda"}' where id = '${PROPERTY}'`)).count, 1);
  assert.equal((await h.runAs("manager", OVERRIDE)).count, 1);
  assert.equal((await h.runAs("service", OVERRIDE)).count, 1);
});
