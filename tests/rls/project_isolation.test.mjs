// PLAT-01d RLS matrix against the live database, all inside one rolled-back transaction (see harness.mjs).
// Run: npm run test:rls   (RLS_APPLY_UP=1 dry-runs the migration's @up first)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DEMO, OTHER, USERS, openHarness, relations } from "./harness.mjs";

let h;
let rels;
const F = {};
const uuid = () => crypto.randomUUID();
const PORTAL = ["resident", "portalOwner", "vendor"];
const LOCKED = ["ad_channels", "roles", "geiger_migrations", "ledger_owner_backfill_backup"];

// The row count a persona sees, null on a permission error.
const seen = (who, sql, params) => h.seen(who, sql, params);
const denied = (r) => Boolean(r.code === "42501" || (r.count === 0 && !r.code));

before(async () => {
  h = await openHarness();
  rels = await relations(h);
  const q = (sql, params) => h.c.query(sql, params);
  // Another org's project data, a project-less review item and chat fixtures, all rolled back.
  F.otherTenant = uuid();
  await q("insert into property.tenants (id, project_id, name) values ($1, $2, 'RLS other-org tenant')", [F.otherTenant, OTHER]);
  F.otherProperty = uuid();
  await q("insert into property.properties (id, project_id, name) values ($1, $2, 'RLS other-org property')", [F.otherProperty, OTHER]);
  F.otherAmenity = uuid();
  await q("insert into property.amenities (id, project_id, name) values ($1, $2, 'RLS other-org amenity')", [F.otherAmenity, OTHER]);
  await q("insert into property.review_items (project_id, dedupe_key, source_type, title) values (null, $1, 'job_run', 'RLS cron failure')", [`rls:${uuid()}`]);
  F.demoTenant = (await q("select id from property.tenants where project_id = $1 and deleted_at is null order by created_at limit 1", [DEMO])).rows[0].id;
  F.demoProperty = (await q("select id from property.properties where project_id = $1 and deleted_at is null order by created_at limit 1", [DEMO])).rows[0].id;
  F.demoAmenity = uuid();
  await q("insert into property.amenities (id, project_id, name) values ($1, $2, 'RLS demo amenity')", [F.demoAmenity, DEMO]);
  F.workOrder = (await q("select id from property.work_orders where project_id = $1 and deleted_at is null order by created_at limit 1", [DEMO])).rows[0].id;
  F.line = (await q("select id from property.ledger_lines where project_id = $1 and deleted_at is null order by created_at limit 1", [DEMO])).rows[0].id;
  F.entry = (await q("select id from property.ledger_entries where project_id = $1 and deleted_at is null and status = 'posted' and reversal_of is null order by created_at desc limit 1", [DEMO])).rows[0].id;
  const gl = async (key) => (await q("select id from property.gl_accounts where project_id = $1 and system_key = $2 and deleted_at is null limit 1", [DEMO, key])).rows[0].id;
  F.cash = await gl("operating_cash");
  F.ar = await gl("accounts_receivable");
  F.run = (await q("select id from property.automation_runs where project_id = $1 order by created_at desc limit 1", [DEMO])).rows[0]?.id;
  for (const who of ["owner", "manager", "tech", "otherOrg"]) {
    await q("insert into property.chat_profiles (id, display_name, project_ids) values ($1, $2, $3) on conflict (id) do update set project_ids = excluded.project_ids", [USERS[who], `RLS ${who}`, who === "otherOrg" ? [OTHER] : [DEMO]]);
  }
  F.privateChannel = uuid();
  await q("insert into property.chat_conversations (id, project_id, kind, name, visibility, created_by) values ($1, $2, 'channel', $3, 'private', $4)", [F.privateChannel, DEMO, `rls-private-${F.privateChannel.slice(0, 6)}`, USERS.owner]);
  await q("insert into property.chat_members (conversation_id, profile_id) values ($1, $2)", [F.privateChannel, USERS.owner]);
  F.dm = uuid();
  await q("insert into property.chat_conversations (id, project_id, kind, dm_key, created_by) values ($1, $2, 'dm', $3, $4)", [F.dm, DEMO, [USERS.owner, USERS.manager].sort().join(":"), USERS.owner]);
  F.publicChannel = uuid();
  await q("insert into property.chat_conversations (id, project_id, kind, name, visibility, created_by) values ($1, $2, 'channel', $3, 'public', $4)", [F.publicChannel, DEMO, `rls-public-${F.publicChannel.slice(0, 6)}`, USERS.owner]);
  for (const conv of [F.privateChannel, F.dm, F.publicChannel]) {
    await q("insert into property.chat_messages (conversation_id, author_id, text) values ($1, $2, 'rls secret')", [conv, USERS.owner]);
  }
  F.managerMessage = uuid();
  await q("insert into property.chat_messages (id, conversation_id, author_id, text) values ($1, $2, $3, 'manager says')", [F.managerMessage, F.publicChannel, USERS.manager]);
});

after(async () => {
  await h?.close();
});

test("audit: no open policy, no anon table or routine grant, RLS on every table", async () => {
  const open = await h.c.query(`select tablename, policyname from pg_policies
     where schemaname = 'property' and (qual = 'true' or with_check = 'true')`);
  assert.deepEqual(open.rows, [], "pg_policies has no using(true) / with check(true) in property");
  const anon = await h.c.query(`select distinct c.relname, a.privilege_type
      from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
     where n.nspname = 'property' and a.grantee = 'anon'::regrole
       and not (c.relname in ('legal_jurisdictions', 'legal_resources') and a.privilege_type = 'SELECT')`);
  assert.deepEqual(anon.rows, [], "anon holds nothing in property but select on legal_*");
  const off = await h.c.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
  assert.deepEqual(off.rows, [], "every property table has RLS on");
  const routines = await h.c.query(`select routine_name, grantee from information_schema.routine_privileges
     where routine_schema = 'property' and grantee in ('anon', 'PUBLIC')`);
  assert.deepEqual(routines.rows, [], "no anon / PUBLIC execute in property");
  const del = await h.c.query(`select distinct c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
     where n.nspname = 'property' and a.grantee = 'authenticated'::regrole and a.privilege_type in ('DELETE', 'TRUNCATE')
     order by 1`);
  assert.deepEqual(del.rows.map((r) => r.relname), ["amenity_links", "chat_members", "floor_plan_links"], "authenticated hard-deletes only the link tables");
});

// Relations where a persona's count is a leak (anything but a permission error or zero).
const leaksOf = (who, counts) => Object.entries(counts).filter(([, n]) => n !== null && n !== 0).map(([t, n]) => `${who} ${t}: ${n}`);
const names = (pred = () => true) => rels.filter(pred).map((r) => r.name);
const legal = (r) => r.name.startsWith("legal_");

test("anon: permission errors or nothing on every relation except global legal rows", async () => {
  const leaks = leaksOf("anon", await h.counts("anon", names((r) => !legal(r))));
  const globals = await h.counts("anon", ["legal_jurisdictions", "legal_resources"]);
  const own = await h.counts("anon", ["legal_jurisdictions", "legal_resources"], "where project_id is not null or deleted_at is not null");
  for (const t of Object.keys(globals)) if (!(globals[t] > 0) || own[t] !== 0) leaks.push(`anon ${t}: ${globals[t]} rows, ${own[t]} project/deleted`);
  assert.deepEqual(leaks, []);
  assert.equal((await h.runAs("anon", "insert into property.tenants (project_id, name) values ($1, 'anon')", [DEMO])).code, "42501");
  assert.equal((await h.runAs("anon", "select property.ledger_post('{}'::jsonb, '[]'::jsonb)")).code, "42501");
  assert.equal((await h.runAs("anon", "select property.member_project_ids()")).code, "42501");
});

test("outsiders and portal accounts read [] from every relation; another org never sees the demo", async () => {
  const leaks = [];
  for (const who of ["outsider", ...PORTAL]) {
    leaks.push(...leaksOf(who, await h.counts(who, names((r) => !legal(r)))));
    leaks.push(...leaksOf(who, await h.counts(who, names(legal), "where project_id is not null")));
  }
  leaks.push(...leaksOf("otherOrg", await h.counts("otherOrg", names((r) => r.scoped), `where project_id = '${DEMO}'`)));
  assert.deepEqual(leaks, []);
  assert.equal(await seen("otherOrg", "select count(*) as n from property.tenants where id = $1", [F.otherTenant]), 1, "another org sees its own tenant");
  assert.equal(await seen("otherOrg", "select count(*) as n from property.chat_profiles where id = $1", [USERS.owner]), 0, "another org can't list demo chat profiles");
});

test("members see their projects only: nothing foreign, nothing project-less", async () => {
  assert.ok((await seen("manager", "select count(*) as n from property.tenants")) > 0);
  assert.ok((await seen("tech", "select count(*) as n from property.work_orders")) > 0);
  assert.ok((await seen("manager", "select count(*) as n from property.settings")) > 0);
  const leaks = [
    ...leaksOf("manager", await h.counts("manager", names((r) => r.scoped), `where project_id = '${OTHER}'`)),
    ...leaksOf("manager", await h.counts("manager", names((r) => r.scoped && !legal(r)), "where project_id is null")),
  ];
  assert.deepEqual(leaks, []);
  assert.equal(await seen("owner", "select count(*) as n from property.review_items where source_type = 'job_run' and project_id is null"), 0, "redacted job_run review items stay hidden");
});

test("writes stay inside the member's projects; no hard deletes", async () => {
  assert.equal((await h.runAs("manager", "insert into property.tenants (project_id, name) values ($1, 'RLS member insert') returning id", [DEMO])).count, 1);
  assert.equal((await h.runAs("manager", "insert into property.tenants (project_id, name) values ($1, 'RLS cross insert')", [OTHER])).code, "42501");
  assert.equal((await h.runAs("manager", "update property.tenants set name = 'hijack' where id = $1", [F.otherTenant])).count, 0);
  assert.equal((await h.runAs("manager", "update property.tenants set project_id = $2 where id = $1", [F.demoTenant, OTHER])).code, "42501", "a row can't move to another org's project");
  assert.equal((await h.runAs("manager", "delete from property.tenants where id = $1", [F.demoTenant])).code, "42501");
  assert.equal((await h.runAs("tech", "update property.work_orders set metadata = metadata || '{\"rls\": 1}' where id = $1", [F.workOrder])).count, 1, "a maintenance tech updates a work order");
  assert.equal((await h.runAs("manager", "update property.tenants set deleted_at = now() where id = $1", [F.demoTenant])).count, 1, "a manager (record.delete) soft-deletes; 01e gates the rest");
});

test("financial tables: accounting.view reads, accounting.post writes, the ledger is RPC-only", async () => {
  assert.ok((await seen("accountant", "select count(*) as n from property.ledger_lines")) > 0);
  assert.ok((await seen("manager", "select count(*) as n from property.ledger_entries")) > 0);
  for (const t of ["ledger_lines", "ledger_entries", "gl_accounts", "bills", "transactions", "bank_accounts", "budgets", "online_payments", "stripe_events", "ledger_party_balances", "ledger_account_balances"]) {
    for (const who of ["tech", "leasing"]) assert.equal(await seen(who, `select count(*) as n from property.${t}`), 0, `${who} reads no ${t}`);
  }
  assert.equal((await h.runAs("accountant", "insert into property.ledger_lines (project_id, entry_id, gl_account_id, debit) values ($1, $2, $3, 1)", [DEMO, F.entry, F.cash])).code, "42501");
  assert.equal((await h.runAs("accountant", "update property.ledger_lines set debit = 0 where id = $1", [F.line])).code, "42501");
  assert.equal((await h.runAs("accountant", "update property.ledger_lines set metadata = '{\"depositId\": \"x\"}' where id = $1", [F.line])).code, "42501", "line metadata is trusted-only");
  assert.equal((await h.runAs("accountant", "update property.ledger_entries set memo = memo where id = $1", [F.entry])).code, "42501", "entries change only through ledger_void");
  assert.equal((await h.runAs("accountant", "update property.ledger_lines set cleared = true, cleared_on = current_date where id = $1", [F.line])).count, 1, "an accountant reconciles");
  assert.ok(denied(await h.runAs("tech", "update property.ledger_lines set cleared = true where id = $1", [F.line])), "a tech can't reconcile");
  assert.equal((await h.runAs("accountant", "insert into property.bills (project_id, name) values ($1, 'RLS bill') returning id", [DEMO])).count, 1);
  assert.equal((await h.runAs("tech", "insert into property.bills (project_id, name) values ($1, 'RLS bill')", [DEMO])).code, "42501");
  assert.equal((await h.runAs("leasing", "insert into property.gl_accounts (project_id, name) values ($1, 'RLS gl')", [DEMO])).code, "42501");
});

test("server-written tables: members read, the service role writes; run cancel needs automation.manage", async () => {
  assert.equal((await h.runAs("manager", "insert into property.online_payments (project_id, amount) values ($1, 1)", [DEMO])).code, "42501");
  assert.equal((await h.runAs("manager", "insert into property.portal_members (project_id, email) values ($1, 'rls@example.com')", [DEMO])).code, "42501");
  assert.equal((await h.runAs("manager", "insert into property.job_runs (project_id, job_key) values ($1, 'rls')", [DEMO])).code, "42501");
  assert.equal(await seen("manager", "select count(*) as n from property.job_runs where project_id is null"), 0);
  assert.ok((await seen("manager", "select count(*) as n from property.portal_members")) > 0);
  if (F.run) {
    assert.ok(denied(await h.runAs("tech", "update property.automation_runs set status = 'cancelled' where id = $1", [F.run])), "a tech can't cancel a run");
    assert.equal((await h.runAs("manager", "update property.automation_runs set status = 'cancelled', finished_at = now() where id = $1", [F.run])).count, 1);
    assert.equal((await h.runAs("manager", "update property.automation_runs set log = '[]' where id = $1", [F.run])).code, "42501", "only the cancel columns");
  }
  assert.equal((await h.runAs("service", "insert into property.online_payments (project_id, amount) values ($1, 1) returning id", [DEMO])).count, 1);
});

test("settings: per-key write permissions", async () => {
  const save = (who, key) => h.runAs(who, "insert into property.settings (project_id, key, value) values ($1, $2, '{}') on conflict do nothing", [DEMO, key]);
  const touch = (who, key) => h.runAs(who, "update property.settings set value = value where project_id = $1 and key = $2", [DEMO, key]);
  assert.equal((await touch("manager", "company_profile")).count, 1);
  assert.equal((await touch("leasing", "company_profile")).count, 0);
  assert.equal((await touch("manager", "integrations")).count, 1);
  assert.equal((await touch("accountant", "integrations")).count, 0);
  assert.equal((await touch("tech", "automation_guardrails")).count, 0);
  assert.equal((await save("manager", "roles")).code, "42501", "roles needs role.manage");
  assert.equal((await save("owner", "roles")).count, 1);
  // Screening criteria have their own key since RISK-03 (it follows settings.manage); the leasing agent doesn't hold it.
  assert.equal((await save("leasing", "screening_criteria")).code, "42501", "screening criteria need screening.criteria");
  assert.equal((await save("manager", "screening_criteria")).code, undefined, "the manager holds screening.criteria");
  assert.equal((await h.runAs("leasing", "update property.settings set key = 'onboarding_y' where project_id = $1 and key = 'integrations'", [DEMO])).count, 0, "a gated key can't be renamed away");
});

test("team roster: team.invite writes; no account links, planted Disabled rows or roles beyond the inviter", async () => {
  const invite = (who, row) => h.runAs(who, "insert into property.team_members (project_id, name, email, role, status, metadata) values ($1, 'RLS invite', $2, $3, $4, $5) returning id", [DEMO, row.email || `rls-${uuid().slice(0, 8)}@example.com`, row.role ?? "", row.status || "Invited", row.metadata || {}], row.keep);
  assert.equal((await invite("manager", { role: "Leasing agent" })).count, 1);
  assert.equal((await invite("manager", { role: "" })).count, 1);
  assert.equal((await invite("tech", { role: "" })).code, "42501", "a tech can't invite");
  assert.equal((await invite("manager", { role: "Owner" })).code, "42501", "a manager can't invite an owner");
  assert.equal((await invite("manager", { role: "Admin" })).code, "42501", "a manager can't invite an admin");
  assert.equal((await invite("manager", { metadata: { userId: USERS.tech } })).code, "42501", "only the database links accounts");
  assert.equal((await invite("manager", { status: "Disabled", email: "victim@example.com" })).code, "42501", "no planted Disabled rows");
  const own = await invite("owner", { status: "Disabled", email: "victim@example.com" });
  assert.equal(own.count, 1, `an org owner may disable: ${own.message}`);
  const row = (await invite("manager", { role: "", keep: true })).rows[0].id;
  assert.equal((await h.runAs("manager", "update property.team_members set status = 'Disabled' where id = $1", [row])).code, "42501");
  assert.equal((await h.runAs("manager", "update property.team_members set role = 'Owner' where id = $1", [row])).code, "42501");
  assert.equal((await h.runAs("manager", "update property.team_members set role = 'Accountant' where id = $1", [row])).count, 1);
});

test("team roster: rbac_ensure_membership still claims an invite (its writes run as the owner)", async () => {
  await h.c.query("savepoint claim");
  try {
    const email = (await h.c.query("select email from auth.users where id = $1", [USERS.tech])).rows[0].email;
    await h.c.query("delete from property.role_grants where user_id = $1 and project_id = $2", [USERS.tech, DEMO]);
    await h.c.query("update property.team_members set deleted_at = now() where project_id = $1 and (lower(email) = lower($2) or metadata ->> 'userId' = $3)", [DEMO, email, USERS.tech]);
    const row = (await h.c.query("insert into property.team_members (project_id, name, email, role, status) values ($1, 'RLS claim', $2, 'Leasing agent', 'Invited') returning id", [DEMO, email])).rows[0].id;
    const r = await h.runAs("tech", "select property.rbac_ensure_membership($1) as role", [DEMO], true);
    assert.ok(r.rows?.[0]?.role, `claimed a role: ${r.message || ""}`);
    const linked = (await h.c.query("select status, metadata ->> 'userId' as uid from property.team_members where id = $1", [row])).rows[0];
    assert.deepEqual(linked, { status: "Active", uid: USERS.tech });
    const key = (await h.c.query("select r.key from public.roles r where r.id = $1", [r.rows[0].role])).rows[0].key;
    assert.equal(key, "leasing_agent");
  } finally {
    await h.c.query("rollback to savepoint claim");
    await h.as("postgres");
  }
});

test("link tables: same-project parents only, member-scoped hard delete", async () => {
  const link = (amenity, ownerId, keep) => h.runAs("manager", "insert into property.amenity_links (amenity_id, owner_type, owner_id, project_id) values ($1, 'property', $2, $3) returning id", [amenity, ownerId, DEMO], keep);
  const ok = await link(F.demoAmenity, F.demoProperty, true);
  assert.equal(ok.count, 1);
  assert.equal((await link(F.otherAmenity, F.demoProperty)).code, "42501", "another project's amenity");
  assert.equal((await link(F.demoAmenity, F.otherProperty)).code, "42501", "another project's property");
  assert.equal((await h.runAs("otherOrg", "delete from property.amenity_links where id = $1", [ok.rows[0].id])).count, 0);
  assert.equal((await h.runAs("manager", "delete from property.amenity_links where id = $1", [ok.rows[0].id])).count, 1);
});

test("legal reference: global rows for everyone, project rows for members, globals via the service role", async () => {
  assert.ok((await seen("anon", "select count(*) as n from property.legal_resources")) > 0);
  assert.ok((await seen("manager", "select count(*) as n from property.legal_resources where project_id is null")) > 0);
  const add = (who, project) => h.runAs(who, "insert into property.legal_resources (project_id, jurisdiction_code, url) values ($1, 'RLS', 'https://example.com') returning id", [project]);
  assert.equal((await add("manager", DEMO)).count, 1);
  assert.equal((await add("manager", null)).code, "42501");
  assert.equal((await add("anon", null)).code, "42501");
  assert.equal((await add("service", null)).count, 1);
  assert.equal((await h.runAs("manager", "update property.legal_resources set title = title where project_id is null")).count, 0);
});

test("chat: private and DM conversations stay with their members; own profile, messages and membership", async () => {
  const msgs = (who, conv) => seen(who, "select count(*) as n from property.chat_messages where conversation_id = $1", [conv]);
  assert.equal(await msgs("owner", F.privateChannel), 1);
  assert.equal(await msgs("manager", F.privateChannel), 0, "not a member of the private channel");
  assert.equal(await msgs("manager", F.dm), 1);
  assert.equal(await msgs("tech", F.dm), 0, "not in the DM");
  assert.equal(await msgs("tech", F.publicChannel), 2);
  assert.equal(await msgs("otherOrg", F.publicChannel), 0);
  assert.equal((await h.runAs("tech", "insert into property.chat_messages (conversation_id, author_id, text) values ($1, $2, 'spoof')", [F.publicChannel, USERS.owner])).code, "42501");
  assert.equal((await h.runAs("tech", "insert into property.chat_messages (conversation_id, author_id, text) values ($1, $2, 'hi') returning id", [F.publicChannel, USERS.tech])).count, 1);
  assert.equal((await h.runAs("tech", "insert into property.chat_messages (conversation_id, author_id, text) values ($1, $2, 'hi')", [F.privateChannel, USERS.tech])).code, "42501");
  assert.equal((await h.runAs("tech", "update property.chat_messages set text = 'edited' where id = $1", [F.managerMessage])).count, 0, "only the author edits");
  assert.equal((await h.runAs("tech", "select property.chat_toggle_reaction($1, ':+1:', $2)", [F.managerMessage, USERS.tech])).code, undefined, "reactions on others' messages go through the RPC");
  assert.equal((await h.runAs("tech", "insert into property.chat_members (conversation_id, profile_id) values ($1, $2)", [F.privateChannel, USERS.tech])).code, "42501", "can't join a private channel uninvited");
  assert.equal((await h.runAs("tech", "insert into property.chat_members (conversation_id, profile_id) values ($1, $2) returning id", [F.publicChannel, USERS.tech], true)).count, 1);
  assert.equal((await h.runAs("manager", "insert into property.chat_members (conversation_id, profile_id) values ($1, $2) on conflict do nothing", [F.dm, USERS.manager])).code, undefined, "a DM participant (re)joins");
  assert.equal((await h.runAs("tech", "delete from property.chat_members where conversation_id = $1 and profile_id = $2", [F.privateChannel, USERS.owner])).count, 0);
  assert.equal((await h.runAs("tech", "delete from property.chat_members where conversation_id = $1 and profile_id = $2", [F.publicChannel, USERS.tech])).count, 1, "leave a channel");
  assert.equal((await h.runAs("tech", "update property.chat_profiles set display_name = 'x' where id = $1", [USERS.owner])).count, 0);
  assert.equal((await h.runAs("tech", "update property.chat_profiles set presence = 'online' where id = $1", [USERS.tech])).count, 1);
  assert.ok((await seen("tech", "select count(*) as n from property.chat_profiles where id = $1", [USERS.owner])) === 1, "project directory");
});

test("audit log and the ledger views follow their gates", async () => {
  assert.ok((await seen("manager", "select count(*) as n from property.audit_log")) > 0);
  assert.equal(await seen("tech", "select count(*) as n from property.audit_log"), 0);
  assert.equal(await seen("manager", "select count(*) as n from property.audit_log where coalesce(project_id::text, '') not in ($1, '4ea32a09-f913-4b5f-8010-6395c3df7cdc')", [DEMO]), 0);
  assert.ok((await seen("accountant", "select count(*) as n from property.ledger_party_balances")) > 0);
  assert.equal((await h.runAs("manager", "insert into property.audit_log (table_name, action) values ('x', 'insert')")).code, "42501");
});

test("locked tables: orphans, backups and the migration ledger are closed to clients", async () => {
  for (const t of LOCKED) {
    for (const who of ["anon", "manager"]) assert.equal((await h.runAs(who, `select count(*) from property.${t}`)).code, "42501", `${who} on ${t}`);
  }
});

test("the service role keeps full access", async () => {
  const all = Number((await h.c.query("select count(*) as n from property.tenants")).rows[0].n);
  assert.equal(await seen("service", "select count(*) as n from property.tenants"), all);
  assert.equal((await h.runAs("service", "update property.ledger_lines set metadata = metadata where id = $1", [F.line])).count, 1);
});

test("ledger RPCs: anon and tech refused, accountant posts, foreign projects and dimensions refused", async () => {
  const entry = (extra = {}) => JSON.stringify({ project_id: DEMO, entry_date: "2026-11-08", memo: "RLS post", source_type: "adjustment", ...extra });
  const lines = (extra = {}) => JSON.stringify([{ gl_account_id: F.cash, debit: 1, ...extra }, { gl_account_id: F.ar, credit: 1 }]);
  const post = (who, e, l) => h.runAs(who, "select property.ledger_post($1::jsonb, $2::jsonb) as id", [e, l]);
  assert.equal((await post("anon", entry(), lines())).code, "42501");
  assert.equal((await post("tech", entry(), lines())).code, "42501");
  assert.ok((await post("accountant", entry(), lines())).rows?.[0]?.id, "accountant posts");
  assert.equal((await post("accountant", entry({ project_id: OTHER }), lines())).code, "42501");
  assert.ok((await post("accountant", entry({ tenant_id: F.otherTenant }), lines())).code, "entry tenant from another project");
  assert.ok((await post("accountant", entry(), lines({ property_id: F.otherProperty }))).code, "line property from another project");
  assert.ok((await post("service", entry({ memo: "RLS service" }), lines())).rows?.[0]?.id, "the service role posts");
  const def = await h.c.query("select prosecdef from pg_proc where oid = 'property.ledger_check_balance'::regproc");
  assert.equal(def.rows[0].prosecdef, true, "deferred balance checks see every line");
});
