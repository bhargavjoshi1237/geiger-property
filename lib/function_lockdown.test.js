import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// PLAT-01c: Postgres gives PUBLIC execute on every new function, so each later migration revokes its own and never re-opens anon/PUBLIC.

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

// The @up body without comments or identifier quotes, lower-cased ("property"."Fn" reads as property.fn).
const upOf = (sql) => {
  const body = sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql;
  return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "").replace(/"/g, "").toLowerCase();
};
const statements = (up) => up.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const ROUTINE = "(?:function|routine|procedure)s?";
const CREATE = /\bcreate (?:or replace )?(?:function|procedure) property\.([a-z0-9_]+) ?\(/;
const GRANT = new RegExp(`\\bgrant\\b.*?\\bon (?:${ROUTINE} |all (?:functions|routines|procedures) in schema )(.*?)\\bto\\b(.*)$`);
const DEFAULT_GRANT = /\balter default privileges\b.*\bgrant\b.*\bon (?:functions|routines)\b/;
// A dynamic grant is only allowed when its text names a non-routine object (tables, sequences, the schema).
const DYNAMIC_GRANT = /\bexecute\b ?(?:format ?\( ?)?'([^']*\bgrant\b[^']*)'/;
const NON_ROUTINE = /\bon (?:table\b|all (?:tables|sequences)\b|sequence\b|schema\b|property\.%i\b)/;
const fromBoth = (s) => /\bfrom\b.*\bpublic\b/.test(s) && /\bfrom\b.*\banon\b/.test(s);

// Problems in migrations from the lockdown on: anon/PUBLIC grants (static, default or dynamic), emit_record_event
// opened up, and functions not revoked from both public and anon after they are created.
function lockdownIssues(list, from = LOCKDOWN) {
  const issues = [];
  for (const m of list.filter((x) => x.name.slice(0, 14) >= from)) {
    const stmts = statements(upOf(m.sql));
    const flag = (msg) => issues.push(`${m.name}: ${msg}`);
    stmts.forEach((s) => {
      // Statements inside do-blocks start with if/begin, so everything is matched anywhere in the statement.
      const g = s.match(GRANT);
      if (g && /\bproperty\b/.test(g[1])) {
        if (/\b(anon|public)\b/.test(g[2])) flag("grants a property function to anon/PUBLIC");
        if (g[1].includes("property.emit_record_event") && /\bauthenticated\b/.test(g[2])) flag("grants emit_record_event to authenticated");
      }
      if (DEFAULT_GRANT.test(s) && (!/\bin schema\b/.test(s) || /\bin schema\b[^;]*\bproperty\b/.test(s))) {
        flag("alters default privileges to grant functions in schema property");
      }
      const d = s.match(DYNAMIC_GRANT);
      if (d && !NON_ROUTINE.test(d[1])) flag("grants through dynamic SQL (write function grants statically)");
    });
    stmts.forEach((s, i) => {
      const fn = s.match(CREATE)?.[1];
      if (!fn) return;
      const after = stmts.slice(i + 1);
      const own = after.some((r) => /\brevoke\b/.test(r) && new RegExp(`\\bproperty\\.${fn}\\b`).test(r) && fromBoth(r));
      const all = after.some((r) => /\brevoke (?:execute|all)\b.*\bon all (?:functions|routines) in schema property\b/.test(r) && fromBoth(r));
      if (!own && !all) flag(`property.${fn} keeps PUBLIC/anon execute (revoke … from public, anon after creating it)`);
    });
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

const later = (sql) => [{ name: "20991231000000_later.sql", sql: `-- @up\n${sql}\n-- @down\n` }];
const FN = "create or replace function property.ledger_ensure_default_chart(p uuid) returns int language sql as $$ select 1 $$;";
const REVOKED = `${FN}\nrevoke all on function property.ledger_ensure_default_chart(uuid) from public, anon;`;

test("lockdown: the scan catches a redefinition that re-grants anon or skips its revoke", () => {
  assert.equal(lockdownIssues(later(`${FN}\ngrant execute on function property.ledger_ensure_default_chart(uuid) to anon, authenticated, service_role;`)).length, 2);
  assert.deepEqual(lockdownIssues(later(REVOKED)), []);
  assert.equal(lockdownIssues(later("grant execute on function property.emit_record_event(uuid, text, text, uuid, jsonb) to authenticated;")).length, 1);
  assert.deepEqual(lockdownIssues(later("grant execute on function property.ledger_post(jsonb, jsonb) to authenticated, service_role;")), []);
});

test("lockdown: default-privilege grants on property functions are caught", () => {
  assert.equal(lockdownIssues(later(`${REVOKED}\nalter default privileges in schema property grant execute on functions to anon;`)).length, 1);
  assert.equal(lockdownIssues(later(`${REVOKED}\nalter default privileges for role postgres grant execute on routines to authenticated;`)).length, 1);
  assert.deepEqual(lockdownIssues(later(`${REVOKED}\nalter default privileges in schema property revoke execute on functions from public;`)), []);
  assert.deepEqual(lockdownIssues(later(`${REVOKED}\nalter default privileges in schema property grant select on tables to authenticated;`)), []);
});

test("lockdown: a function must be revoked from both public and anon, after it is created", () => {
  assert.equal(lockdownIssues(later(`${FN}\nrevoke all on function property.ledger_ensure_default_chart(uuid) from public;`)).length, 1);
  assert.equal(lockdownIssues(later(`revoke execute on all functions in schema property from public, anon;\n${FN}`)).length, 1);
  assert.equal(lockdownIssues(later(`revoke all on function property.ledger_ensure_default_chart(uuid) from public, anon;\n${FN}`)).length, 1);
  assert.deepEqual(lockdownIssues(later(`${FN}\nrevoke execute on all functions in schema property from public, anon;`)), []);
  const quoted = 'create function "property"."Fn_X"() returns int language sql as $$ select 1 $$;\nrevoke all on function "property"."Fn_X"() from public;';
  assert.equal(lockdownIssues(later(quoted)).length, 1);
});

test("lockdown: routine, procedure and schema-wide grants to anon/PUBLIC are caught, quoted or not", () => {
  assert.equal(lockdownIssues(later("grant execute on all routines in schema property to anon;")).length, 1);
  assert.equal(lockdownIssues(later("grant execute on all procedures in schema property to public;")).length, 1);
  assert.equal(lockdownIssues(later("grant execute on procedure property.p() to anon;")).length, 1);
  assert.equal(lockdownIssues(later('grant execute on routine "property"."ledger_post"(jsonb, jsonb) to "anon";')).length, 1);
  assert.deepEqual(lockdownIssues(later("grant execute on all routines in schema other to anon;")), []);
});

test("lockdown: dynamic grants of functions are caught, dynamic table grants are not", () => {
  const dyn = (lit) => later(`do $$ declare f text := 'property.x()'; begin execute format('${lit}', f); end $$;`);
  assert.equal(lockdownIssues(dyn("grant execute on function %s to anon")).length, 1);
  assert.equal(lockdownIssues(dyn("grant execute on function %s to authenticated")).length, 1);
  assert.equal(lockdownIssues(later("do $$ begin execute 'grant execute on all functions in schema property to authenticated'; end $$;")).length, 1);
  assert.deepEqual(lockdownIssues(dyn("grant select on property.%I to authenticated")), []);
  assert.deepEqual(lockdownIssues(dyn("grant select, update on table property.%I to authenticated")), []);
});
