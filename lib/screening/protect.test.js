import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  FINGERPRINT_KINDS,
  fingerprint,
  fingerprintRows,
  last4Of,
  logScreeningAccess,
  normalizeDobName,
  normalizeEmail,
  normalizePhone,
  normalizeSsn,
  openValue,
  sealValue,
  storeFingerprints,
} from "./protect";
import {
  IDENTITY_KEYS,
  PARTY_KEYS,
  REPORT_KEYS,
  SENSITIVE_KEYS,
  cleanDetailPatch,
  detailView,
  mergeDetail,
  redactChanges,
  redactSensitive,
} from "./sensitive";
import { screeningFileRef } from "./storage";
import { evaluateConditions } from "@/lib/automations/catalog";
import { MERGE_FIELD_GROUPS } from "@/lib/messaging/merge_fields";
import { MERGE_FIELDS } from "@/lib/leasing/merge";
import { sheetCsv } from "@/lib/export/list_export";
import { STAFF_ROUTES } from "@/lib/auth/route_permissions";

// RISK-02: keyed fingerprints, the access log, field sealing, the protected-detail model, the deny-list and the migration's shape.

const P1 = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";
const P2 = "0e54b8dd-e3f4-4b70-93fb-8f15f47550f4";
const KEY = "k".repeat(64);
const APP = "11111111-2222-4333-8444-555555555555";

test("fingerprints: the same SSN gives different digests in two projects, and the same digest within one", () => {
  const a = fingerprint(P1, "ssn", "123-45-6789", KEY);
  const b = fingerprint(P2, "ssn", "123456789", KEY);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b, "digests never compare across projects");
  assert.equal(fingerprint(P1, "ssn", " 123 45 6789 ", KEY), a, "formatting doesn't change the digest");
  assert.notEqual(fingerprint(P1, "ssn", "123456789", "another key"), a, "the digest is keyed");
  assert.equal(fingerprint(P1, "ssn", "12345", KEY), null, "a partial SSN isn't fingerprinted");
  assert.throws(() => fingerprint(P1, "ssn", "123456789", ""), /SCREENING_FINGERPRINT_KEY/);
  assert.throws(() => fingerprint("not-a-project", "ssn", "123456789", KEY), /project/);
  assert.throws(() => fingerprint(P1, "passport", "X1", KEY), /Unknown/);
});

test("fingerprints: normalisers and the last 4 kept beside a digest", () => {
  assert.equal(normalizeSsn("123-45-6789"), "123456789");
  assert.equal(normalizeEmail(" Jordan.Blake+apps@Mail.Example "), "jordan.blake@mail.example");
  assert.equal(normalizeEmail("not an email"), "");
  assert.equal(normalizePhone("+1 (206) 555-0257"), "2065550257");
  assert.equal(normalizePhone("206-555-0257"), "2065550257");
  assert.equal(normalizeDobName({ dob: "1990-07-02", name: "  Daniel  Okafor-Smith " }), "1990-07-02|daniel okafor smith");
  assert.equal(normalizeDobName({ dob: "July 2", name: "Daniel" }), "");
  assert.equal(fingerprint(P1, "email", "a+x@b.co", KEY), fingerprint(P1, "email", "A@B.CO", KEY));
  assert.equal(last4Of("ssn", "123-45-6789"), "6789");
  assert.equal(last4Of("bank_account", { routing: "021000021", account: "000123456789" }), "6789");
  assert.equal(last4Of("email", "a@b.co"), null);
  const rows = fingerprintRows(P1, { ssn: "123456789", email: "a@b.co", phone: "", nope: "x" }, KEY);
  assert.deepEqual(rows.map((r) => [r.kind, r.last4]), [["ssn", "6789"], ["email", null]]);
  assert.deepEqual([...FINGERPRINT_KINDS].sort(), ["bank_account", "dob_name", "document_sha256", "email", "id_document", "ip", "phone", "ssn"]);
});

// A fake service-role client recording inserts / updates per table.
function fakeAdmin(existing = []) {
  const calls = [];
  const from = (table) => {
    const q = { table, filters: [] };
    const chain = {
      select: () => chain,
      eq: (c, v) => (q.filters.push([c, v]), chain),
      is: () => chain,
      in: (c, v) => (q.filters.push([c, v]), chain),
      insert: (rows) => (calls.push({ table, op: "insert", rows }), Promise.resolve({ error: null })),
      update: (values) => ({ in: (c, ids) => (calls.push({ table, op: "update", values, ids }), Promise.resolve({ error: null })) }),
      then: (resolve) => resolve({ data: existing, error: null }),
    };
    return chain;
  };
  return { from, calls };
}

test("fingerprints: storing adds new digests, replaces a changed email and skips without a key", async () => {
  const oldEmail = fingerprint(P1, "email", "old@x.co", KEY);
  const phone = fingerprint(P1, "phone", "2065550257", KEY);
  const admin = fakeAdmin([{ id: "f1", kind: "email", digest: oldEmail }, { id: "f2", kind: "phone", digest: phone }]);
  const res = await storeFingerprints(admin, { projectId: P1, applicationId: APP, values: { email: "new@x.co", phone: "(206) 555-0257" } }, KEY);
  assert.deepEqual(res, { ok: true, added: 1 });
  assert.deepEqual(admin.calls.find((c) => c.op === "update").ids, ["f1"], "the old email digest is soft-deleted");
  const inserted = admin.calls.find((c) => c.op === "insert").rows;
  assert.deepEqual(inserted.map((r) => [r.kind, r.party_ref, r.project_id]), [["email", "primary", P1]]);
  assert.ok(!JSON.stringify(admin.calls).includes("new@x.co"), "the value itself is never written");
  const none = fakeAdmin();
  assert.deepEqual(await storeFingerprints(none, { projectId: P1, applicationId: APP, values: { email: "a@b.co" } }, ""), { ok: false, skipped: true, added: 0 });
  assert.equal(none.calls.length, 0);
});

test("access log: one row per access with the actor, object and origin; unknown objects or actions throw", async () => {
  const admin = fakeAdmin();
  const request = { headers: new Map([["x-forwarded-for", "203.0.113.7, 10.0.0.1"], ["user-agent", "Test/1.0"]]) };
  await logScreeningAccess(admin, { projectId: P1, actor: { id: APP, name: "Alex" }, applicationId: APP, objectType: "document", objectId: "doc-1", action: "download", request });
  const row = admin.calls[0].rows;
  assert.equal(admin.calls[0].table, "screening_access_log");
  assert.deepEqual([row.actor_id, row.actor_name, row.object_type, row.action, row.ip, row.user_agent], [APP, "Alex", "document", "download", "203.0.113.7", "Test/1.0"]);
  await assert.rejects(logScreeningAccess(admin, { projectId: P1, objectType: "ssn", action: "view" }), /Unknown screening object/);
  await assert.rejects(logScreeningAccess(admin, { projectId: P1, objectType: "report", action: "edit" }), /Unknown screening action/);
  const failing = { from: () => ({ insert: () => Promise.resolve({ error: { message: "denied" } }) }) };
  await assert.rejects(logScreeningAccess(failing, { projectId: P1, objectType: "report", action: "view" }), /access log/);
});

test("sealing: AES-256-GCM round-trips, and a tampered or wrongly keyed value fails", () => {
  const key = "a".repeat(64);
  const sealed = sealValue("123-45-6789", key);
  assert.match(sealed, /^v1\./);
  assert.ok(!sealed.includes("6789"));
  assert.equal(openValue(sealed, key), "123-45-6789");
  assert.notEqual(sealValue("same", key), sealValue("same", key), "a fresh IV every time");
  const parts = sealed.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => openValue(parts.join("."), key));
  assert.throws(() => openValue(sealed, "b".repeat(64)));
  assert.throws(() => sealValue("x", "short"), /32 bytes/);
});

test("detail model: scopes, patch validation (never more than the last 4) and merging", () => {
  const rows = [
    { party_ref: "primary", detail: { dateOfBirth: "1990-01-02", idLast4: "6614", screeningReference: "MR-1", findings: { credit: "Thin" } } },
    { party_ref: "c1", detail: { dateOfBirth: "1991-03-04", screeningNotes: "Clear" } },
  ];
  assert.deepEqual(detailView(rows, "identity"), { primary: { dateOfBirth: "1990-01-02", idLast4: "6614" }, parties: { c1: { dateOfBirth: "1991-03-04" } } });
  assert.deepEqual(detailView(rows, "report"), { primary: { screeningReference: "MR-1", findings: { credit: "Thin" } }, parties: { c1: { screeningNotes: "Clear" } } });
  const checks = ["background", "credit"];
  assert.deepEqual(cleanDetailPatch({ idLast4: " 66 14 " }, { checks }).patch, { idLast4: "6614" });
  assert.match(cleanDetailPatch({ idLast4: "123456789" }, { checks }).error, /last 4/);
  assert.match(cleanDetailPatch({ dateOfBirth: "July" }, { checks }).error, /date of birth/);
  assert.match(cleanDetailPatch({ ssn: "123456789" }, { checks }).error, /can't be saved/);
  assert.match(cleanDetailPatch({ findings: { pets: "x" } }, { checks }).error, /isn't a screening check/);
  assert.match(cleanDetailPatch({ idType: "Library card" }, { checks }).error, /ID type/);
  assert.match(cleanDetailPatch({ idLast4: "1" }, { party: true, checks }).error, /can't be saved/, "a co-applicant keeps only DOB and notes");
  assert.deepEqual(cleanDetailPatch({ evictedBefore: 1, findings: { credit: " ok " } }, { checks }).patch, { evictedBefore: true, findings: { credit: "ok" } });
  assert.deepEqual(mergeDetail(rows[0].detail, { findings: { background: "Clear" } }).findings, { credit: "Thin", background: "Clear" });
  assert.deepEqual([...IDENTITY_KEYS, ...REPORT_KEYS].every((k) => SENSITIVE_KEYS.includes(k)) && PARTY_KEYS.every((k) => SENSITIVE_KEYS.includes(k)), true);
});

test("deny-list: rows, metadata, findings and activity changes lose sensitive values", () => {
  const row = {
    id: "t1",
    name: "Maya",
    creditScore: 720,
    ssnLast4: "1234",
    email: "m@x.co",
    metadata: { dateOfBirth: "1994-03-12", idLast4: "1111", employer: "Pike Place" },
    screening: { credit: { status: "Complete", notes: "Late payments" } },
  };
  const safe = redactSensitive(row);
  assert.deepEqual(Object.keys(safe).sort(), ["email", "id", "metadata", "name", "screening"]);
  assert.deepEqual(safe.metadata, { employer: "Pike Place" });
  assert.deepEqual(safe.screening, { credit: { status: "Complete" } });
  assert.equal(row.creditScore, 720, "the input is untouched");
  assert.deepEqual(redactChanges({ idLast4: ["1", "2"], phone: ["a", "b"] }), { idLast4: ["(protected)", "(protected)"], phone: ["a", "b"] });
});

test("deny-list: exports, automation conditions and merge fields never carry screening data", () => {
  const csv = sheetCsv({ columns: [{ header: "Name", key: "name" }, { header: "DOB", value: (r) => r.metadata?.dateOfBirth || r.dateOfBirth }, { header: "Score", key: "creditScore" }], rows: [{ name: "Maya", dateOfBirth: "1994-03-12", creditScore: 720, metadata: { dateOfBirth: "1994-03-12" } }] });
  assert.ok(!csv.includes("1994") && !csv.includes("720"), csv);
  assert.equal(evaluateConditions([{ field: "creditScore", op: "gte", value: "700" }], { creditScore: 720 }), false, "a rule on a sensitive key never matches");
  assert.equal(evaluateConditions([{ field: "ssnLast4", op: "is_empty" }], { metadata: { ssnLast4: "1234" } }), true);
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const tokens = [...MERGE_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.token)), ...MERGE_FIELDS.flatMap((f) => [f.key, f.legacy].filter(Boolean))];
  for (const t of tokens) for (const k of SENSITIVE_KEYS) assert.ok(!norm(t).includes(norm(k)), `merge field ${t} carries ${k}`);
});

test("files: only an application file inside the project can be signed", () => {
  const ok = `${P1}/application/${APP}/2026-11-08-abc.pdf`;
  assert.deepEqual(screeningFileRef(P1, "property-screening", ok), { bucket: "property-screening", path: ok, applicationId: APP });
  assert.ok(screeningFileRef(P1, "property-files", ok), "older application files in property-files");
  assert.equal(screeningFileRef(P2, "property-screening", ok), null, "another project");
  assert.equal(screeningFileRef(P1, "property-public", ok), null, "a public bucket");
  assert.equal(screeningFileRef(P1, "property-screening", `${P1}/lease/${APP}/a.pdf`), null, "not an application file");
  assert.equal(screeningFileRef(P1, "property-screening", `${P1}/application/../${APP}/a.pdf`), null, "traversal");
  assert.equal(screeningFileRef(P1, "property-screening", `${P1}/application/${APP}`), null, "no object name");
});

test("routes: the screening file and detail routes are declared with the screening keys", () => {
  assert.equal(STAFF_ROUTES["GET screening/files"], "property.screening.view_reports");
  assert.deepEqual(STAFF_ROUTES["POST screening/files"], { anyOf: ["property.screening.order", "property.screening.view_reports"] });
  assert.equal(STAFF_ROUTES["GET screening/applications/[applicationId]/detail"], "property.screening.view_reports");
  assert.equal(STAFF_ROUTES["PATCH screening/applications/[applicationId]/detail"], "property.screening.view_reports");
});

// --- The migration (static) -------------------------------------------------------------------------------------------------

const DIR = path.resolve("supabase/migrations");
const files = () => readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const clean = (s) => s.replace(/--[^\n]*/g, "").replace(/"/g, "").replace(/\s+/g, " ").toLowerCase();
const upOf = (f) => {
  const sql = readFileSync(path.join(DIR, f), "utf8");
  return clean(sql.includes("-- @up") ? sql.split("-- @up")[1].split("-- @down")[0] : sql);
};
const MIGRATION = files().find((f) => f.endsWith("_screening_data_protection.sql"));

test("migration: the trigger moves exactly the keys the app treats as protected", () => {
  assert.ok(MIGRATION, "the screening_data_protection migration exists");
  const up = upOf(MIGRATION);
  const split = up.slice(up.indexOf("create or replace function property.split_screening_detail("));
  const arrays = [...split.slice(0, split.indexOf("$$;")).matchAll(/array\[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  assert.deepEqual(arrays.slice(0, 2), [PARTY_KEYS.map((k) => k.toLowerCase()), [...IDENTITY_KEYS, ...REPORT_KEYS].map((k) => k.toLowerCase())]);
  assert.match(up, /create or replace trigger applications_screening_store before insert or update of metadata on property\.applications/);
  assert.match(up, /create or replace trigger record_items_screening_store before insert or update of metadata[^;]*when \(new\.owner_type = 'application' and new\.kind = 'co_applicant'\)/);
  const store = up.slice(up.indexOf("create or replace function property.store_screening_detail()"));
  const body = store.slice(0, store.indexOf("$$;"));
  assert.match(body, /security definer/);
  assert.match(body, /set search_path = ''/);
  assert.match(body, /property\.is_trusted_session\(\)/);
  assert.match(body, /property\.rbac_allows\('property\.screening\.view_reports', new\.project_id\)/);
  // The store trigger runs after RISK-03's gate (alphabetical within BEFORE triggers), so the gate still sees screening changes.
  assert.ok("applications_screening_gate" < "applications_screening_store");
});

test("migration: the screening tables are server-only, the access log append-only, the bucket private with no policy", () => {
  const up = upOf(MIGRATION);
  for (const t of ["screening_details", "applicant_fingerprints", "screening_access_log"]) {
    assert.ok(up.includes(`create table if not exists property.${t} (`), t);
    assert.ok(up.includes(`select property.apply_member_rls('${t}', 'property.screening.view_reports', null, false)`), `${t} member RLS`);
  }
  assert.match(up, /revoke all on property\.%i from anon, authenticated/);
  assert.match(up, /as restrictive for all to authenticated using \(false\) with check \(false\)/);
  assert.match(up, /revoke update, delete, truncate on property\.screening_access_log from service_role/);
  assert.match(up, /before update or delete on property\.screening_access_log/);
  assert.match(up, /values \('property-screening', 'property-screening', false/);
  assert.match(up, /as restrictive for select to authenticated using \(bucket_id <> 'property-files' or \(storage\.foldername\(name\)\)\[2\] is distinct from 'application' or [^;]*permitted_project_ids\('property\.screening\.view_reports'\)/);
  // No migration ever gives property-screening a client policy or makes it public.
  for (const f of files().filter((x) => x >= MIGRATION)) {
    for (const stmt of upOf(f).split(";")) {
      if (/create policy [^;]* on storage\.objects/.test(stmt)) assert.ok(!stmt.includes("'property-screening'"), `${f}: a storage policy names property-screening`);
      if (stmt.includes("'property-screening'")) assert.ok(!/\bpublic\s*=\s*true\b/.test(stmt), `${f}: makes property-screening public`);
    }
  }
});

test("no full identifiers: no column or field stores more than the last 4 of an SSN", () => {
  for (const f of files()) {
    assert.ok(!/\bssn\b\s+(text|varchar|char|bigint|numeric)/.test(upOf(f)), `${f}: an ssn column`);
    assert.ok(!/\b(ssn|social_security|tax_id|itin)_?(number|full)?\s+(text|varchar)/.test(upOf(f)), `${f}: a full taxpayer id column`);
  }
  const fields = (dir) =>
    readdirSync(path.resolve(dir), { recursive: true })
      .map((f) => path.join(dir, String(f)))
      .filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith(".test.js"));
  for (const f of [...fields("components"), ...fields("lib")]) {
    const src = readFileSync(path.resolve(f), "utf8");
    const ids = /key: "((?:ssn|socialSecurity|taxId|itin)[A-Za-z0-9]*|[a-z][A-Za-z0-9]*(?:Ssn|SocialSecurity|TaxId|Itin)[A-Za-z0-9]*)"/g;
    for (const m of src.matchAll(ids)) assert.match(m[1], /Last4$/, `${f}: field ${m[1]} keeps more than the last 4`);
  }
});
