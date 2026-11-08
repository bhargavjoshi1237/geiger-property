// PLAT-01e permission gates against the live database, inside one rolled-back transaction (see harness.mjs).
// Run: npm run test:rls   (RLS_APPLY_UP=permission_gates dry-runs that migration's @up first)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DEMO, USERS, openHarness } from "./harness.mjs";

let h;
const F = {};
const uuid = () => crypto.randomUUID();
const denied = (r) => Boolean(r.code === "42501" || (r.count === 0 && !r.code));
const NO_DELETE = "Your role can't delete records.";

before(async () => {
  h = await openHarness();
  const q = (sql, params) => h.c.query(sql, params);
  const first = async (sql) => (await q(sql, [DEMO])).rows[0];
  F.tenant = (await first("select id from property.tenants where project_id = $1 and deleted_at is null order by created_at limit 1")).id;
  F.workOrder = (await first("select id from property.work_orders where project_id = $1 and deleted_at is null order by created_at limit 1")).id;
  F.lease = (await first("select id from property.leases where project_id = $1 and deleted_at is null order by created_at limit 1")).id;
  F.budgetLine = (await first("select id from property.budget_lines where project_id = $1 and deleted_at is null order by created_at limit 1")).id;
  F.schedule = (await first("select id from property.report_schedules where project_id = $1 and deleted_at is null order by created_at limit 1")).id;
  F.deposit = (await first("select id from property.security_deposits where project_id = $1 and deleted_at is null and charge_entry_id is not null order by created_at limit 1")).id;
  // A draft opening-balance batch, a chat notification for the tech and an accounting_export setting (all rolled back).
  F.batch = uuid();
  await q("insert into property.conversion_batches (id, project_id, name, cutover_date) values ($1, $2, 'RLS draft', '2026-11-01')", [F.batch, DEMO]);
  F.convLine = uuid();
  await q("insert into property.conversion_lines (id, project_id, batch_id, kind, amount) values ($1, $2, $3, 'gl_balance', 1)", [F.convLine, DEMO, F.batch]);
  F.notification = uuid();
  await q("insert into property.chat_profiles (id, display_name, project_ids) values ($1, 'RLS tech', $2) on conflict (id) do nothing", [USERS.tech, [DEMO]]);
  await q("insert into property.chat_notifications (id, project_id, profile_id, type) values ($1, $2, $3, 'mention')", [F.notification, DEMO, USERS.tech]);
  await q("insert into property.settings (project_id, key, value) values ($1, 'accounting_export', '{}') on conflict do nothing", [DEMO]);
});

after(async () => {
  await h?.close();
});

// Statements that roll back to a savepoint afterwards, for fixtures that change grants or roles.
async function isolated(fn) {
  await h.c.query("savepoint gates");
  try {
    return await fn();
  } finally {
    await h.c.query("rollback to savepoint gates");
    await h.as("postgres");
  }
}

test("audit: the soft-delete guard is on every project table but the key-gated and chat ones", async () => {
  const { rows } = await h.c.query(`
    select c.relname, property.soft_delete_permission(c.relname) as key,
           exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'guard_soft_delete') as guarded
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('r', 'p')
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'project_id' and not a.attisdropped)
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'deleted_at' and not a.attisdropped)`);
  assert.ok(rows.length > 80, `project tables with deleted_at: ${rows.length}`);
  assert.deepEqual(rows.filter((r) => Boolean(r.key) !== r.guarded).map((r) => r.relname), [], "guarded exactly where a key applies");
  const open = rows.filter((r) => !r.key).map((r) => r.relname).sort();
  assert.ok(open.every((t) => ["settings", "team_members", "role_grants"].includes(t) || t.startsWith("chat_")), `unguarded: ${open}`);
  const fn = await h.c.query("select prosecdef from pg_proc where oid = 'property.guard_soft_delete'::regproc");
  assert.equal(fn.rows[0].prosecdef, false, "the guard is invoker so current_user is the client role");
});

test("soft delete needs record.delete: tech, leasing agent and accountant can't delete a tenant; a manager can", async () => {
  const del = (who, table, id) => h.runAs(who, `update property.${table} set deleted_at = now() where id = $1`, [id]);
  for (const who of ["tech", "leasing", "accountant"]) {
    const r = await del(who, "tenants", F.tenant);
    assert.equal(r.code, "42501", `${who} soft-deletes a tenant`);
    assert.equal(r.message, NO_DELETE);
  }
  assert.equal((await h.runAs("tech", "update property.work_orders set metadata = metadata || '{\"rls\": 1}' where id = $1", [F.workOrder])).count, 1, "a tech still edits a work order");
  assert.equal((await del("tech", "work_orders", F.workOrder)).code, "42501", "but can't delete it");
  assert.equal((await del("service", "tenants", F.tenant)).count, 1, "the service role soft-deletes");
  assert.equal((await h.runAs("manager", "update property.tenants set deleted_at = now() where id = $1", [F.tenant], true)).count, 1, "a manager soft-deletes");
  const restore = (who) => h.runAs(who, "update property.tenants set deleted_at = null where id = $1", [F.tenant]);
  assert.equal((await restore("tech")).code, "42501", "restoring needs the key too");
  assert.equal((await restore("manager")).count, 1);
  await h.c.query("update property.tenants set deleted_at = null where id = $1", [F.tenant]);
});

test("table keys: budget lines, draft conversion lines and report schedules use their own write key; chat keeps its rules", async () => {
  const del = (who, table, id) => h.runAs(who, `update property.${table} set deleted_at = now() where id = $1`, [id]);
  assert.equal((await del("accountant", "budget_lines", F.budgetLine)).count, 1, "an accountant removes a budget line (accounting.post)");
  assert.ok(denied(await del("tech", "budget_lines", F.budgetLine)));
  assert.equal((await del("accountant", "conversion_lines", F.convLine)).count, 1, "an accountant removes a draft opening balance (accounting.convert)");
  assert.equal((await del("accountant", "conversion_batches", F.batch)).code, "42501", "deleting the whole batch is a record delete");
  assert.equal((await del("accountant", "report_schedules", F.schedule)).count, 1, "an accountant deletes a schedule (report.schedule)");
  assert.ok(denied(await del("leasing", "report_schedules", F.schedule)), "a leasing agent can't");
  const schedule = (who) => h.runAs(who, "insert into property.report_schedules (project_id, report_key, name) values ($1, 'rent-roll', 'RLS schedule') returning id", [DEMO]);
  assert.equal((await schedule("accountant")).count, 1);
  assert.equal((await schedule("leasing")).code, "42501", "report schedules need report.schedule to write");
  assert.equal((await del("tech", "chat_notifications", F.notification)).count, 1, "a tech clears their own notification");
});

test("an inactive Property grant reads and writes nothing; org owners reclaim theirs on load, others don't", async () => {
  await isolated(async () => {
    await h.c.query("update property.role_grants set status = 'inactive' where project_id = $1 and user_id = any($2)", [DEMO, [USERS.tech, USERS.owner]]);
    const sees = (who, table) => h.seen(who, `select count(*) as n from property.${table}`);
    for (const t of ["work_orders", "tenants", "settings", "team_members", "role_grants", "units"]) assert.equal(await sees("tech", t), 0, `disabled tech reads no ${t}`);
    assert.equal((await h.runAs("tech", "update property.work_orders set metadata = metadata where id = $1", [F.workOrder])).count, 0);
    assert.equal((await h.runAs("tech", "insert into property.tenants (project_id, name) values ($1, 'RLS disabled')", [DEMO])).code, "42501");
    const techClaim = await h.runAs("tech", "select property.rbac_ensure_membership($1) as role", [DEMO], true);
    assert.equal(techClaim.rows?.[0]?.role ?? null, null, "a deactivated grant is never handed back");
    assert.equal(await sees("tech", "work_orders"), 0);
    assert.equal(await sees("owner", "tenants"), 0, "an owner without an active grant reads nothing");
    const ownerClaim = await h.runAs("owner", "select property.rbac_ensure_membership($1) as role", [DEMO], true);
    assert.ok(ownerClaim.rows?.[0]?.role, `the org owner reclaims: ${ownerClaim.message || ""}`);
    assert.ok((await sees("owner", "tenants")) > 0, "and reads again");
  });
});

test("deposit ledger links are server-written", async () => {
  const upd = (who, set) => h.runAs(who, `update property.security_deposits set ${set} where id = $1`, [F.deposit]);
  assert.equal((await upd("manager", "charge_entry_id = gen_random_uuid()")).code, "42501");
  assert.equal((await upd("manager", "charge_entry_id = null")).code, "42501");
  assert.equal((await upd("manager", "apply_entry_id = gen_random_uuid()")).code, "42501");
  assert.equal((await upd("manager", "refund_bill_id = gen_random_uuid()")).code, "42501");
  assert.equal((await upd("manager", "name = name, amount = amount")).count, 1, "other columns stay editable");
  const insert = (who, link) => h.runAs(who, `insert into property.security_deposits (project_id, name, amount${link ? ", refund_bill_id" : ""}) values ($1, 'RLS deposit', 1${link ? ", gen_random_uuid()" : ""}) returning id`, [DEMO]);
  assert.equal((await insert("manager", true)).code, "42501", "a client can't insert a linked deposit");
  assert.equal((await insert("manager", false)).count, 1);
  assert.equal((await upd("service", "charge_entry_id = null")).count, 1, "the service role writes links");
});

test("lease_sync_current_rent needs rent.manage for signed-in callers", async () => {
  const sync = (who) => h.runAs(who, "select property.lease_sync_current_rent($1, current_date) as rent", [F.lease]);
  for (const who of ["leasing", "tech", "anon"]) assert.equal((await sync(who)).code, "42501", who);
  assert.equal((await sync("accountant")).code, undefined, "an accountant (rent.manage) syncs");
  assert.equal((await sync("service")).code, undefined);
});

test("opening balances need accounting.convert; accounting_export settings need accounting.post", async () => {
  const batch = (who) => h.runAs(who, "insert into property.conversion_batches (project_id, name, cutover_date) values ($1, 'RLS', '2026-11-01') returning id", [DEMO]);
  assert.equal((await batch("accountant")).count, 1);
  await isolated(async () => {
    // A role with view + post but not convert, on the leasing persona.
    const role = (await h.c.query("insert into public.roles (project_id, key, name, permissions) values ($1, 'rls_poster', 'RLS poster', $2) returning id", [DEMO, ["property.accounting.view", "property.accounting.post", "property.bills_payables.view"]])).rows[0].id;
    await h.c.query("update property.role_grants set role_id = $1 where user_id = $2 and project_id = $3 and deleted_at is null", [role, USERS.leasing, DEMO]);
    assert.equal((await batch("leasing")).code, "42501", "accounting.post alone can't edit opening balances");
    assert.equal((await h.runAs("leasing", "update property.conversion_lines set amount = 2 where id = $1", [F.convLine])).count, 0);
    assert.equal((await h.runAs("leasing", "insert into property.bills (project_id, name) values ($1, 'RLS bill') returning id", [DEMO])).count, 1, "but posts bills");
  });
  const touch = (who) => h.runAs(who, "update property.settings set value = value where project_id = $1 and key = 'accounting_export'", [DEMO]);
  assert.equal((await touch("accountant")).count, 1, "an accountant saves the export mapping");
  assert.equal((await touch("tech")).count, 0);
  assert.equal((await touch("leasing")).count, 0);
});

test("leasing write keys: the agent role holds lease.manage and renewal.manage; the tech doesn't", async () => {
  const held = async (role) => (await h.c.query("select k from property.rbac_system_role($1) r, unnest(r.permissions) k where k in ('property.lease.manage', 'property.renewal.manage') order by 1", [role])).rows.map((r) => r.k);
  assert.deepEqual(await held("leasing_agent"), ["property.lease.manage", "property.renewal.manage"]);
  assert.deepEqual(await held("maintenance_tech"), []);
  assert.deepEqual(await held("manager"), ["property.lease.manage", "property.renewal.manage"]);
});
