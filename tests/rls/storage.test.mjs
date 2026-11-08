// PLAT-01g storage matrix against the live database, inside one rolled-back transaction (see harness.mjs). The Storage API reads and
// signs as the caller's role with request.jwt.claims, so a persona that can't select a storage.objects row can't download it or get
// a signed URL for it. Run: npm run test:rls   (RLS_APPLY_UP=property_storage_buckets dry-runs the migration first)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DEMO, OTHER, USERS, openHarness } from "./harness.mjs";

let h;
const F = {};
const uuid = () => crypto.randomUUID();
const STAFF = ["owner", "manager", "accountant", "tech", "leasing"];
const OUTSIDE = ["anon", "outsider", "otherOrg", "resident", "portalOwner", "vendor"];

// Objects a persona can read (null on a permission error, which counts as unreadable).
const reads = async (who, bucket, name) => (await h.seen(who, "select count(*) as n from storage.objects where bucket_id = $1 and name = $2", [bucket, name])) ?? 0;
const upload = (who, bucket, name) => h.runAs(who, "insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3) returning id", [bucket, name, USERS[who] || null]);
const remove = async (who, bucket, name) => {
  await h.as(who);
  await h.c.query("select set_config('storage.allow_delete_query', 'true', true)");
  const r = await h.run("delete from storage.objects where bucket_id = $1 and name = $2", [bucket, name]);
  await h.as("postgres");
  return r;
};
const rename = (who, bucket, name) => h.runAs(who, "update storage.objects set name = name || '.moved' where bucket_id = $1 and name = $2", [bucket, name]);

before(async () => {
  h = await openHarness();
  const q = (sql, params) => h.c.query(sql, params);
  const object = async (bucket, name, owner = null) => {
    await q("insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)", [bucket, name, owner]);
    return name;
  };
  F.demoFile = await object("property-files", `${DEMO}/document/${uuid()}/lease.pdf`);
  F.portalFile = await object("property-files", `${DEMO}/portal/${uuid()}/request/photo.jpg`);
  F.otherFile = await object("property-files", `${OTHER}/document/${uuid()}/theirs.pdf`);
  F.badPath = await object("property-files", `not-a-project/${uuid()}.pdf`);
  F.demoPublic = await object("property-public", `${DEMO}/property/${uuid()}/cover.jpg`);
  // Chat: a public-channel file, a private-channel file (owner only) and an unregistered upload by the manager.
  for (const who of ["owner", "manager", "tech"]) {
    await q("insert into property.chat_profiles (id, display_name, project_ids) values ($1, $2, $3) on conflict (id) do update set project_ids = excluded.project_ids", [USERS[who], `RLS ${who}`, [DEMO]]);
  }
  F.publicChannel = uuid();
  await q("insert into property.chat_conversations (id, project_id, kind, name, visibility, created_by) values ($1, $2, 'channel', $3, 'public', $4)", [F.publicChannel, DEMO, `rls-files-public-${F.publicChannel.slice(0, 6)}`, USERS.owner]);
  F.privateChannel = uuid();
  await q("insert into property.chat_conversations (id, project_id, kind, name, visibility, created_by) values ($1, $2, 'channel', $3, 'private', $4)", [F.privateChannel, DEMO, `rls-files-private-${F.privateChannel.slice(0, 6)}`, USERS.owner]);
  await q("insert into property.chat_members (conversation_id, profile_id) values ($1, $2)", [F.privateChannel, USERS.owner]);
  F.chatPublic = await object("property-chat", `${DEMO}/${USERS.owner}/${Date.now()}-plan.png`, USERS.owner);
  F.chatPrivate = await object("property-chat", `${DEMO}/${USERS.owner}/${Date.now()}-secret.pdf`, USERS.owner);
  F.chatPending = await object("property-chat", `${DEMO}/${USERS.manager}/${Date.now()}-draft.pdf`, USERS.manager);
  for (const [conv, path] of [[F.publicChannel, F.chatPublic], [F.privateChannel, F.chatPrivate]]) {
    await q("insert into property.chat_files (project_id, conversation_id, owner_id, name, storage_path, bucket) values ($1, $2, $3, 'f', $4, 'property-chat')", [DEMO, conv, USERS.owner, path]);
  }
});

after(async () => {
  await h?.close();
});

test("buckets: property-files and property-chat are private, property-public is public, products is untouched", async () => {
  const { rows } = await h.c.query("select id, public from storage.buckets where id in ('property-files', 'property-public', 'property-chat', 'products') order by id");
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.public])), { products: true, "property-chat": false, "property-files": false, "property-public": true });
  const products = await h.c.query("select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual like '%products%' or with_check like '%products%') and (qual like '%property%' or with_check like '%property%')");
  assert.equal(products.rows[0].n, 0, "no products policy mentions property");
});

test("property-files: anon, an outsider, another org's member and portal accounts can't read (so can't sign) a project's file", async () => {
  for (const who of OUTSIDE) {
    assert.equal(await reads(who, "property-files", F.demoFile), 0, `${who} reads the demo file`);
    assert.equal(await reads(who, "property-files", F.portalFile), 0, `${who} reads a portal upload`);
  }
  for (const who of STAFF) {
    assert.equal(await reads(who, "property-files", F.demoFile), 1, `${who} (an active member) reads the demo file`);
    assert.equal(await reads(who, "property-files", F.portalFile), 1, `${who} reads a resident's upload`);
    assert.equal(await reads(who, "property-files", F.otherFile), 0, `${who} reads another org's file`);
    assert.equal(await reads(who, "property-files", F.badPath), 0, `${who} reads a file outside any project`);
  }
  assert.equal(await reads("otherOrg", "property-files", F.otherFile), 1, "the other org reads its own file");
});

test("property-files: an inactive grant reads nothing", async () => {
  await h.c.query("savepoint grants");
  await h.c.query("update property.role_grants set status = 'inactive' where project_id = $1 and user_id = $2", [DEMO, USERS.tech]);
  assert.equal(await reads("tech", "property-files", F.demoFile), 0);
  await h.c.query("rollback to savepoint grants");
  assert.equal(await reads("tech", "property-files", F.demoFile), 1);
});

test("property-files: members upload into their own project only; replacing or deleting needs record.delete", async () => {
  assert.equal((await upload("tech", "property-files", `${DEMO}/work_order/${uuid()}/a.jpg`)).count, 1);
  assert.equal((await upload("tech", "property-files", `${OTHER}/work_order/${uuid()}/a.jpg`)).code, "42501");
  assert.equal((await upload("tech", "property-files", `x/${uuid()}.jpg`)).code, "42501");
  for (const who of ["anon", "outsider", "resident", "otherOrg"]) {
    assert.equal((await upload(who, "property-files", `${DEMO}/document/${uuid()}/a.pdf`)).code, "42501", `${who} uploads`);
  }
  assert.equal((await remove("tech", "property-files", F.demoFile)).count, 0, "a tech (no record.delete) deletes nothing");
  assert.equal((await rename("tech", "property-files", F.demoFile)).count, 0, "nor moves or overwrites");
  assert.equal((await remove("manager", "property-files", F.demoFile)).count, 1, "a manager (record.delete) deletes");
  assert.equal((await rename("manager", "property-files", F.demoFile)).count, 1);
  assert.equal((await remove("otherOrg", "property-files", F.demoFile)).count, 0);
  assert.equal((await remove("service", "property-files", F.demoFile)).count, 1, "the service role keeps full access");
});

test("property-public: nobody signed out can list it; members upload, record.delete removes", async () => {
  assert.equal(await reads("anon", "property-public", F.demoPublic), 0, "public files are served by URL, never listed");
  assert.equal(await reads("otherOrg", "property-public", F.demoPublic), 0);
  assert.equal(await reads("leasing", "property-public", F.demoPublic), 1);
  assert.equal((await upload("leasing", "property-public", `${DEMO}/listing/${uuid()}/a.jpg`)).count, 1);
  assert.equal((await upload("leasing", "property-public", `${OTHER}/listing/${uuid()}/a.jpg`)).code, "42501");
  assert.equal((await upload("anon", "property-public", `${DEMO}/listing/${uuid()}/a.jpg`)).code, "42501");
  assert.equal((await remove("tech", "property-public", F.demoPublic)).count, 0);
  assert.equal((await remove("owner", "property-public", F.demoPublic)).count, 1);
});

test("property-chat: files follow their conversation; uploads go into your own folder", async () => {
  assert.equal(await reads("tech", "property-chat", F.chatPublic), 1, "a public-channel file");
  assert.equal(await reads("tech", "property-chat", F.chatPrivate), 0, "a private channel the tech isn't in");
  assert.equal(await reads("owner", "property-chat", F.chatPrivate), 1, "a member of the private channel");
  assert.equal(await reads("manager", "property-chat", F.chatPending), 1, "the uploader before the file is registered");
  assert.equal(await reads("tech", "property-chat", F.chatPending), 0, "an unregistered upload is the uploader's only");
  for (const who of OUTSIDE) assert.equal(await reads(who, "property-chat", F.chatPublic), 0, `${who} reads a chat file`);
  assert.equal((await upload("tech", "property-chat", `${DEMO}/${USERS.tech}/${Date.now()}-a.png`)).count, 1);
  assert.equal((await upload("tech", "property-chat", `${DEMO}/${USERS.owner}/${Date.now()}-a.png`)).code, "42501", "someone else's folder");
  assert.equal((await upload("otherOrg", "property-chat", `${DEMO}/${USERS.otherOrg}/${Date.now()}-a.png`)).code, "42501");
  assert.equal((await remove("tech", "property-chat", F.chatPublic)).count, 0, "only the uploader deletes");
  assert.equal((await remove("owner", "property-chat", F.chatPublic)).count, 1);
  await h.c.query("update property.chat_files set deleted_at = now() where storage_path = $1", [F.chatPrivate]);
  assert.equal(await reads("owner", "property-chat", F.chatPrivate), 1, "the uploader still reads their own file");
  assert.equal(await reads("manager", "property-chat", F.chatPrivate), 0, "a deleted file row opens nothing for others");
});

test("file columns: a stored path must sit in the row's project, in a Property bucket", async () => {
  const doc = (bucket, path) =>
    h.run("insert into property.documents (project_id, owner_type, owner_id, name, bucket, storage_path) values ($1, 'library', $1, 'RLS doc', $2, $3)", [DEMO, bucket, path]);
  assert.equal((await doc("property-files", `${DEMO}/library/x/a.pdf`)).count, 1);
  assert.equal((await doc("property-files", `${OTHER}/library/x/a.pdf`)).code, "23514", "another project's path");
  assert.equal((await doc("products", `${DEMO}/library/x/a.pdf`)).code, "23514", "a bucket outside Property");
});
