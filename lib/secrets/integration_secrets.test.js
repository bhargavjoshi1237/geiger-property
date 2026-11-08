import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { decryptSecret, deleteSecret, encryptSecret, getSecret, isSecretsConfigured, listSecrets, needsReencrypt, parseKey, putSecret, reencryptSecrets } from "./integration_secrets.js";

const KEY = randomBytes(32).toString("base64");
const env = { GEIGER_SECRETS_KEY: KEY };
const scope = { projectId: "p1", key: "webhook.signing" };

// In-memory property.integration_secrets behind the supabase-js calls the module makes.
function fakeAdmin() {
  const rows = [];
  const query = (op, payload) => {
    const filters = [];
    const q = {
      select: () => q,
      eq: (c, v) => (filters.push((r) => r[c] === v), q),
      is: (c, v) => (filters.push((r) => (r[c] ?? null) === v), q),
      order: () => q,
      limit: () => q,
      then(resolve) {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "insert") rows.push({ id: String(rows.length + 1), deleted_at: null, rotated_at: null, created_at: "now", ...payload });
        if (op === "update") hit.forEach((r) => Object.assign(r, payload));
        resolve({ data: op === "select" ? hit.map((r) => ({ ...r })) : null, error: null });
      },
    };
    return q;
  };
  return { rows, from: () => ({ select: () => query("select"), insert: (p) => query("insert", p), update: (p) => query("update", p) }) };
}

test("secrets: AES-256-GCM envelopes round-trip and are bound to their project and key", () => {
  const env1 = encryptSecret("whsec_123", scope, env);
  assert.match(env1, /^v1\.[0-9a-f]{8}\./);
  assert.ok(!env1.includes("whsec_123"));
  assert.equal(decryptSecret(env1, scope, env), "whsec_123");
  assert.notEqual(encryptSecret("whsec_123", scope, env), env1, "a fresh IV each time");
  assert.throws(() => decryptSecret(env1, { ...scope, projectId: "p2" }, env), "another project's row can't borrow it");
  assert.throws(() => decryptSecret(env1, { ...scope, key: "quickbooks.oauth" }, env));
  const [v, kid, iv, tag, body] = env1.split(".");
  const flipped = Buffer.from(body, "base64url");
  flipped[0] ^= 1;
  assert.throws(() => decryptSecret([v, kid, iv, tag, flipped.toString("base64url")].join("."), scope, env), "tampering fails the tag");
  assert.throws(() => decryptSecret(env1, scope, { GEIGER_SECRETS_KEY: randomBytes(32).toString("base64") }), /isn't configured/);
});

test("secrets: keys parse from base64 or hex; nothing works without one", () => {
  assert.equal(parseKey(randomBytes(32).toString("hex")).length, 32);
  assert.equal(parseKey("too-short"), null);
  assert.equal(isSecretsConfigured({}), false);
  assert.throws(() => encryptSecret("x", scope, {}), /GEIGER_SECRETS_KEY/);
});

test("secrets: put, rotate, list (no values), get and soft delete through the service role", async () => {
  const admin = fakeAdmin();
  assert.deepEqual(await putSecret(admin, "p1", "webhook.signing", "whsec_1", { env, actorId: "u1" }), { ok: true, rotated: false });
  assert.equal(admin.rows[0].project_id, "p1");
  assert.ok(!JSON.stringify(admin.rows).includes("whsec_1"), "only ciphertext is stored");
  assert.deepEqual(await putSecret(admin, "p1", "webhook.signing", "whsec_2", { env }), { ok: true, rotated: true });
  assert.equal(admin.rows.length, 1);
  assert.ok(admin.rows[0].rotated_at);
  assert.equal(await getSecret(admin, "p1", "webhook.signing", { env }), "whsec_2");
  assert.equal(await getSecret(admin, "p2", "webhook.signing", { env }), null, "another project reads nothing");
  const list = await listSecrets(admin, "p1", { env });
  assert.deepEqual(list.map((s) => [s.key, s.needsReencrypt]), [["webhook.signing", false]]);
  assert.ok(!JSON.stringify(list).includes("v1."), "no ciphertext in the listing");
  await deleteSecret(admin, "p1", "webhook.signing");
  assert.equal(await getSecret(admin, "p1", "webhook.signing", { env }), null);
  await assert.rejects(putSecret(admin, null, "webhook.signing", "x", { env }), /project is required/);
  await assert.rejects(putSecret(admin, "p1", "Bad Name", "x", { env }), /valid secret name/);
});

test("secrets: a key rotation keeps old envelopes readable until they are re-encrypted", async () => {
  const admin = fakeAdmin();
  await putSecret(admin, "p1", "screening.token", "tok", { env });
  const next = { GEIGER_SECRETS_KEY: randomBytes(32).toString("base64"), GEIGER_SECRETS_KEY_PREVIOUS: KEY };
  assert.equal(needsReencrypt(admin.rows[0].ciphertext, next), true);
  assert.equal(await getSecret(admin, "p1", "screening.token", { env: next }), "tok");
  assert.equal(await reencryptSecrets(admin, "p1", { env: next }), 1);
  assert.equal(await getSecret(admin, "p1", "screening.token", { env: { GEIGER_SECRETS_KEY: next.GEIGER_SECRETS_KEY } }), "tok");
  assert.equal(await reencryptSecrets(admin, "p1", { env: next }), 0);
});
