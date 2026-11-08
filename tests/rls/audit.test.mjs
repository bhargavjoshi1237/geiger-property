// PLAT-01h SQL audits against the database (read-only): what the Supabase Security Advisor checks for schema property,
// plus the PLAT-01b null-row audit and the server's copy of the permission catalog. CI runs it as `npm run test:audit`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { permissionKeys } from "@geiger/rbac";

import rbacConfig from "../../geiger-rbac.config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* env already set */
}

const CLOSED = ["integration_secrets", "operator_events"];
let c;
const rows = async (sql, params) => (await c.query(sql, params)).rows;

before(async () => {
  c = new pg.Client({ connectionString: process.env.STRING_URI, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("begin read only");
  await c.query("set local statement_timeout = '60s'");
});

after(async () => {
  await c?.query("rollback").catch(() => {});
  await c?.end();
});

test("audit: no permissive (true) policy in property", async () => {
  const open = await rows(`select tablename, policyname from pg_policies
     where schemaname = 'property' and (qual = 'true' or with_check = 'true')`);
  assert.deepEqual(open, [], "only member-scoped policies; the legal_* globals are `project_id is null and deleted_at is null`, not true");
});

test("audit: no anon or PUBLIC execute on any property routine", async () => {
  const grants = await rows(`select routine_name, grantee from information_schema.routine_privileges
     where routine_schema = 'property' and grantee in ('anon', 'PUBLIC')`);
  assert.deepEqual(grants, []);
});

test("audit: every property table has RLS on, and anon holds nothing but select on the legal_* tables", async () => {
  const off = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`);
  assert.deepEqual(off.map((r) => r.relname), []);
  const anon = await rows(`select distinct c.relname, a.privilege_type
      from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
     where n.nspname = 'property' and a.grantee = 'anon'::regrole
       and not (c.relname in ('legal_jurisdictions', 'legal_resources') and a.privilege_type = 'SELECT')`);
  assert.deepEqual(anon, []);
});

test("audit: no property function has a mutable search_path (Security Advisor function_search_path_mutable)", async () => {
  const mutable = await rows(`select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'property' and p.prokind in ('f', 'p')
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
     order by 1`);
  assert.deepEqual(mutable.map((r) => r.fn), []);
});

test("audit: every property view runs as the caller (Security Advisor security_definer_view)", async () => {
  const definer = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind = 'v'
       and not coalesce('security_invoker=true' = any (c.reloptions) or 'security_invoker=on' = any (c.reloptions), false)
     order by 1`);
  assert.deepEqual(definer.map((r) => r.relname), []);
});

test("audit: the secrets and operator stores are closed to every client role", async () => {
  for (const t of CLOSED) {
    const [{ exists }] = await rows("select to_regclass($1) is not null as exists", [`property.${t}`]);
    assert.ok(exists, `property.${t} exists`);
    const grants = await rows(`select distinct a.grantee::regrole::text as grantee, a.privilege_type
        from pg_class c, aclexplode(c.relacl) a
       where c.oid = $1::regclass and a.grantee in ('anon'::regrole, 'authenticated'::regrole)`, [`property.${t}`]);
    assert.deepEqual(grants, [], `no client privilege on property.${t}`);
    const policies = await rows("select policyname from pg_policies where schemaname = 'property' and tablename = $1", [t]);
    assert.deepEqual(policies, [], `no policy on property.${t}`);
  }
});

test("audit: no live row of a project table is missing its project (PLAT-01b project_scope_audit)", async () => {
  const missing = await rows("select table_name, live_null from property.project_scope_audit() where required and live_null > 0 order by 1");
  assert.deepEqual(missing, []);
});

// Keys the code has must be in the server's copy; extra live keys come from branches not merged yet and are only reported.
test("audit: the server's copy of the permission catalog holds every key and role grant in geiger-rbac.config.js", async (t) => {
  const [{ keys }] = await rows("select property.rbac_catalog_keys() as keys");
  const config = permissionKeys(rbacConfig);
  const regenerate = "regenerate after merging: npm run db:new -- rbac_system_roles, npm run rbac:sql -- <file>, db:push";
  assert.deepEqual(config.filter((k) => !keys.includes(k)), [], `the live copy lacks keys: ${regenerate}`);
  const extra = keys.filter((k) => !config.includes(k));
  if (extra.length) t.diagnostic(`live copy carries keys this branch doesn't know yet (an unmerged branch's push): ${extra.join(", ")}`);
  for (const def of rbacConfig.systemRoles) {
    const [live] = await rows("select permissions from property.rbac_system_role($1)", [def.key]);
    const held = live?.permissions || [];
    assert.deepEqual(def.permissions.filter((k) => !held.includes(k)), [], `system role ${def.key} lacks keys in the live copy: ${regenerate}`);
  }
});
