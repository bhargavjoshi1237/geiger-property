// RLS test harness (PLAT-01d): one pg transaction, rolled back at the end; personas are PostgREST's own
// `set local role` + request.jwt.claims, so the policies, grants and RPC checks are the ones the API applies.
// RLS_APPLY_UP=1 applies the rls_project_isolation @up inside the transaction first (dry run before a push); RLS_APPLY_UP=<name> applies *_<name>.sql.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* env already set */
}

// The demo project (Harbor & Pine) and a project in another org.
export const DEMO = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";
export const OTHER = "0e54b8dd-e3f4-4b70-93fb-8f15f47550f4";

// Real demo accounts; the three non-default roles are swapped onto members inside the transaction.
export const USERS = {
  owner: "39149c4b-526f-445b-8a8c-ea3898e9c50c",
  manager: "77bc4a76-4959-4a23-a5ae-eaccdf731bb3",
  accountant: "8edf3f51-bd5b-43e2-876e-38d37cd37774",
  tech: "956dfff3-ce70-41a8-9b81-5036e8840cc3",
  leasing: "ab127d9d-9980-4e4b-94ae-02295d8cd74a",
  otherOrg: "ee84b3c6-4ab3-428b-a770-8d0df7fb1cf4",
  outsider: "00000000-0000-4000-8000-0000000d1d0d",
  resident: "0a17a000-0000-4000-8000-000000000001",
  portalOwner: "0a17a000-0000-4000-8000-000000000016",
  vendor: "0a17a000-0000-4000-8000-000000000023",
};
const SWAPS = { accountant: "accountant", tech: "maintenance_tech", leasing: "leasing_agent" };

export const MIGRATION = (name = "rls_project_isolation") => {
  const dir = path.join(ROOT, "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith(`_${name}.sql`));
  return file ? readFileSync(path.join(dir, file), "utf8") : null;
};

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
  // The demo's system roles at their catalog definitions (keys added since the browser's last syncSystemRoles included).
  await c.query(
    `update public.roles r set permissions = (select d.permissions from property.rbac_system_role(r.key) d)
      where r.project_id = $1 and r.deleted_at is null and r.key in ('manager', 'accountant', 'leasing_agent', 'maintenance_tech')
        and exists (select 1 from property.rbac_system_role(r.key))`,
    [DEMO],
  );
  for (const [who, key] of Object.entries(SWAPS)) {
    const role = (await c.query("select property.rbac_seed_role($1, $2) as id", [DEMO, key])).rows[0].id;
    await c.query("update property.role_grants set role_id = $1 where user_id = $2 and project_id = $3 and deleted_at is null", [role, USERS[who], DEMO]);
  }

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
