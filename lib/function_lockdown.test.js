import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// PLAT-01c: property functions stay closed. Postgres gives PUBLIC execute on every new function and a per-schema
// default can't remove it, so each later migration must revoke its own functions and never re-grant anon or PUBLIC.

const LOCKDOWN = "20261108041534";
const GATED = {
  ledger_post: "property.accounting.post",
  ledger_void: "property.accounting.void",
  ledger_ensure_default_chart: "property.accounting.post",
};

const DIR = path.resolve("supabase/migrations");
const migrations = () =>
  readdirSync(DIR, { recursive: true })
    .filter((f) => String(f).endsWith(".sql"))
    .map((f) => ({ name: path.basename(String(f)), sql: readFileSync(path.join(DIR, String(f)), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));

// The @up body without line comments, lower-cased.
const upOf = (sql) => {
  const body = sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql;
  return body.replace(/--[^\n]*/g, "").toLowerCase();
};
const statements = (up) => up.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const created = (up) => [...up.matchAll(/create\s+(?:or\s+replace\s+)?function\s+property\.([a-z0-9_]+)\s*\(/g)].map((m) => m[1]);

// Problems in migrations from the lockdown on: anon/PUBLIC grants, emit_record_event opened up, functions left on PUBLIC.
function lockdownIssues(list, from = LOCKDOWN) {
  const issues = [];
  for (const m of list.filter((x) => x.name.slice(0, 14) >= from)) {
    const up = upOf(m.sql);
    const stmts = statements(up);
    for (const s of stmts) {
      // Statements inside do-blocks start with if/begin, so grants are matched anywhere in the statement.
      const g = s.match(/\bgrant\s.*?\bon (?:function|all functions in schema) (property\b.*?)\bto\b(.*)$/);
      if (!g) continue;
      if (/\b(anon|public)\b/.test(g[2])) issues.push(`${m.name}: grants a property function to anon/PUBLIC`);
      if (g[1].includes("property.emit_record_event") && /\bauthenticated\b/.test(g[2])) issues.push(`${m.name}: grants emit_record_event to authenticated`);
    }
    const revokesAll = stmts.some((s) => /\brevoke execute on all functions in schema property from .*\bpublic\b/.test(s));
    for (const fn of created(up)) {
      const revoked = stmts.some((s) => /\brevoke\b/.test(s) && s.includes(`property.${fn}(`) && /\bfrom\b.*\bpublic\b/.test(s));
      if (!revoked && !revokesAll) issues.push(`${m.name}: property.${fn} keeps PUBLIC execute (add revoke … from public, anon)`);
    }
  }
  return issues;
}

// The newest definition of a property function across all migrations.
function latestDefinition(list, fn) {
  let found = null;
  for (const m of list) {
    const up = upOf(m.sql);
    const at = up.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+property\\.${fn}\\s*\\(`));
    if (at >= 0) found = { name: m.name, body: up.slice(at, up.indexOf("$$;", up.indexOf("$$", at) + 2) + 3) };
  }
  return found;
}

test("lockdown: no later migration reopens a property function or leaves one on PUBLIC", () => {
  assert.deepEqual(lockdownIssues(migrations()), []);
});

test("lockdown: the gated ledger RPCs stay security definer with their permission check", () => {
  for (const [fn, key] of Object.entries(GATED)) {
    const def = latestDefinition(migrations(), fn);
    assert.ok(def, `${fn} is defined`);
    assert.ok(def.name.slice(0, 14) >= LOCKDOWN, `${fn}: newest definition ${def.name} predates the lockdown`);
    assert.match(def.body, /security definer/, `${def.name}: ${fn} must stay security definer`);
    assert.match(def.body, /set search_path = ''/, `${def.name}: ${fn} must set search_path = ''`);
    assert.ok(def.body.includes("property.is_trusted_session()"), `${def.name}: ${fn} must check property.is_trusted_session()`);
    assert.ok(def.body.includes(`property.rbac_allows('${key}'`), `${def.name}: ${fn} must check ${key}`);
  }
});

test("lockdown: merge_meta keeps refusing ledger, grants, audit and secrets tables", () => {
  const def = latestDefinition(migrations(), "merge_meta");
  assert.match(def.body, /security invoker/);
  for (const t of ["'^ledger_'", "'role_grants'", "'audit_log'", "'integration_secrets'"]) assert.ok(def.body.includes(t), `${def.name}: ${t}`);
});

test("lockdown: the scan catches a redefinition that re-grants anon or skips its revoke", () => {
  const later = (sql) => [{ name: "20991231000000_later.sql", sql: `-- @up\n${sql}\n-- @down\n` }];
  const fn = "create or replace function property.ledger_ensure_default_chart(p uuid) returns int language sql as $$ select 1 $$;";
  assert.equal(lockdownIssues(later(`${fn}\ngrant execute on function property.ledger_ensure_default_chart(uuid) to anon, authenticated, service_role;`)).length, 2);
  assert.deepEqual(lockdownIssues(later(`${fn}\nrevoke all on function property.ledger_ensure_default_chart(uuid) from public, anon;`)), []);
  assert.equal(lockdownIssues(later("grant execute on function property.emit_record_event(uuid, text, text, uuid, jsonb) to authenticated;")).length, 1);
  assert.deepEqual(lockdownIssues(later("grant execute on function property.ledger_post(jsonb, jsonb) to authenticated, service_role;")), []);
});
