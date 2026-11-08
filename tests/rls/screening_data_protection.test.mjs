// RISK-02 screening data protection against the live database, inside one rolled-back transaction (see harness.mjs).
// Proves the two leaks are closed: an application's identity detail, disclosures, report reference and findings are no longer
// in rows members read through PostgREST, and application files need screening.view_reports at the storage layer; and that
// the Owner (or a role ticked with view_reports) and the server still work.
// Run: npm run test:rls   (RLS_APPLY_UP=screening_data_protection dry-runs the migration first)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DEMO, OTHER, USERS, openHarness } from "./harness.mjs";

let h;
const APP = crypto.randomUUID();
const CO = crypto.randomUUID();
const F = {};
const STAFF = ["owner", "manager", "leasing", "tech", "accountant"];
const NO_REPORTS = ["manager", "leasing", "tech", "accountant"];
const OUTSIDE = ["anon", "outsider", "otherOrg", "resident", "portalOwner", "vendor"];
const PROTECTED = ["dateOfBirth", "idType", "idLast4", "evictedBefore", "felonyDisclosed", "disclosureNotes", "screeningReference"];
const TABLES = ["screening_details", "applicant_fingerprints", "screening_access_log"];
const refused = (r) => r.code === "42501";

const reads = async (who, bucket, name) => (await h.seen(who, "select count(*) as n from storage.objects where bucket_id = $1 and name = $2", [bucket, name])) ?? 0;
const detailOf = async (ref = "primary") =>
  (await h.c.query("select detail from property.screening_details where application_id = $1 and party_ref = $2 and deleted_at is null", [APP, ref])).rows[0]?.detail;
// Protected keys left in a metadata bag (findings included).
const leftIn = (m) => [...PROTECTED.filter((k) => k in (m || {})), ...Object.values(m?.screening || {}).filter((c) => c && "notes" in c).map(() => "notes")];

// Swap the accountant onto a custom role holding only applications.view and a ticked view_reports, for the statements in `fn`.
async function asReviewer(fn) {
  await h.c.query("savepoint reviewer");
  try {
    const role = (
      await h.c.query(
        `insert into public.roles (project_id, key, name, permissions, metadata)
         values ($1, 'risk02_reviewer', 'RISK-02 reviewer', array['property.applications.view', 'property.screening.view_reports'], '{}') returning id`,
        [DEMO],
      )
    ).rows[0].id;
    await h.c.query("update property.role_grants set role_id = $1 where user_id = $2 and project_id = $3 and deleted_at is null", [role, USERS.accountant, DEMO]);
    await fn();
  } finally {
    await h.c.query("rollback to savepoint reviewer");
  }
}

before(async () => {
  h = await openHarness();
  const q = (sql, params) => h.c.query(sql, params);
  // Written the way the app (and the demo seed) wrote it before RISK-02: the trigger moves the detail out.
  await q(
    `insert into property.applications (id, project_id, name, email, phone, status, metadata) values ($1, $2, 'RISK-02 applicant', 'r02@mail.example', '(206) 555-0102', 'Screening', $3)`,
    [
      APP,
      DEMO,
      JSON.stringify({
        dateOfBirth: "1990-07-02",
        idType: "Driver's license",
        idLast4: "6614",
        evictedBefore: true,
        disclosureNotes: "Eviction in 2019.",
        screeningReference: "R02-1",
        employer: "Harbor Logistics",
        screening: { credit: { status: "Complete", result: "Thin file", score: 640, notes: "Two accounts." }, income: { status: "Requested", notes: "" } },
      }),
    ],
  );
  await q(
    `insert into property.record_items (id, project_id, owner_type, owner_id, kind, name, status, metadata) values ($1, $2, 'application', $3, 'co_applicant', 'RISK-02 co-applicant', 'Requested', $4)`,
    [CO, DEMO, APP, JSON.stringify({ role: "tenant", email: "co@mail.example", dateOfBirth: "1992-01-05", screeningNotes: "Pending" })],
  );
  const object = async (bucket, name) => {
    await q("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);
    return name;
  };
  F.legacyAppFile = await object("property-files", `${DEMO}/application/${APP}/2026-11-08-id.pdf`);
  F.screeningFile = await object("property-screening", `${DEMO}/application/${APP}/2026-11-08-paystub.pdf`);
  F.leaseFile = await object("property-files", `${DEMO}/lease/${crypto.randomUUID()}/lease.pdf`);
  F.otherAppFile = await object("property-files", `${OTHER}/application/${crypto.randomUUID()}/theirs.pdf`);
});

after(async () => {
  await h?.close();
});

test("move: no application in any project keeps protected detail in metadata; screening_details holds it", async () => {
  const { rows } = await h.c.query(
    `select count(*)::int as n from property.applications
      where metadata ?| $1::text[]
         or exists (select 1 from jsonb_each(case when jsonb_typeof(metadata -> 'screening') = 'object' then metadata -> 'screening' else '{}' end) e
                     where jsonb_typeof(e.value) = 'object' and e.value ? 'notes')`,
    [PROTECTED],
  );
  assert.equal(rows[0].n, 0, "applications.metadata still holds protected detail somewhere");
  const coLeft = await h.c.query(
    "select count(*)::int as n from property.record_items where owner_type = 'application' and kind = 'co_applicant' and metadata ?| array['dateOfBirth', 'screeningNotes']",
  );
  assert.equal(coLeft.rows[0].n, 0, "co-applicant record_items still hold protected detail");
  const app = (await h.c.query("select metadata from property.applications where id = $1", [APP])).rows[0].metadata;
  assert.deepEqual(leftIn(app), []);
  assert.equal(app.employer, "Harbor Logistics", "the rest of the application is untouched");
  assert.deepEqual(app.screening.credit, { status: "Complete", result: "Thin file", score: 640 }, "the screening summary stays");
  const d = await detailOf();
  assert.deepEqual(
    [d.dateOfBirth, d.idLast4, d.evictedBefore, d.disclosureNotes, d.screeningReference, d.findings],
    ["1990-07-02", "6614", true, "Eviction in 2019.", "R02-1", { credit: "Two accounts.", income: "" }],
  );
  assert.deepEqual(await detailOf(CO), { dateOfBirth: "1992-01-05", screeningNotes: "Pending" });
  const co = (await h.c.query("select metadata from property.record_items where id = $1", [CO])).rows[0].metadata;
  assert.deepEqual(co, { role: "tenant", email: "co@mail.example" });
});

test("leak 1 closed: members read the application row through PostgREST without any protected detail", async () => {
  for (const who of STAFF) {
    const r = await h.runAs(who, "select metadata from property.applications where id = $1", [APP]);
    assert.equal(r.rows?.length, 1, `${who} still reads the application (screens keep working)`);
    assert.deepEqual(leftIn(r.rows[0].metadata), [], `${who} reads protected detail`);
    const co = await h.runAs(who, "select metadata from property.record_items where id = $1", [CO]);
    assert.ok(!("dateOfBirth" in co.rows[0].metadata) && !("screeningNotes" in co.rows[0].metadata), `${who} reads a co-applicant's detail`);
  }
  for (const who of OUTSIDE) assert.equal((await h.runAs(who, "select id from property.applications where id = $1", [APP])).rows?.length ?? 0, 0, who);
});

test("server-only tables: no client role reads or writes them, the Owner included; the service role does", async () => {
  for (const who of [...STAFF, ...OUTSIDE]) {
    const seen = await h.counts(who, TABLES);
    assert.deepEqual(seen, { screening_details: null, applicant_fingerprints: null, screening_access_log: null }, `${who}: ${JSON.stringify(seen)}`);
    assert.ok(refused(await h.runAs(who, "insert into property.screening_access_log (project_id, object_type, action) values ($1, 'report', 'view')", [DEMO])), who);
  }
  await asReviewer(async () => {
    assert.equal((await h.counts("accountant", ["screening_details"])).screening_details, null, "even a view_reports role goes through the logged route");
  });
  const r = await h.runAs("service", "select detail ->> 'idLast4' as l4 from property.screening_details where application_id = $1 and party_ref = 'primary'", [APP]);
  assert.equal(r.rows[0].l4, "6614");
  for (const t of TABLES) {
    const anon = await h.runAs("anon", `select count(*) from property.${t}`);
    assert.ok(refused(anon), `anon reads ${t}`);
  }
});

test("access log: the service role appends; nobody updates or deletes a row", async () => {
  const ins = await h.runAs(
    "service",
    "insert into property.screening_access_log (project_id, actor_id, actor_name, application_id, object_type, object_id, action) values ($1, $2, 'RLS', $3, 'document', 'd1', 'download') returning id",
    [DEMO, USERS.owner, APP],
    true,
  );
  assert.equal(ins.rows.length, 1);
  const id = ins.rows[0].id;
  assert.ok(refused(await h.runAs("service", "update property.screening_access_log set action = 'view' where id = $1", [id])), "service role update");
  assert.ok(refused(await h.runAs("service", "delete from property.screening_access_log where id = $1", [id])), "service role delete");
  const owner = await h.run("update property.screening_access_log set action = 'view' where id = $1", [id]);
  assert.match(owner.message || "", /append-only/, "even the table owner is refused");
  assert.match((await h.run("delete from property.screening_access_log where id = $1", [id])).message || "", /append-only/);
  assert.equal((await h.run("insert into property.screening_access_log (project_id, object_type, action) values ($1, 'ssn', 'view')", [DEMO])).code, "23514");
});

test("client writes: without view_reports a value is refused and a blank is dropped; with it the value is moved", async () => {
  const merge = (patch) => `select property.merge_meta('applications', '${APP}', '${JSON.stringify(patch).replace(/'/g, "''")}'::jsonb) as m`;
  for (const who of NO_REPORTS) {
    const r = await h.runAs(who, merge({ dateOfBirth: "2001-01-01" }));
    assert.ok(refused(r), `${who} records a date of birth: ${JSON.stringify(r)}`);
    assert.match(r.message, /identity details or screening findings/);
  }
  assert.ok(refused(await h.runAs("tech", "update property.applications set metadata = metadata || '{\"idLast4\":\"0000\"}' where id = $1", [APP])));
  // A leasing agent (screening.order) updating a check's status with the old UI's blank notes: saved, findings untouched.
  const status = await h.runAs("leasing", merge({ screening: { credit: { status: "Complete", result: "Thin file", score: 640, notes: "" } } }));
  assert.ok(!status.code, JSON.stringify(status));
  assert.deepEqual(leftIn(status.rows[0].m), []);
  assert.equal((await detailOf()).findings.credit, "Two accounts.", "a blank never clears findings");
  // The Owner (and a ticked custom role) record values: moved out of metadata at once.
  const own = await h.runAs("owner", merge({ idLast4: "9999", disclosureNotes: "" }), [], true);
  assert.ok(!own.code, JSON.stringify(own));
  assert.deepEqual(leftIn(own.rows[0].m), []);
  const d = await detailOf();
  assert.equal(d.idLast4, "9999");
  assert.equal(d.disclosureNotes, "Eviction in 2019.", "a client blank never clears a value (the server route does)");
  await asReviewer(async () => {
    const r = await h.runAs("accountant", merge({ dateOfBirth: "1990-07-03" }), [], true);
    assert.ok(!r.code, JSON.stringify(r));
    assert.equal((await detailOf()).dateOfBirth, "1990-07-03");
  });
  // A co-applicant's detail follows the same rule.
  assert.ok(refused(await h.runAs("leasing", "update property.record_items set metadata = metadata || '{\"screeningNotes\":\"x\"}' where id = $1", [CO])));
  const insert = await h.runAs(
    "owner",
    "insert into property.record_items (project_id, owner_type, owner_id, kind, name, metadata) values ($1, 'application', $2, 'co_applicant', 'Second', '{\"dateOfBirth\":\"1980-02-02\"}') returning id, metadata",
    [DEMO, APP],
    true,
  );
  assert.ok(!insert.code, JSON.stringify(insert));
  assert.deepEqual(insert.rows[0].metadata, {});
  assert.equal((await detailOf(insert.rows[0].id)).dateOfBirth, "1980-02-02");
});

test("server writes: the service role (seeds, routes) moves every value and may clear one", async () => {
  const r = await h.runAs("service", "update property.applications set metadata = metadata || '{\"disclosureNotes\":\"\",\"felonyDisclosed\":false}' where id = $1 returning metadata", [APP], true);
  assert.deepEqual(leftIn(r.rows[0].metadata), []);
  const d = await detailOf();
  assert.equal(d.disclosureNotes, "");
  assert.equal(d.felonyDisclosed, false);
});

test("leak 2 closed: application files in property-files need view_reports; other files are unchanged", async () => {
  assert.equal(await reads("owner", "property-files", F.legacyAppFile), 1, "the Owner reads (and so signs) it");
  for (const who of NO_REPORTS) {
    assert.equal(await reads(who, "property-files", F.legacyAppFile), 0, `${who} reads an application file`);
    assert.equal(await reads(who, "property-files", F.leaseFile), 1, `${who} still reads the project's other files`);
  }
  await asReviewer(async () => {
    assert.equal(await reads("accountant", "property-files", F.legacyAppFile), 1, "a role ticked with view_reports reads it");
  });
  for (const who of OUTSIDE) assert.equal(await reads(who, "property-files", F.legacyAppFile), 0, who);
  assert.equal(await reads("owner", "property-files", F.otherAppFile), 0, "never another org's");
  assert.equal(await reads("service", "property-files", F.legacyAppFile), 1, "the server signs it");
});

test("property-screening: private, with no client policy at all; only the server reads it", async () => {
  const bucket = (await h.c.query("select public from storage.buckets where id = 'property-screening'")).rows[0];
  assert.equal(bucket?.public, false);
  const policies = await h.c.query(
    "select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%property-screening%'",
  );
  assert.equal(policies.rows[0].n, 0);
  for (const who of [...STAFF, ...OUTSIDE]) assert.equal(await reads(who, "property-screening", F.screeningFile), 0, `${who} reads a screening file`);
  await asReviewer(async () => {
    assert.equal(await reads("accountant", "property-screening", F.screeningFile), 0, "view_reports opens files only through the logged route");
  });
  for (const who of ["owner", "leasing", "anon"]) {
    const up = await h.runAs(who, "insert into storage.objects (bucket_id, name) values ('property-screening', $1)", [`${DEMO}/application/${APP}/x.pdf`]);
    assert.ok(refused(up), `${who} uploads into property-screening`);
  }
  assert.equal(await reads("service", "property-screening", F.screeningFile), 1);
});

test("documents: a row may name property-screening, still only inside its own project", async () => {
  const ins = (path) =>
    h.run("insert into property.documents (project_id, owner_type, owner_id, name, bucket, storage_path) values ($1, 'application', $2, 'id.pdf', 'property-screening', $3)", [DEMO, APP, path]);
  assert.equal((await ins(F.screeningFile)).count, 1);
  assert.equal((await ins(`${OTHER}/application/${APP}/x.pdf`)).code, "23514");
});
