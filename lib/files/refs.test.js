import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FILES_BUCKET,
  PUBLIC_BUCKET,
  collectRefs,
  fieldFile,
  fileRef,
  inPrefix,
  isPdf,
  isPrivate,
  legacyPath,
  migratedPath,
  objectPath,
  portalPrefix,
  refKey,
  storedFileOf,
  uniqueName,
} from "./refs";

// PLAT-01g: file refs are { bucket, path } in a Property bucket, or a plain legacy { url }.

const P = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";
const LEGACY = "https://x.supabase.co/storage/v1/object/public/products/property/lease/abc/2026-file.txt";

test("fileRef reads rows, view models and metadata items; anything else is a plain url or nothing", () => {
  assert.deepEqual(fileRef({ bucket: FILES_BUCKET, storage_path: `${P}/a.pdf`, url: "" }), { bucket: FILES_BUCKET, path: `${P}/a.pdf`, url: "" });
  assert.deepEqual(fileRef({ bucket: FILES_BUCKET, storagePath: `${P}/a.pdf` }), { bucket: FILES_BUCKET, path: `${P}/a.pdf`, url: "" });
  assert.deepEqual(fileRef({ bucket: PUBLIC_BUCKET, path: `${P}/c.jpg`, url: LEGACY }).bucket, PUBLIC_BUCKET);
  assert.deepEqual(fileRef({ url: LEGACY }), { bucket: null, path: null, url: LEGACY });
  assert.deepEqual(fileRef({ bucket: "products", path: "property/x" }, "https://e/x.png"), { bucket: null, path: null, url: "https://e/x.png" });
  assert.equal(fileRef(null), null);
  assert.equal(fileRef({ bucket: FILES_BUCKET, path: "" }), null);
  assert.equal(fileRef("a string"), null);
});

test("fieldFile and storedFileOf pair a link field with its stored file", () => {
  const plan = { imageUrl: "https://e/plan.png", imageFile: { bucket: FILES_BUCKET, path: `${P}/floor_plan/x/p.pdf` } };
  assert.equal(fieldFile(plan, "imageUrl").path, `${P}/floor_plan/x/p.pdf`);
  assert.equal(fieldFile({ imageUrl: "https://e/plan.png" }, "imageUrl").url, "https://e/plan.png");
  assert.equal(fieldFile({}, "imageUrl"), null);
  const rec = { metadata: { documentFile: { bucket: FILES_BUCKET, path: `${P}/portal/m/insurance/a.pdf`, name: "COI.pdf" } } };
  assert.deepEqual(storedFileOf(rec, "documentUrl"), { bucket: FILES_BUCKET, path: `${P}/portal/m/insurance/a.pdf`, url: "", name: "COI.pdf" });
  assert.equal(storedFileOf({ documentFile: { bucket: FILES_BUCKET, path: `${P}/x.pdf` } }, "documentLink").path, `${P}/x.pdf`);
  assert.equal(storedFileOf({ documentUrl: "https://e" }, "documentUrl"), null);
});

test("refKey, isPrivate and isPdf", () => {
  assert.equal(refKey({ bucket: FILES_BUCKET, path: `${P}/a` }), `${FILES_BUCKET}/${P}/a`);
  assert.equal(refKey({ url: "https://e/x" }), "https://e/x");
  assert.equal(refKey(null), "");
  assert.equal(isPrivate({ bucket: FILES_BUCKET, path: "p" }), true);
  assert.equal(isPrivate({ bucket: PUBLIC_BUCKET, path: "p" }), false);
  assert.equal(isPrivate({ url: "https://e" }), false);
  assert.equal(isPdf({ path: `${P}/a.PDF` }), true);
  assert.equal(isPdf({ url: "https://e/a.pdf?token=1" }), true);
  assert.equal(isPdf({ path: `${P}/a.png` }), false);
});

test("objectPath puts every upload under its project and sanitises the segments", () => {
  assert.equal(objectPath(P, "unit", "u-1", "f.jpg"), `${P}/unit/u-1/f.jpg`);
  assert.equal(objectPath(P, "../x", "a/b", "f.jpg"), `${P}/x/a-b/f.jpg`);
  assert.equal(objectPath(P, "", null, "f.jpg"), `${P}/misc/unassigned/f.jpg`);
  assert.throws(() => objectPath(null, "unit", "u", "f"), /project is required/);
  assert.throws(() => objectPath("not-a-uuid", "unit", "u", "f"), /project is required/);
  assert.match(uniqueName("Lease.PDF", "application/pdf"), /^\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-z0-9]+\.pdf$/);
  assert.match(uniqueName("noext", "image/jpeg"), /\.jpeg$/);
});

test("inPrefix and portalPrefix: no relative segments, no prefix look-alikes", () => {
  const own = portalPrefix(P, "m1");
  assert.equal(own, `${P}/portal/m1`);
  assert.equal(inPrefix(`${own}/request/a.jpg`, own), true);
  assert.equal(inPrefix(`${own}x/request/a.jpg`, own), false);
  assert.equal(inPrefix(`${own}/../m2/a.jpg`, own), false);
  assert.equal(inPrefix(`${own}/./a.jpg`, own), false);
  assert.equal(inPrefix(null, own), false);
});

test("legacyPath and migratedPath map products/property URLs into the project", () => {
  assert.equal(legacyPath(LEGACY), "property/lease/abc/2026-file.txt");
  assert.equal(legacyPath(`${LEGACY}?t=1`), "property/lease/abc/2026-file.txt");
  assert.equal(legacyPath("https://x.supabase.co/storage/v1/object/public/products/property/a%20b.png"), "property/a b.png");
  assert.equal(legacyPath("https://x.supabase.co/storage/v1/object/public/products/events/e/a.png"), null);
  assert.equal(legacyPath("https://x.supabase.co/storage/v1/object/public/products/property/../events/a.png"), null);
  assert.equal(legacyPath("https://blob.vercel-storage.com/a.jpg"), null);
  assert.equal(migratedPath(P, "property/portal/m1/request/a.jpg"), `${P}/portal/m1/request/a.jpg`);
  assert.equal(migratedPath(P, "events/x"), null);
  assert.equal(migratedPath(null, "property/x"), null);
});

test("collectRefs finds every stored ref in a nested payload", () => {
  const payload = {
    requests: [{ photos: [{ id: 1, bucket: FILES_BUCKET, path: `${P}/a` }, { id: 2, url: "https://e" }] }],
    doc: { bucket: FILES_BUCKET, path: `${P}/b` },
    other: { bucket: "products", path: "property/c" },
  };
  assert.deepEqual(collectRefs(payload).map((r) => r.path), [`${P}/a`, `${P}/b`]);
});
