import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { forProject } from "@/lib/supabase/scope";

// Per-project integration secrets (PLAT-01h): webhook signing secrets and provider tokens, never in settings.value (every member reads
// it). property.integration_secrets holds AES-256-GCM ciphertext under GEIGER_SECRETS_KEY and is closed to every client role, so
// these run with the service role. Envelope "v1.<key id>.<iv>.<tag>.<ciphertext>" (base64url), bound to its project and key name.
// Key rotation: set the new GEIGER_SECRETS_KEY, list the old one in GEIGER_SECRETS_KEY_PREVIOUS, then reencryptSecrets().

const TABLE = "integration_secrets";
const ALG = "aes-256-gcm";
const VERSION = "v1";
export const SECRET_KEY_PATTERN = /^[a-z][a-z0-9_.:-]{1,80}$/;

// A 32-byte key from base64 (44 chars) or hex (64 chars), else null.
export function parseKey(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

const keyIdOf = (key) => createHash("sha256").update(key).digest("hex").slice(0, 8);

function keyring(env = process.env) {
  const current = parseKey(env.GEIGER_SECRETS_KEY);
  const previous = String(env.GEIGER_SECRETS_KEY_PREVIOUS || "")
    .split(",")
    .map(parseKey)
    .filter(Boolean);
  return { current, all: [current, ...previous].filter(Boolean) };
}

export const isSecretsConfigured = (env = process.env) => Boolean(keyring(env).current);

const aad = ({ projectId, key }) => Buffer.from(`property:${projectId}:${key}`);

export function encryptSecret(plaintext, scope, env = process.env) {
  const { current } = keyring(env);
  if (!current) throw new Error("GEIGER_SECRETS_KEY isn't set (32 bytes, base64 or hex).");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, current, iv);
  cipher.setAAD(aad(scope));
  const body = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  return [VERSION, keyIdOf(current), iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

// The plaintext, or a thrown error for a tampered envelope, another project's or key's envelope, or an unknown key.
export function decryptSecret(envelope, scope, env = process.env) {
  const [version, kid, iv, tag, body] = String(envelope || "").split(".");
  if (version !== VERSION || !body) throw new Error("Not an integration secret envelope.");
  const key = keyring(env).all.find((k) => keyIdOf(k) === kid);
  if (!key) throw new Error("This secret was encrypted with a key that isn't configured (GEIGER_SECRETS_KEY / _PREVIOUS).");
  const decipher = createDecipheriv(ALG, key, Buffer.from(iv, "base64url"));
  decipher.setAAD(aad(scope));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

// True when the envelope isn't under the current key (reencryptSecrets() moves it).
export const needsReencrypt = (envelope, env = process.env) => {
  const { current } = keyring(env);
  return Boolean(current) && String(envelope || "").split(".")[1] !== keyIdOf(current);
};

function checkScope(projectId, key) {
  if (!projectId) throw new Error("A project is required for an integration secret.");
  if (!SECRET_KEY_PATTERN.test(String(key || ""))) throw new Error(`"${key}" isn't a valid secret name.`);
}

async function liveRow(admin, projectId, key) {
  const { data, error } = await forProject(admin.from(TABLE).select("id, ciphertext").eq("key", key).is("deleted_at", null), projectId).limit(1);
  if (error) throw new Error(`integration_secrets: ${error.message}`);
  return data?.[0] || null;
}

// Store or replace one secret → { ok: true, rotated }; replacing stamps rotated_at.
export async function putSecret(admin, projectId, key, value, { actorId = null, env = process.env } = {}) {
  checkScope(projectId, key);
  if (value == null || value === "") throw new Error("A secret value is required.");
  const ciphertext = encryptSecret(value, { projectId, key }, env);
  const row = await liveRow(admin, projectId, key);
  const { error } = row
    ? await admin.from(TABLE).update({ ciphertext, rotated_at: new Date().toISOString() }).eq("id", row.id)
    : await admin.from(TABLE).insert({ project_id: projectId, key, ciphertext, created_by: actorId });
  if (error) throw new Error(`integration_secrets: ${error.message}`);
  return { ok: true, rotated: Boolean(row) };
}

// The plaintext, or null when the project has no such secret.
export async function getSecret(admin, projectId, key, { env = process.env } = {}) {
  checkScope(projectId, key);
  const row = await liveRow(admin, projectId, key);
  return row ? decryptSecret(row.ciphertext, { projectId, key }, env) : null;
}

// Names and dates only, never values: [{ key, createdAt, rotatedAt, needsReencrypt }].
export async function listSecrets(admin, projectId, { env = process.env } = {}) {
  checkScope(projectId, "list");
  const { data, error } = await forProject(admin.from(TABLE).select("key, ciphertext, created_at, rotated_at").is("deleted_at", null), projectId).order("key");
  if (error) throw new Error(`integration_secrets: ${error.message}`);
  return (data || []).map((r) => ({ key: r.key, createdAt: r.created_at, rotatedAt: r.rotated_at, needsReencrypt: needsReencrypt(r.ciphertext, env) }));
}

// Soft delete (the row keeps its ciphertext until the project is deleted).
export async function deleteSecret(admin, projectId, key) {
  checkScope(projectId, key);
  const { error } = await forProject(admin.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("key", key).is("deleted_at", null), projectId);
  if (error) throw new Error(`integration_secrets: ${error.message}`);
  return true;
}

// After a key rotation: re-encrypt every live row of a project still under a previous key → how many moved.
export async function reencryptSecrets(admin, projectId, { env = process.env } = {}) {
  checkScope(projectId, "reencrypt");
  const { data, error } = await forProject(admin.from(TABLE).select("id, key, ciphertext").is("deleted_at", null), projectId);
  if (error) throw new Error(`integration_secrets: ${error.message}`);
  let moved = 0;
  for (const r of data || []) {
    if (!needsReencrypt(r.ciphertext, env)) continue;
    const scope = { projectId, key: r.key };
    const ciphertext = encryptSecret(decryptSecret(r.ciphertext, scope, env), scope, env);
    const { error: e } = await admin.from(TABLE).update({ ciphertext, rotated_at: new Date().toISOString() }).eq("id", r.id);
    if (e) throw new Error(`integration_secrets: ${e.message}`);
    moved += 1;
  }
  return moved;
}
