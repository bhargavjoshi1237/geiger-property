import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// PLAT-01d: every property table is project-member RLS; later migrations never reopen one and every new table calls apply_member_rls.

const DIR = path.resolve("supabase/migrations");
const migrations = () =>
  readdirSync(DIR, { recursive: true })
    .filter((f) => String(f).endsWith(".sql"))
    .map((f) => ({ name: path.basename(String(f)), sql: readFileSync(path.join(DIR, String(f)), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));

// A migration's @up / @down without comments or identifier quotes, lower-cased, whitespace collapsed.
const clean = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "").replace(/"/g, "").toLowerCase().replace(/\s+/g, " ");
const upOf = (sql) => clean(sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql);
const downOf = (sql) => clean(sql.includes("-- @down") ? sql.split("-- @down")[1] : "");
const version = (m) => m.name.slice(0, 14);

const isolationOf = (list) => list.find((m) => /_rls_project_isolation\.sql$/.test(m.name));

const CREATED = /\bcreate table (?:if not exists )?property\.([a-z0-9_]+)\b/g;
const OPEN_POLICY = /\bcreate policy [^;]*?\bon property\.[a-z0-9_]+[^;]*?\b(?:using|with check) ?\( ?true ?\)/;
const ANON_GRANT = /\bgrant ([a-z, ]+?) on (?:table )?property\.([a-z0-9_]+)[^;]*?\bto [^;]*\banon\b/g;
const ANON_SCHEMA_GRANT = /\bgrant [^;]*\bon all (?:tables|sequences) in schema property\b[^;]*\bto [^;]*\banon\b/;
const ANON_DEFAULT_GRANT = /\balter default privileges\b[^;]*\bin schema property\b[^;]*\bgrant\b[^;]*\bon (?:tables|sequences)\b[^;]*\bto [^;]*\banon\b/;

// Problems in migrations from 01d on: open policies, anon table grants (bar legal_* select) and anon default grants.
function reopenIssues(list) {
  const iso = isolationOf(list);
  if (!iso) return ["no rls_project_isolation migration"];
  const issues = [];
  for (const m of list.filter((x) => version(x) >= version(iso))) {
    const up = upOf(m.sql);
    for (const stmt of up.split(";")) {
      if (OPEN_POLICY.test(stmt)) issues.push(`${m.name}: creates an open (true) policy on a property table`);
      if (ANON_SCHEMA_GRANT.test(stmt)) issues.push(`${m.name}: grants every property table or sequence to anon`);
      if (ANON_DEFAULT_GRANT.test(stmt)) issues.push(`${m.name}: alters default privileges to grant property tables to anon`);
      for (const g of stmt.matchAll(ANON_GRANT)) {
        const legalRead = /^legal_/.test(g[2]) && g[1].trim() === "select";
        if (!legalRead) issues.push(`${m.name}: grants ${g[1].trim()} on property.${g[2]} to anon`);
      }
    }
  }
  return issues;
}

// Tables a migration creates that nothing classifies: not named in the 01d migration and no later apply_member_rls('<t>').
function uncovered(list) {
  const iso = isolationOf(list);
  if (!iso) return ["no rls_project_isolation migration"];
  const named = upOf(iso.sql);
  const out = [];
  const seen = new Set();
  for (const m of list) {
    for (const [, t] of upOf(m.sql).matchAll(CREATED)) {
      if (seen.has(t) || t === "rls_tightening_backup") continue;
      seen.add(t);
      if (version(m) <= version(iso) && named.includes(`'${t}'`)) continue;
      const applied = list.some((x) => version(x) >= version(m) && upOf(x.sql).includes(`property.apply_member_rls('${t}'`));
      if (!applied) out.push(`property.${t} (${m.name}) has no member RLS: call property.apply_member_rls('${t}', …) in a migration`);
    }
  }
  return out;
}

test("isolation: the rls_project_isolation migration exists, snapshots policies and grants, and @down restores them", () => {
  const iso = isolationOf(migrations());
  assert.ok(iso, "supabase/migrations/*_rls_project_isolation.sql exists");
  const up = upOf(iso.sql);
  const down = downOf(iso.sql);
  assert.match(up, /create table if not exists property\.rls_tightening_backup\b/);
  assert.match(up, /insert into property\.rls_tightening_backup\b[^;]*'policies'[^;]*'grants'/);
  assert.match(down, /from property\.rls_tightening_backup\b/);
  assert.match(down, /create policy %i on %i\.%i as %s for %s to %s/, "@down re-creates every saved policy");
  assert.match(down, /drop table if exists property\.rls_tightening_backup\b/);
});

test("isolation: apply_member_rls is a locked-down security definer helper that drops the demo policy", () => {
  const up = upOf(isolationOf(migrations()).sql);
  const at = up.indexOf("create or replace function property.apply_member_rls(");
  assert.ok(at >= 0, "property.apply_member_rls is defined");
  const body = up.slice(at, up.indexOf("$$;", up.indexOf("$$", at) + 2));
  assert.match(body, /security definer/);
  assert.match(body, /set search_path = ''/);
  assert.match(body, /_demo_all/);
  assert.match(body, /_member_select/);
  assert.match(body, /property\.member_project_ids\(\)/);
  assert.match(up, /revoke all on function property\.apply_member_rls\([^)]*\) from public, anon, authenticated, service_role/);
});

test("isolation: no migration from 01d on opens a property table to everyone or to anon", () => {
  assert.deepEqual(reopenIssues(migrations()), []);
});

test("isolation: every property table a migration creates is covered by member RLS", () => {
  assert.deepEqual(uncovered(migrations()), []);
});

test("isolation: the 01d migration closes anon, hard deletes and the ledger write paths", () => {
  const up = upOf(isolationOf(migrations()).sql);
  assert.match(up, /revoke all on all tables in schema property from anon/);
  assert.match(up, /revoke all on all sequences in schema property from anon/);
  assert.match(up, /alter default privileges for role postgres in schema property revoke all on tables from anon/);
  assert.match(up, /grant select on property\.legal_jurisdictions, property\.legal_resources to anon/);
  assert.match(up, /revoke update on property\.ledger_entries from authenticated/);
  assert.match(up, /grant update \(cleared, cleared_on, reconciliation_id\) on property\.ledger_lines to authenticated/);
  for (const t of ["amenity_links", "floor_plan_links", "chat_members"]) assert.ok(up.includes(`${t}_member_delete`), `${t} keeps a member-scoped delete`);
});

const iso = (sql) => ({ name: "20261108120000_rls_project_isolation.sql", sql: `-- @up\n${sql}\n-- @down\n` });
const later = (sql) => ({ name: "20991231000000_later.sql", sql: `-- @up\n${sql}\n-- @down\n` });
const early = (sql) => ({ name: "20261001000000_early.sql", sql: `-- @up\n${sql}\n-- @down\n` });

test("isolation: the scan catches a later demo-open policy, anon grants and an uncovered table", () => {
  const base = iso("select 1 where 'tenants' is not null;");
  assert.equal(reopenIssues([base, later("create policy x_demo_all on property.x for all to anon, authenticated using (true) with check (true);")]).length, 1);
  assert.equal(reopenIssues([base, later("grant select, insert on property.tenants to anon, authenticated;")]).length, 1);
  assert.equal(reopenIssues([base, later("grant all on all tables in schema property to anon;")]).length, 1);
  assert.equal(reopenIssues([base, later("alter default privileges for role postgres in schema property grant select on tables to anon;")]).length, 1);
  assert.deepEqual(reopenIssues([base, later("grant select on property.legal_resources to anon;")]), []);
  assert.deepEqual(reopenIssues([base, later("create policy t_member_select on property.t for select to authenticated using (project_id in (select property.member_project_ids()));")]), []);
  assert.deepEqual(reopenIssues([early("create policy x_demo_all on property.x for all to anon using (true);"), base]), []);

  assert.equal(uncovered([base, later("create table if not exists property.widgets (id uuid);")]).length, 1);
  assert.deepEqual(uncovered([base, later("create table if not exists property.widgets (id uuid);\nselect property.apply_member_rls('widgets');")]), []);
  assert.deepEqual(uncovered([early("create table property.tenants (id uuid);"), base]), []);
  assert.equal(uncovered([early("create table property.gadgets (id uuid);"), base]).length, 1);
  assert.deepEqual(uncovered([early("create table property.gadgets (id uuid);"), base, later("select property.apply_member_rls('gadgets', 'property.accounting.view');")]), []);
});
