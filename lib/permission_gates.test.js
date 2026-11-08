import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import rbacConfig, { parentKeyOf } from "@/geiger-rbac.config";
import { navPermissionKey } from "@/lib/rbac";

// PLAT-01e: the database's permission gates stay in place when later migrations redefine their functions.

const DIR = path.resolve("supabase/migrations");
const migrations = () =>
  readdirSync(DIR, { recursive: true })
    .filter((f) => String(f).endsWith(".sql"))
    .map((f) => ({ name: path.basename(String(f)), sql: readFileSync(path.join(DIR, String(f)), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));

// A migration's @up without comments or identifier quotes, lower-cased, whitespace collapsed.
const upOf = (sql) =>
  (sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "")
    .replace(/"/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

// The newest @up definition of a property function.
function latest(fn) {
  let found = null;
  for (const m of migrations()) {
    const up = upOf(m.sql);
    const at = up.lastIndexOf(`create or replace function property.${fn}(`);
    if (at >= 0) found = { name: m.name, body: up.slice(at, up.indexOf("$$;", up.indexOf("$$", at) + 2) + 3) };
  }
  return found;
}

test("gates: the newest apply_member_rls still attaches the soft-delete guard", () => {
  const def = latest("apply_member_rls");
  assert.ok(def, "apply_member_rls is defined");
  assert.match(def.body, /perform property\.attach_soft_delete_guard\(p_table\)/, `${def.name} drops the soft-delete guard`);
});

test("gates: the soft-delete guard checks the table's key for client writes, record.delete by default", () => {
  const guard = latest("guard_soft_delete");
  assert.ok(guard, "guard_soft_delete is defined");
  assert.match(guard.body, /security invoker/);
  assert.match(guard.body, /current_user not in \('anon', 'authenticated'\)/);
  assert.match(guard.body, /property\.rbac_allows\(v_key, old\.project_id\)/);
  const keys = latest("soft_delete_permission");
  assert.match(keys.body, /else 'property\.record\.delete'/);
  for (const t of ["settings", "team_members", "role_grants"]) assert.ok(keys.body.includes(`'${t}'`), `${t} stays key-gated`);
});

test("gates: member_project_ids requires an active grant on a live role", () => {
  const def = latest("member_project_ids");
  assert.match(def.body, /from property\.role_grants g/);
  assert.match(def.body, /g\.status = 'active'/);
  assert.match(def.body, /g\.deleted_at is null/);
  assert.match(def.body, /public\.is_project_member\(g\.project_id\)/);
});

test("gates: deposit ledger links stay server-written and lease rent syncs need rent.manage", () => {
  const all = migrations();
  const at = all.findIndex((m) => upOf(m.sql).includes("guard_server_columns('charge_entry_id', 'apply_entry_id', 'refund_bill_id')"));
  assert.ok(at >= 0, "security_deposits_server_columns is created");
  assert.ok(!all.slice(at + 1).some((m) => /drop trigger (if exists )?security_deposits_server_columns/.test(upOf(m.sql))), "no later migration drops it");
  assert.match(latest("lease_sync_current_rent").body, /property\.rbac_allows\('property\.rent\.manage', v_project\)/);
});

test("gates: leasing write keys belong to the leasing agent and inherit from their pages", () => {
  const role = (key) => rbacConfig.systemRoles.find((r) => r.key === key);
  for (const key of ["property.lease.manage", "property.renewal.manage"]) {
    assert.ok(role("leasing_agent").permissions.includes(key), `leasing agent holds ${key}`);
    assert.ok(role("manager").permissions.includes(key), `manager holds ${key}`);
    assert.ok(!role("maintenance_tech").permissions.includes(key), `maintenance tech lacks ${key}`);
  }
  assert.equal(parentKeyOf("property.lease.manage"), navPermissionKey("Leases"));
  assert.equal(parentKeyOf("property.renewal.manage"), navPermissionKey("Renewals"));
});
