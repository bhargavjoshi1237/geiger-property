import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// PLAT-01g: Property files live in property-files (private), property-public and property-chat (private); every storage policy on them
// is member-scoped by the first path segment, later migrations never reopen them, and no code writes to the suite-shared products bucket.

const DIR = path.resolve("supabase/migrations");
const migrations = () =>
  readdirSync(DIR, { recursive: true })
    .filter((f) => String(f).endsWith(".sql"))
    .map((f) => ({ name: path.basename(String(f)), sql: readFileSync(path.join(DIR, String(f)), "utf8") }))
    .sort((a, b) => a.name.localeCompare(b.name));

const clean = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "").replace(/"/g, "").toLowerCase().replace(/\s+/g, " ");
const upOf = (sql) => clean(sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql);
const version = (m) => m.name.slice(0, 14);
const bucketsOf = (list) => list.find((m) => /_property_storage_buckets\.sql$/.test(m.name));

const PROPERTY_BUCKET = /'property-(files|public|chat)'/;
const SCOPED = /property\.try_uuid\(\(storage\.foldername\(name\)\)\[1\]\) in \(select property\.(member_project_ids\(\)|permitted_project_ids\('property\.[a-z_.]+'\))\)/;
const POLICY = /\bcreate policy (.+?) on storage\.objects\b(.*)$/;

// Problems in migrations from 01g on: a property bucket policy that isn't member-scoped or reaches anon/public, a private bucket
// made public again, or any statement on the products bucket.
function storageIssues(list) {
  const first = bucketsOf(list);
  if (!first) return ["no property_storage_buckets migration"];
  const issues = [];
  for (const m of list.filter((x) => version(x) >= version(first))) {
    for (const stmt of upOf(m.sql).split(";")) {
      const p = stmt.match(POLICY);
      if (p && PROPERTY_BUCKET.test(p[2])) {
        if (!/\bto authenticated\b/.test(p[2]) || /\bto (public|anon)\b/.test(p[2])) issues.push(`${m.name}: ${p[1]} reaches beyond signed-in members`);
        if (!SCOPED.test(p[2])) issues.push(`${m.name}: ${p[1]} is not scoped to the path's project`);
      }
      if (/'property-(files|chat)'/.test(stmt) && /\bpublic\s*=\s*true\b|values \('property-(files|chat)', 'property-(files|chat)', true/.test(stmt)) {
        issues.push(`${m.name}: makes a private Property bucket public`);
      }
      if (/'products'/.test(stmt)) issues.push(`${m.name}: touches the suite-shared products bucket`);
    }
  }
  return issues;
}

test("storage: the 01g buckets are private / public-read as designed and every policy is member-scoped", () => {
  const up = upOf(bucketsOf(migrations()).sql);
  assert.match(up, /values \('property-files', 'property-files', false/);
  assert.match(up, /values \('property-public', 'property-public', true/);
  assert.match(up, /values \('property-chat', 'property-chat', false\) on conflict \(id\) do update set public = false/);
  for (const old of ["property chat read", "property chat upload", "property chat update", "property chat delete"]) {
    assert.ok(up.includes(`drop policy if exists ${old} on storage.objects`), `the public chat policy "${old}" is dropped`);
  }
  assert.ok(up.includes("permitted_project_ids('property.record.delete')"), "replacing or deleting a file needs record.delete");
  assert.ok(up.includes("property.chat_file_readable(name)"), "chat binaries follow their conversation");
  assert.deepEqual(storageIssues(migrations()), []);
});

test("storage: a stored path must sit in the row's project", () => {
  const up = upOf(bucketsOf(migrations()).sql);
  assert.match(up, /split_part\(storage_path, ''\/'', 1\) = project_id::text/);
  for (const t of ["documents", "media", "maintenance_attachments", "tenant_documents", "chat_files"]) assert.ok(up.includes(`'${t}'`), t);
});

const later = (sql) => [bucketsOf(migrations()), { name: "20991231000000_later.sql", sql: `-- @up\n${sql}\n-- @down\n` }];

test("storage: the scan catches an open, unscoped or products policy and a reopened bucket", () => {
  assert.equal(storageIssues(later("create policy x on storage.objects for select to public using (bucket_id = 'property-files');")).length, 2);
  assert.equal(storageIssues(later("create policy x on storage.objects for select to authenticated using (bucket_id = 'property-chat');")).length, 1);
  assert.equal(storageIssues(later("update storage.buckets set public = true where id = 'property-files';")).length, 1);
  assert.equal(storageIssues(later("create policy y on storage.objects for insert to authenticated with check (bucket_id = 'products');")).length, 1);
  const scoped = "create policy z on storage.objects for select to authenticated using (bucket_id = 'property-files' and property.try_uuid((storage.foldername(name))[1]) in (select property.member_project_ids()));";
  assert.deepEqual(storageIssues(later(scoped)), []);
});

// Files that may still name the products bucket: the legacy URL parser and the unused events helper.
const PRODUCTS_ALLOWED = new Set(["lib/files/refs.js", "lib/supabase/storage.js"]);
const sources = (dir) =>
  readdirSync(path.resolve(dir), { recursive: true })
    .map((f) => path.join(dir, String(f)).replace(/\\/g, "/"))
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !f.endsWith(".test.js"));

test("storage: no app code writes to or reads from the suite-shared products bucket", () => {
  const offenders = ["lib", "app", "components", "context"]
    .flatMap(sources)
    .filter((f) => !PRODUCTS_ALLOWED.has(f))
    .filter((f) => /["'`]products["'`]/.test(readFileSync(path.resolve(f), "utf8")));
  assert.deepEqual(offenders, []);
});
