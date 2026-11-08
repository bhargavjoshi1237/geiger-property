// PLAT-05 global record search as each persona, inside one rolled-back transaction (see harness.mjs).
// Run: npm run test:rls   (SEARCH_APPLY_UP=1 dry-runs the global_record_search @up first)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO, OTHER, openHarness } from "./harness.mjs";

let h;
const F = {};
const uuid = () => crypto.randomUUID();
// A token no real record carries, so every hit is a fixture.
const TOKEN = "quillonprobe";
const ALL = ["application", "bill", "lease", "owner", "property", "prospect", "tenant", "unit", "vendor", "work_order"];

// The newest global_record_search @up, applied in-transaction for a dry run before db:push.
function searchUp() {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");
  const file = readdirSync(dir).filter((f) => /_global_record_search\.sql$/.test(f)).sort().at(-1);
  if (!file) throw new Error("SEARCH_APPLY_UP: no global_record_search migration");
  return readFileSync(path.join(dir, file), "utf8").split("-- @up")[1].split("-- @down")[0];
}

// search_records as a persona: the rows, or { code } on an error.
async function search(who, project, query, types = null, limit = 20) {
  const r = await h.runAs(who, "select * from property.search_records($1, $2, $3, $4)", [project, query, types, limit]);
  return r.code ? r : r.rows;
}
const ids = (rows) => rows.map((r) => r.id).sort();
const typesOf = (rows) => [...new Set(rows.map((r) => r.type))].sort();

before(async () => {
  h = await openHarness();
  const q = (sql, params) => h.c.query(sql, params);
  if (process.env.SEARCH_APPLY_UP) await q(searchUp());
  // One probe record of every type in the demo project, two more tenants, a soft-deleted one, and another org's records.
  const rows = {
    tenant: ["tenants", "name, email, phone, unit", [`${TOKEN} Tenant`, "probe.tenant@demo.example", "(999) 555-4321", "Probe Court · P-1"]],
    prospect: ["prospects", "name, email", [`${TOKEN} Prospect`, "probe.prospect@demo.example"]],
    application: ["applications", "name", [`${TOKEN} Applicant`]],
    owner: ["owners", "name", [`${TOKEN} Owner`]],
    vendor: ["vendors", "name", [`${TOKEN} Vendor`]],
    property: ["properties", "name, city, state", [`${TOKEN} Property`, "Seattle", "WA"]],
    unit: ["units", "label", [`${TOKEN} Unit`]],
    lease: ["leases", "name, status", [`${TOKEN} Lease`, "Active"]],
    work_order: ["work_orders", "name", [`${TOKEN} Work order`]],
    bill: ["bills", "name, vendor_name", [`${TOKEN} Bill`, "Probe Supply"]],
  };
  for (const [type, [table, cols, values]] of Object.entries(rows)) {
    F[type] = uuid();
    const marks = values.map((_, i) => `$${i + 3}`).join(", ");
    await q(`insert into property.${table} (id, project_id, ${cols}) values ($1, $2, ${marks})`, [F[type], DEMO, ...values]);
  }
  F.tenant2 = uuid();
  F.tenant3 = uuid();
  await q("insert into property.tenants (id, project_id, name) values ($1, $3, $4), ($2, $3, $5)", [F.tenant2, F.tenant3, DEMO, `${TOKEN} Second`, `${TOKEN} Third`]);
  F.deleted = uuid();
  await q("insert into property.tenants (id, project_id, name, deleted_at) values ($1, $2, $3, now())", [F.deleted, DEMO, `${TOKEN} Departed`]);
  F.otherTenant = uuid();
  F.otherOwner = uuid();
  await q("insert into property.tenants (id, project_id, name, phone) values ($1, $2, $3, '(999) 555-4321')", [F.otherTenant, OTHER, `${TOKEN} Other tenant`]);
  await q("insert into property.owners (id, project_id, name) values ($1, $2, $3)", [F.otherOwner, OTHER, `${TOKEN} Other owner`]);
  // The other org's owner gets their Owner grant in their own project the way the app mints it.
  const minted = await h.runAs("otherOrg", "select property.rbac_ensure_membership($1)", [OTHER], true);
  assert.ok(!minted.code, `other org membership: ${minted.message}`);
});

after(async () => {
  await h?.close();
});

test("search: a member finds only their own project's records, never another project's", async () => {
  const demo = await search("owner", DEMO, TOKEN);
  assert.ok(Array.isArray(demo), demo.message);
  assert.ok(!demo.some((r) => [F.otherTenant, F.otherOwner].includes(r.id)), "demo search never returns the other org's rows");
  assert.deepEqual(await search("owner", OTHER, TOKEN), [], "the demo owner gets nothing from another org's project");

  const other = await search("otherOrg", OTHER, TOKEN);
  assert.deepEqual(ids(other), [F.otherOwner, F.otherTenant].sort(), "the other org finds exactly its own records");
  assert.deepEqual(await search("otherOrg", DEMO, TOKEN), [], "the other org gets nothing from the demo project");

  // The same phone number lives in both projects; each side sees only its own tenant.
  assert.deepEqual(ids(await search("owner", DEMO, "555-4321")), [F.tenant]);
  assert.deepEqual(ids(await search("otherOrg", OTHER, "555-4321")), [F.otherTenant]);
});

test("search: soft-deleted rows never match", async () => {
  const rows = await search("owner", DEMO, TOKEN);
  assert.ok(!rows.some((r) => r.id === F.deleted));
  assert.deepEqual(await search("owner", DEMO, `${TOKEN} Departed`), []);
});

test("search: part of a tenant's phone number or email finds the tenant", async () => {
  for (const query of ["555-4321", "5554321", "(999) 555", "probe.tenant@demo", "PROBE.TENANT"]) {
    const rows = await search("owner", DEMO, query);
    assert.ok(rows.some((r) => r.id === F.tenant && r.type === "tenant"), `"${query}" finds the tenant`);
  }
  const [hit] = (await search("owner", DEMO, "probe.tenant@demo")).filter((r) => r.id === F.tenant);
  assert.equal(hit.title, `${TOKEN} Tenant`);
  assert.equal(hit.subtitle, "Probe Court · P-1");
  assert.match(hit.keywords, /probe\.tenant@demo\.example/);
});

test("search: each role finds only the record types its view keys open", async () => {
  const expected = {
    owner: ALL,
    manager: ALL,
    tech: ["property", "unit", "vendor", "work_order"],
    leasing: ["application", "lease", "property", "prospect", "tenant", "unit"],
    accountant: ["bill", "owner", "tenant", "vendor"],
  };
  for (const [who, types] of Object.entries(expected)) {
    const rows = await search(who, DEMO, TOKEN);
    assert.ok(Array.isArray(rows), `${who}: ${rows.message}`);
    assert.deepEqual(typesOf(rows), types, `${who} sees ${types.join(", ")}`);
  }
  // A Maintenance tech never gets owners, tenants or bills, even when it asks for them by type.
  assert.deepEqual(await search("tech", DEMO, TOKEN, ["owner", "tenant", "bill"]), []);
});

test("search: types narrow the result, and the per-type cap holds", async () => {
  assert.deepEqual(typesOf(await search("owner", DEMO, TOKEN, ["unit", "vendor"])), ["unit", "vendor"]);
  const capped = await search("owner", DEMO, TOKEN, ["tenant"], 2);
  assert.equal(capped.length, 2, "two of the three live probe tenants");
  assert.equal((await search("owner", DEMO, TOKEN, ["tenant"], 500)).length, 3, "an oversized limit is clamped, not refused");
});

test("search: short queries and LIKE wildcards match nothing", async () => {
  assert.deepEqual(await search("owner", DEMO, "q"), []);
  assert.deepEqual(await search("owner", DEMO, "  "), []);
  assert.deepEqual(await search("owner", DEMO, "%%"), []);
  assert.deepEqual(await search("owner", DEMO, "__"), []);
  assert.deepEqual(await search("owner", DEMO, `${TOKEN}%Tenant`), []);
});

test("search: anon can't call it; an outsider and portal users get nothing", async () => {
  assert.equal((await search("anon", DEMO, TOKEN)).code, "42501");
  for (const who of ["outsider", "resident", "portalOwner", "vendor"]) {
    assert.deepEqual(await search(who, DEMO, TOKEN), [], `${who} finds nothing`);
  }
});

test("search: it is security invoker with an empty search_path, and the trigram indexes serve its haystacks", async () => {
  const fn = (await h.c.query("select prosecdef, proconfig from pg_proc where oid = 'property.search_records(uuid, text, text[], integer)'::regprocedure")).rows[0];
  assert.equal(fn.prosecdef, false);
  assert.deepEqual(fn.proconfig, ['search_path=""']);
  await h.c.query("savepoint plan");
  await h.c.query("set local enable_seqscan = off");
  await h.c.query("set local enable_indexscan = off");
  const plan = (await h.c.query(`explain select t.id from property.tenants t cross join lateral (select
      coalesce(t.name, '') || ' ' || coalesce(t.email, '') || ' ' || coalesce(t.phone, '') || ' '
      || regexp_replace(coalesce(t.phone, ''), '[^0-9]', '', 'g') || ' ' || coalesce(t.unit, '') as hay) h
    where t.project_id = $1 and t.deleted_at is null and h.hay ilike '%5554321%'`, [DEMO])).rows.map((r) => r["QUERY PLAN"]).join("\n");
  await h.c.query("rollback to savepoint plan");
  assert.match(plan, /tenants_search_trgm/);
});
