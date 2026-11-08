import { test } from "node:test";
import assert from "node:assert/strict";
import { isOwnUpload, ownFiles, signPortalFiles, storePortalFile, storedDocument } from "./files";

// PLAT-01g: portal uploads live in private storage under <projectId>/portal/<memberId>/; responses carry 15-minute signed URLs.

const P = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";
const OTHER = "0e54b8dd-e3f4-4b70-93fb-8f15f47550f4";
const ctx = { projectId: P, member: { id: "m1" } };
const own = (rest) => ({ bucket: "property-files", path: `${P}/portal/m1/${rest}` });

// A service-role stand-in that records storage calls.
function fakeAdmin() {
  const calls = [];
  const bucket = (name) => ({
    async upload(path, bytes, opts) {
      calls.push({ op: "upload", bucket: name, path, type: opts.contentType });
      return { error: null };
    },
    async createSignedUrls(paths, ttl) {
      calls.push({ op: "sign", bucket: name, paths, ttl });
      return { data: paths.map((p) => ({ path: p, signedUrl: `https://s/${name}/${p}?token=t`, error: null })), error: null };
    },
    getPublicUrl: (p) => ({ data: { publicUrl: `https://s/public/${name}/${p}` } }),
  });
  return { calls, storage: { from: bucket } };
}

test("isOwnUpload: only the member's own prefix in property-files", () => {
  assert.equal(isOwnUpload(own("request/a.jpg"), P, "m1"), true);
  assert.equal(isOwnUpload(own("request/a.jpg"), P, "m2"), false, "another member");
  assert.equal(isOwnUpload(own("request/a.jpg"), OTHER, "m1"), false, "another project");
  assert.equal(isOwnUpload({ bucket: "products", path: `${P}/portal/m1/a.jpg` }, P, "m1"), false, "another bucket");
  assert.equal(isOwnUpload({ bucket: "property-files", path: `${P}/portal/m1/../m2/a.jpg` }, P, "m1"), false, "traversal");
  assert.equal(isOwnUpload({ url: `https://x/storage/v1/object/public/products/property/portal/m1/a.jpg` }, P, "m1"), false, "a legacy url is not accepted");
});

test("ownFiles keeps only the member's uploads, as { id, label, bucket, path } without a client-supplied url", () => {
  const files = ownFiles([{ ...own("request/a.jpg"), name: "Leak.jpg", url: "https://evil" }, own("x.jpg"), { bucket: "property-files", path: `${OTHER}/portal/m1/b.jpg` }, null], ctx);
  assert.equal(files.length, 2);
  assert.deepEqual(Object.keys(files[0]).sort(), ["bucket", "id", "label", "path"]);
  assert.equal(files[0].label, "Leak.jpg");
  assert.equal(ownFiles("nope", ctx).length, 0);
  assert.equal(ownFiles([own("a"), own("b"), own("c")], ctx, 2).length, 2);
  assert.deepEqual(storedDocument(files[0]), { bucket: "property-files", path: files[0].path, name: "Leak.jpg" });
  assert.equal(storedDocument(undefined), null);
});

test("storePortalFile writes under the member's project prefix and returns a signed preview", async () => {
  const admin = fakeAdmin();
  const file = { name: "leak.png", type: "image/png", size: 10, arrayBuffer: async () => new ArrayBuffer(10) };
  const res = await storePortalFile(admin, { projectId: P, memberId: "m1" }, file, "request");
  assert.equal(res.ok, true);
  assert.equal(res.file.bucket, "property-files");
  assert.match(res.file.path, new RegExp(`^${P}/portal/m1/request/.+\\.png$`));
  assert.match(res.file.url, /token=t$/);
  assert.equal(admin.calls[1].ttl, 900, "a 15-minute preview");
  assert.equal((await storePortalFile(admin, { projectId: P, memberId: "m1" }, { ...file, type: "text/html" })).ok, false);
  assert.equal((await storePortalFile(admin, { projectId: null, memberId: "m1" }, file)).ok, false);
});

test("signPortalFiles signs the project's private refs for 15 minutes, blanks others and leaves the input alone", async () => {
  const admin = fakeAdmin();
  const payload = {
    requests: [{ photos: [own("request/a.jpg"), { id: "legacy", url: "https://old" }] }],
    policy: { document: { ...own("insurance/c.pdf"), name: "COI" } },
    foreign: { bucket: "property-files", path: `${OTHER}/unit/u/x.pdf`, url: "https://planted" },
    chat: { bucket: "property-chat", path: `${P}/u/x.png` },
    cover: { bucket: "property-public", path: `${P}/property/p/c.jpg` },
  };
  const out = await signPortalFiles(admin, P, payload);
  assert.match(out.requests[0].photos[0].url, /property-files\/.*request\/a\.jpg\?token=t$/);
  assert.equal(out.requests[0].photos[1].url, "https://old", "legacy url untouched");
  assert.match(out.policy.document.url, /insurance\/c\.pdf\?token=t$/);
  assert.equal(out.foreign.url, "", "another project's path is never signed");
  assert.equal(out.chat.url, "", "chat files are not portal files");
  assert.equal(out.cover.url, `https://s/public/property-public/${P}/property/p/c.jpg`);
  assert.equal(payload.policy.document.url, undefined, "the input is not mutated");
  const sign = admin.calls.filter((c) => c.op === "sign");
  assert.equal(sign.length, 1);
  assert.equal(sign[0].ttl, 900);
  assert.deepEqual(sign[0].paths.sort(), [own("insurance/c.pdf").path, own("request/a.jpg").path].sort());
});
