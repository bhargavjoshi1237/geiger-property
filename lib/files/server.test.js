import { test } from "node:test";
import assert from "node:assert/strict";
import { storeProjectFile } from "./server";

// PLAT-01g: server-generated files land in property-files inside their project.

const P = "ebcc7910-1a0e-4e91-8c3b-752f3c4292d3";

test("storeProjectFile uploads into the project's private folder and returns the ref", async () => {
  const calls = [];
  const admin = { storage: { from: (bucket) => ({ upload: async (path, body, opts) => (calls.push({ bucket, path, opts }), { error: null }) }) } };
  const ref = await storeProjectFile(admin, { projectId: P, ownerType: "lease", ownerId: "l-1", name: "Plan.txt", body: "x", contentType: "text/plain" });
  assert.equal(ref.bucket, "property-files");
  assert.match(ref.path, new RegExp(`^${P}/lease/l-1/.+\.txt$`));
  assert.deepEqual(calls[0].opts, { contentType: "text/plain", cacheControl: "3600", upsert: false });
  await assert.rejects(storeProjectFile(admin, { projectId: null, ownerType: "lease", ownerId: "l", name: "a.txt", body: "x" }), /project is required/);
  const failing = { storage: { from: () => ({ upload: async () => ({ error: { message: "denied" } }) }) } };
  await assert.rejects(storeProjectFile(failing, { projectId: P, ownerType: "lease", ownerId: "l", name: "a.txt", body: "x" }), /storage: denied/);
});
