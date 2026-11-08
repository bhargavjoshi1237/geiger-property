import { test } from "node:test";
import assert from "node:assert/strict";
import { addRefs, cleanupGate, metaKeyForColumn, planCleanup, planCopy, runStorageMigrate, storageMigrateJob, targetBucket } from "./storage_migrate";
import { JOBS, MANUAL_JOBS, getJob } from "./registry";
import { RUNBOOK } from "./runbook";

// PLAT-01g storage-migrate: copy products/property files into the project's buckets (url kept), then clean up after 14 days.

const P = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";
const pub = (path) => `https://x.supabase.co/storage/v1/object/public/products/${path}`;
const publicUrl = (path) => `https://x/public/property-public/${path}`;

test("the job is Run-now only: registered, listed, no cron, allowed while paused", () => {
  assert.ok(MANUAL_JOBS.includes(storageMigrateJob));
  assert.equal(JOBS.includes(storageMigrateJob), false, "not in the cron plan or the watchdog");
  assert.equal(getJob("storage-migrate"), storageMigrateJob);
  assert.equal(storageMigrateJob.manual, true);
  assert.equal(storageMigrateJob.manualWhilePaused, true);
  assert.ok(RUNBOOK["storage-migrate"]);
});

test("targetBucket: covers, logos and listing photos are public; everything else private", () => {
  assert.equal(targetBucket({ table: "properties", column: "cover_url" }), "property-public");
  assert.equal(targetBucket({ table: "media", column: "url", row: { owner_type: "listing" } }), "property-public");
  assert.equal(targetBucket({ table: "buildings", column: "metadata", key: "coverUrl" }), "property-public");
  assert.equal(targetBucket({ table: "media", column: "url", row: { owner_type: "unit" } }), "property-files");
  assert.equal(targetBucket({ table: "work_orders", column: "metadata", key: "photos" }), "property-files");
  assert.equal(metaKeyForColumn("cover_url"), "coverFile");
  assert.equal(metaKeyForColumn("image_url"), "imageFile");
});

test("planCopy: a file-table url gains bucket + storage_path; a copied row is skipped", () => {
  const row = { id: "d1", project_id: P, url: pub("property/lease/l1/a.txt"), storage_path: null, metadata: {} };
  const plan = planCopy({ table: "documents", row, columns: ["url"] });
  assert.deepEqual(plan.copies, [{ src: "property/lease/l1/a.txt", bucket: "property-files", dest: `${P}/lease/l1/a.txt` }]);
  assert.deepEqual(plan.columns, { bucket: "property-files", storage_path: `${P}/lease/l1/a.txt` });
  assert.deepEqual(planCopy({ table: "documents", row: { ...row, storage_path: `${P}/lease/l1/a.txt` }, columns: ["url"] }).copies, []);
  const failed = planCopy({ table: "documents", row, columns: ["url"], ok: () => false });
  assert.equal(failed.copies.length, 1);
  assert.deepEqual(failed.columns, {}, "nothing is recorded for a source that didn't copy");
});

test("planCopy: other url columns record a <x>File metadata ref; covers go public; media thumb rides with url", () => {
  const plan = planCopy({ table: "floor_plans", row: { id: "f", project_id: P, image_url: pub("property/floor-plans/f/p.pdf"), metadata: {} }, columns: ["image_url"] });
  assert.deepEqual(plan.meta, { imageFile: { bucket: "property-files", path: `${P}/floor-plans/f/p.pdf` } });
  const cover = planCopy({ table: "properties", row: { id: "p", project_id: P, cover_url: pub("property/property/p/c.jpg"), metadata: {} }, columns: ["cover_url"] });
  assert.equal(cover.meta.coverFile.bucket, "property-public");
  const url = pub("property/unit/u/a.jpg");
  const media = planCopy({ table: "media", row: { id: "m", project_id: P, owner_type: "unit", url, thumb_url: url, metadata: {} }, columns: ["url", "thumb_url"] });
  assert.equal(media.copies.length, 1);
  assert.deepEqual(Object.keys(media.meta), []);
  const notes = planCopy({ table: "activity", row: { id: "a", project_id: P, details: `see ${pub("property/x.png")}` }, columns: ["details"] });
  assert.deepEqual(notes.unhandled, ["details"]);
});

test("planCopy: metadata photos gain { bucket, path } and xUrl strings gain a sibling xFile, only for changed keys", () => {
  const meta = {
    photos: [{ id: "1", label: "a", url: pub("property/portal/m1/request/a.jpg") }, { id: "2", bucket: "property-files", path: `${P}/work_order/w/b.jpg` }],
    documentUrl: pub("property/portal/m1/insurance/c.pdf"),
    note: "unchanged",
  };
  const plan = planCopy({ table: "work_orders", row: { id: "w", project_id: P, metadata: meta }, columns: ["metadata"] });
  assert.deepEqual(Object.keys(plan.meta).sort(), ["documentFile", "photos"]);
  assert.equal(plan.meta.photos[0].path, `${P}/portal/m1/request/a.jpg`);
  assert.equal(plan.meta.photos[0].url, meta.photos[0].url, "the old url stays until cleanup");
  assert.deepEqual(plan.meta.photos[1], meta.photos[1]);
  assert.deepEqual(plan.meta.documentFile, { bucket: "property-files", path: `${P}/portal/m1/insurance/c.pdf` });
  const again = addRefs({ ...meta, photos: plan.meta.photos, documentFile: plan.meta.documentFile }, { projectId: P, table: "work_orders", column: "metadata" });
  assert.equal(again.copies.length, 0, "a second pass copies nothing");
  assert.equal(again.changed, false);
});

test("planCleanup: private urls are cleared, public ones repointed, metadata urls dropped; shared originals are kept", () => {
  const doc = { id: "d", project_id: P, url: pub("property/lease/l/a.txt"), bucket: "property-files", storage_path: `${P}/lease/l/a.txt`, metadata: {} };
  assert.deepEqual(planCleanup({ table: "documents", row: doc, columns: ["url"], publicUrl }), { removes: ["property/lease/l/a.txt"], columns: { url: null }, meta: {}, value: null });
  assert.deepEqual(planCleanup({ table: "documents", row: { ...doc, storage_path: null }, columns: ["url"], publicUrl }).removes, [], "no copy recorded → nothing removed");
  assert.deepEqual(planCleanup({ table: "documents", row: doc, columns: ["url"], publicUrl, keep: () => true }).removes, []);
  const prop = { id: "p", project_id: P, cover_url: pub("property/property/p/c.jpg"), metadata: { coverFile: { bucket: "property-public", path: `${P}/property/p/c.jpg` } } };
  assert.deepEqual(planCleanup({ table: "properties", row: prop, columns: ["cover_url"], publicUrl }).columns, { cover_url: publicUrl(`${P}/property/p/c.jpg`) });
  const wo = {
    id: "w",
    project_id: P,
    metadata: {
      photos: [{ id: "1", url: pub("property/portal/m1/request/a.jpg"), bucket: "property-files", path: `${P}/portal/m1/request/a.jpg` }],
      documentUrl: pub("property/portal/m1/insurance/c.pdf"),
      documentFile: { bucket: "property-files", path: `${P}/portal/m1/insurance/c.pdf` },
    },
  };
  const plan = planCleanup({ table: "work_orders", row: wo, columns: ["metadata"], publicUrl });
  assert.deepEqual(plan.removes.sort(), ["property/portal/m1/insurance/c.pdf", "property/portal/m1/request/a.jpg"]);
  assert.equal("url" in plan.meta.photos[0], false);
  assert.equal(plan.meta.documentUrl, "");
});

// A minimal service-role stand-in for runStorageMigrate.
function fakeAdmin({ hits = [], rows = {}, runs = [], objects = new Set() } = {}) {
  const writes = [];
  const query = (table) => {
    const filters = {};
    const q = {
      select: () => q,
      eq: (c, v) => ((filters[c] = v), q),
      in: () => q,
      is: () => q,
      order: () => q,
      limit: () => Promise.resolve({ data: table === "job_runs" ? runs : [], error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[`${table}|${filters.id}`] || null, error: null }),
      update: (patch) => ({ eq: () => ({ eq: () => (writes.push({ table, patch }), Promise.resolve({ error: null })) }) }),
    };
    return q;
  };
  return {
    writes,
    from: query,
    rpc: async (fn, args) => {
      if (fn === "storage_legacy_refs") return { data: hits, error: null };
      writes.push({ rpc: fn, args });
      return { error: null };
    },
    storage: {
      from: (bucket) => ({
        copy: async (src, dest, { destinationBucket }) => {
          if (!objects.has(`products/${src}`)) return { error: { message: "Object not found", statusCode: "404" } };
          objects.add(`${destinationBucket}/${dest}`);
          writes.push({ copy: `${bucket}/${src}`, to: `${destinationBucket}/${dest}` });
          return { error: null };
        },
        exists: async (path) => ({ data: objects.has(`${bucket}/${path}`) }),
        remove: async (paths) => (writes.push({ remove: bucket, paths }), { error: null }),
      }),
    },
  };
}

test("runStorageMigrate copy: copies server-side, records refs, reports missing originals; a write needs a project", async () => {
  const good = { id: "d1", project_id: P, url: pub("property/lease/l/a.txt"), storage_path: null, metadata: {} };
  const gone = { id: "d2", project_id: P, url: pub("property/lease/l/gone.txt"), storage_path: null, metadata: {} };
  const admin = fakeAdmin({
    hits: [{ table_name: "documents", row_id: "d1", project_id: P, column_name: "url" }, { table_name: "documents", row_id: "d2", project_id: P, column_name: "url" }],
    rows: { "documents|d1": good, "documents|d2": gone },
    objects: new Set(["products/property/lease/l/a.txt"]),
  });
  assert.match((await runStorageMigrate({ admin, projectId: null })).errors[0], /project is required/);
  const dry = await runStorageMigrate({ admin, projectId: P, dryRun: true });
  assert.equal(admin.writes.length, 0, "a dry run writes nothing");
  assert.deepEqual(dry.missing.map((m) => m.id), ["d2"]);
  const res = await runStorageMigrate({ admin, projectId: P });
  assert.equal(res.created, 1);
  assert.equal(res.processed, 1);
  assert.deepEqual(res.missing.map((m) => m.id), ["d2"]);
  assert.deepEqual(admin.writes.find((w) => w.copy), { copy: "products/property/lease/l/a.txt", to: `property-files/${P}/lease/l/a.txt` });
  assert.deepEqual(admin.writes.find((w) => w.table).patch, { bucket: "property-files", storage_path: `${P}/lease/l/a.txt` });
  assert.equal(admin.writes.filter((w) => w.table).length, 1, "the missing original records nothing");
});

test("runStorageMigrate cleanup: refused before 14 days; afterwards removes only copied property/ originals", async () => {
  const row = { id: "d1", project_id: P, url: pub("property/lease/l/a.txt"), bucket: "property-files", storage_path: `${P}/lease/l/a.txt`, metadata: {} };
  const base = {
    hits: [{ table_name: "documents", row_id: "d1", project_id: P, column_name: "url" }],
    rows: { "documents|d1": row },
    objects: new Set([`property-files/${P}/lease/l/a.txt`, "products/property/lease/l/a.txt"]),
  };
  const now = new Date("2026-12-01T00:00:00Z");
  const early = fakeAdmin({ ...base, runs: [{ started_at: "2026-11-25T00:00:00Z" }] });
  const refused = await runStorageMigrate({ admin: early, projectId: P, mode: "cleanup", now });
  assert.match(refused.errors[0].message, /Cleanup refused/);
  assert.equal(early.writes.length, 0);
  assert.equal((await cleanupGate(fakeAdmin({ runs: [] }), P, now)).ok, false, "no copy run yet");
  const ready = fakeAdmin({ ...base, runs: [{ started_at: "2026-11-08T00:00:00Z" }] });
  const res = await runStorageMigrate({ admin: ready, projectId: P, mode: "cleanup", now });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(ready.writes.find((w) => w.remove), { remove: "products", paths: ["property/lease/l/a.txt"] });
  assert.deepEqual(ready.writes.find((w) => w.table).patch, { url: null });
  const noCopy = fakeAdmin({ ...base, objects: new Set(["products/property/lease/l/a.txt"]), runs: [{ started_at: "2026-11-08T00:00:00Z" }] });
  const blocked = await runStorageMigrate({ admin: noCopy, projectId: P, mode: "cleanup", now });
  assert.match(blocked.errors[0].message, /copy of property\/lease\/l\/a\.txt is missing/);
  assert.equal(noCopy.writes.length, 0, "nothing removed or cleared without the copy");
});
