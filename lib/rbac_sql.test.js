import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import rbacConfig from "@/geiger-rbac.config";
import { SQL_END, SYNC_SQL, extractSystemRolesSql, latestSystemRolesSql, sameSql, systemRolesMigration, systemRolesSql } from "./rbac_sql";

const DIR = path.resolve("supabase/migrations");
const migrations = () =>
  readdirSync(DIR, { recursive: true })
    .filter((f) => String(f).endsWith(".sql"))
    .map((f) => ({ name: path.basename(String(f)), sql: readFileSync(path.join(DIR, String(f)), "utf8") }));

test("rbac SQL: the newest migration's system-role copy matches geiger-rbac.config.js", () => {
  const latest = latestSystemRolesSql(migrations());
  assert.ok(latest, "no migration carries the generated system-role block");
  assert.ok(
    sameSql(latest.block, systemRolesSql(rbacConfig)),
    `${latest.name} is out of date with geiger-rbac.config.js: run \`npm run db:new -- rbac_system_roles\`, then ` +
      "`npm run rbac:sql -- <that file>`, then db:status → db:push → db:status.",
  );
});

test("rbac SQL: the newest regeneration migration syncs existing projects' stored system roles after its copy", () => {
  const all = migrations();
  const latest = latestSystemRolesSql(all);
  const [up, down = ""] = all.find((m) => m.name === latest.name).sql.replace(/\r\n/g, "\n").split(/^-- @down\s*$/m);
  assert.ok(up.indexOf(SYNC_SQL) > up.indexOf(SQL_END), `${latest.name} must run ${SYNC_SQL} after its copy: regenerate it with \`npm run rbac:sql\``);
  assert.ok(!down.includes(SYNC_SQL), "@down only restores the previous copy");
  const fn = all.find((m) => /_rbac_role_sync\.sql$/.test(m.name));
  assert.ok(fn && fn.name < latest.name, "the sync function's migration comes before the regeneration that calls it");
});

test("rbac SQL: every system role and catalog key is in the generated copy", () => {
  const sql = systemRolesSql(rbacConfig);
  for (const role of rbacConfig.systemRoles) {
    assert.ok(sql.includes(`('${role.key}', `), role.key);
    for (const key of role.permissions) assert.ok(sql.includes(`'${key}'`), `${role.key}: ${key}`);
  }
  for (const p of rbacConfig.permissions) assert.ok(sql.includes(`'${p.key}'`), p.key);
});

test("rbac SQL: regeneration migrations sync stored roles, and put the previous copy back on @down", () => {
  const previous = { name: "20990101000000_rbac_system_roles.sql", block: "-- rbac:system-roles:begin\nselect 1;\n-- rbac:system-roles:end" };
  const body = systemRolesMigration(rbacConfig, previous);
  assert.ok(sameSql(extractSystemRolesSql(body), systemRolesSql(rbacConfig)));
  assert.ok(body.split("-- @down")[0].includes(SYNC_SQL), "@up syncs stored roles");
  assert.ok(body.split("-- @down")[1].includes("select 1;"));
  assert.ok(!body.split("-- @down")[1].includes(SYNC_SQL));
  assert.ok(systemRolesMigration(rbacConfig, null).includes("drop function if exists property.rbac_system_role(text);"));
});
