// RLS test harness (PLAT-01d, fixtures PLAT-01h): one pg transaction, rolled back at the end; personas are PostgREST's own
// `set local role` + request.jwt.claims, so the policies, grants and RPC checks are the ones the API applies.
// Personas are fixture accounts created inside the transaction (auth.users, the demo org's membership, roles copied from
// geiger-rbac.config.js and their grants) plus a fixture org and project, so no real account or live role row is changed.
// RLS_APPLY_UP=1 applies the rls_project_isolation @up inside the transaction first (dry run before a push); RLS_APPLY_UP=<name> applies *_<name>.sql.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import rbacConfig from "../../geiger-rbac.config.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* env already set */
}

const fixture = (n) => `0f1c7000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// The demo project (Harbor & Pine), and a fixture project in a fixture org.
export const DEMO = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";
export const OTHER = fixture("a0a0");
const OTHER_ORG = fixture("b0b0");

// Fixture staff (members of the demo's org, each holding a role copied from the catalog), the other org's owner, an outsider,
// and the demo seed's portal accounts (portal_members.auth_user_id; they hold no org membership or grant).
export const USERS = {
  owner: fixture(1),
  manager: fixture(2),
  accountant: fixture(3),
  tech: fixture(4),
  leasing: fixture(5),
  viewer: fixture(6),
  otherOrg: fixture(7),
  outsider: "00000000-0000-4000-8000-0000000d1d0d",
  resident: "0a17a000-0000-4000-8000-000000000001",
  portalOwner: "0a17a000-0000-4000-8000-000000000016",
  vendor: "0a17a000-0000-4000-8000-000000000023",
};
// Persona → [catalog system role, org role]. The owner is an org "Owner" member, so it administers roles like a real org owner.
const STAFF = {
  owner: ["owner", "Owner"],
  manager: ["manager", "User"],
  accountant: ["accountant", "User"],
  tech: ["maintenance_tech", "User"],
  leasing: ["leasing_agent", "User"],
  viewer: ["viewer", "User"],
};

export const MIGRATION = (name = "rls_project_isolation") => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith(`_${name}.sql`));
  return file ? readFileSync(path.join(dir, file), "utf8") : null;
};

// Fixture accounts, memberships, roles and grants, inside the open transaction.
async function seedFixtures(c) {
  const q = (sql, params) => c.query(sql, params);
  const demoOrg = (await q("select organization_id from public.projects where id = $1", [DEMO])).rows[0]?.organization_id;
  if (!demoOrg) throw new Error("The demo project (or its organization) is missing in this database.");
  for (const who of [...Object.keys(STAFF), "otherOrg"]) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '{}', $3, now(), now(), now())`,
      [USERS[who], `rls-${who}@fixture.example`, { full_name: `RLS ${who}` }],
    );
  }
  for (const [who, [key, orgRole]] of Object.entries(STAFF)) {
    await q(`insert into public.organization_users (organization, "user", role) values ($1, $2, $3::"Role")`, [demoOrg, USERS[who], orgRole]);
    const def = rbacConfig.systemRoles.find((r) => r.key === key);
    const role = (
      await q(
        `insert into public.roles (project_id, key, name, description, color, permissions, is_system, sort, metadata)
         values ($1, $2, $3, '', 'slate', $4, false, 90, '{"fixture": true}') returning id`,
        [DEMO, `rls_fixture_${key}`, `RLS ${def.name}`, def.permissions],
      )
    ).rows[0].id;
    await q(`insert into property.role_grants (project_id, user_id, role_id, metadata) values ($1, $2, $3, '{"source": "fixture"}')`, [DEMO, USERS[who], role]);
  }
  await q("insert into public.organizations (id, name, owner, created_by) values ($1, 'RLS other org', $2, $2)", [OTHER_ORG, USERS.otherOrg]);
  await q("insert into public.projects (id, name, organization_id, created_by) values ($1, 'RLS other project', $2, $3)", [OTHER, OTHER_ORG, USERS.otherOrg]);
}

export async function openHarness() {
  const c = new pg.Client({ connectionString: process.env.STRING_URI, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("begin");
  if (process.env.RLS_APPLY_UP) {
    // The @up locks every property table: fail fast rather than queue behind (or block) live sessions.
    await c.query("set local lock_timeout = '10s'");
    const name = process.env.RLS_APPLY_UP === "1" ? "rls_project_isolation" : process.env.RLS_APPLY_UP;
    const sql = MIGRATION(name);
    if (!sql) throw new Error(`RLS_APPLY_UP: no ${name} migration`);
    await c.query(sql.split("-- @up")[1].split("-- @down")[0]);
  }
  await seedFixtures(c);

  const h = {
    c,
    // Switch to a persona for the following statements (postgres = the migration/owner session).
    async as(who) {
      await c.query("reset role");
      if (who === "postgres") return c.query("select set_config('request.jwt.claims', '', true)");
      const claims = who === "anon" ? { role: "anon" } : who === "service" ? { role: "service_role" } : { sub: USERS[who], role: "authenticated" };
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      await c.query(`set local role ${who === "anon" ? "anon" : who === "service" ? "service_role" : "authenticated"}`);
    },
    // One statement under a savepoint: { rows, count } or { code, message }; its effects are undone unless `keep`.
    async run(sql, params = [], keep = false) {
      await c.query("savepoint rls_t");
      try {
        const r = await c.query(sql, params);
        await c.query(keep ? "release savepoint rls_t" : "rollback to savepoint rls_t");
        return { rows: r.rows, count: r.rowCount };
      } catch (e) {
        await c.query("rollback to savepoint rls_t");
        return { code: e.code, message: e.message };
      }
    },
    // A statement as a persona, then back to postgres.
    async runAs(who, sql, params = [], keep = false) {
      await h.as(who);
      const r = await h.run(sql, params, keep);
      await h.as("postgres");
      return r;
    },
    // Rows a persona sees (null on a permission error).
    async seen(who, sql, params = []) {
      const r = await h.runAs(who, sql, params);
      return r.code ? null : Number(r.rows[0]?.n ?? r.rows.length);
    },
    // Row counts a persona sees per relation (null on a permission error), one round trip each; `where` is inlined SQL.
    async counts(who, names, where = "") {
      await h.as(who);
      const out = {};
      for (const n of names) {
        try {
          const res = await c.query(`savepoint rls_c; select count(*) as n from property.${n} ${where}; release savepoint rls_c`);
          out[n] = Number(res[1].rows[0].n);
        } catch (e) {
          await c.query("rollback to savepoint rls_c");
          out[n] = e.code === "42501" ? null : `error ${e.code}`;
        }
      }
      await h.as("postgres");
      return out;
    },
    async close() {
      try {
        await c.query("rollback");
      } finally {
        await c.end();
      }
    },
  };
  await h.as("postgres");
  // The other org's owner opens their project once (rbac_ensure_membership mints the grant membership needs).
  await h.runAs("otherOrg", "select property.rbac_ensure_membership($1)", [OTHER], true);
  return h;
}

// Every relation the API could expose in schema property.
export async function relations(h) {
  const { rows } = await h.c.query(`
    select c.relname as name, c.relkind as kind,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'project_id' and not a.attisdropped) as scoped
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'property' and c.relkind in ('r', 'p', 'v', 'm')
     order by 1`);
  return rows;
}
