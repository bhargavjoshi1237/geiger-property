import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

import { isUuid } from "@/lib/files/refs";

export { SENSITIVE_KEYS, isSensitiveKey, redactSensitive, redactChanges } from "./sensitive";

// Screening data protection, server side (RISK-02): keyed fingerprints for duplicate and fraud checks (never the value itself),
// the append-only access log, and AES-256-GCM sealing for any value that must be stored (the current design stores none).
// Full SSNs, ID numbers and bank accounts are never stored: a vendor that needs one gets it in memory, and Geiger keeps the digest and last 4.

export const FINGERPRINT_KINDS = Object.freeze(["ssn", "email", "phone", "dob_name", "id_document", "bank_account", "document_sha256", "ip"]);
// Kinds a party has one of: a new value replaces the old digest.
const SINGLE_KINDS = new Set(["ssn", "email", "phone", "dob_name", "id_document", "ip"]);

const digits = (v) => String(v ?? "").replace(/\D/g, "");
const fold = (v) => String(v ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const normalizeSsn = (v) => {
  const d = digits(v);
  return d.length === 9 ? d : "";
};

// Lower-cased, trimmed, without a +tag.
export function normalizeEmail(v) {
  const s = String(v ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1 || at === s.length - 1) return "";
  const local = s.slice(0, at).split("+")[0];
  return local ? `${local}@${s.slice(at + 1)}` : "";
}

// Digits only, without a leading US country code.
export function normalizePhone(v) {
  let d = digits(v);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 7 ? d : "";
}

// "<YYYY-MM-DD>|<name letters>" from { dob, name }.
export function normalizeDobName(v) {
  const dob = String(v?.dob ?? "").trim();
  const name = fold(v?.name).replace(/[^a-z]+/g, " ").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(dob) && name ? `${dob}|${name}` : "";
}

const alnum = (v) => String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

// "<TYPE>|<NUMBER>" from { type, number }, or a bare number.
function normalizeIdDocument(v) {
  if (!v || typeof v !== "object") return alnum(v);
  const [type, number] = [alnum(v.type), alnum(v.number)];
  return type && number ? `${type}|${number}` : "";
}

// "<routing>|<account>" from { routing, account }, or a bare account number.
function normalizeBankAccount(v) {
  if (!v || typeof v !== "object") return digits(v);
  const account = digits(v.account);
  return account ? `${digits(v.routing)}|${account}` : "";
}

const NORMALIZE = {
  ssn: normalizeSsn,
  email: normalizeEmail,
  phone: normalizePhone,
  dob_name: normalizeDobName,
  id_document: normalizeIdDocument,
  bank_account: normalizeBankAccount,
  document_sha256: (v) => (/^[0-9a-f]{64}$/i.test(String(v ?? "")) ? String(v).toLowerCase() : ""),
  ip: (v) => String(v ?? "").trim().toLowerCase(),
};

export const normalizeFingerprint = (kind, value) => (NORMALIZE[kind] ? NORMALIZE[kind](value) : "");

// The last 4 kept beside an SSN, ID or bank account digest; null for every other kind.
export function last4Of(kind, value) {
  if (kind === "ssn") return normalizeSsn(value).slice(-4) || null;
  if (kind === "bank_account") return digits(value && typeof value === "object" ? value.account : value).slice(-4) || null;
  if (kind === "id_document") return alnum(value && typeof value === "object" ? value.number : value).slice(-4) || null;
  return null;
}

// HMAC-SHA256(SCREENING_FINGERPRINT_KEY, "<projectId>:<kind>:<normalized>") hex, or null for an empty value; the project in the
// input keeps digests from comparing across companies.
export function fingerprint(projectId, kind, value, secret = process.env.SCREENING_FINGERPRINT_KEY) {
  if (!secret) throw new Error("SCREENING_FINGERPRINT_KEY isn't set.");
  if (!isUuid(projectId)) throw new Error("A project is required for a fingerprint.");
  if (!FINGERPRINT_KINDS.includes(kind)) throw new Error(`Unknown fingerprint kind: ${kind}`);
  const normalized = normalizeFingerprint(kind, value);
  return normalized ? createHmac("sha256", secret).update(`${projectId}:${kind}:${normalized}`).digest("hex") : null;
}

// { kind: value } → rows to store ({ kind, digest, last4 }), skipping empty values.
export function fingerprintRows(projectId, values, secret) {
  const rows = [];
  for (const [kind, value] of Object.entries(values || {})) {
    if (!FINGERPRINT_KINDS.includes(kind)) continue;
    const digest = fingerprint(projectId, kind, value, secret);
    if (digest) rows.push({ kind, digest, last4: last4Of(kind, value) });
  }
  return rows;
}

// Store a party's fingerprints (service role): new digests are added, a single-valued kind's old digest is soft-deleted.
// Best effort: without SCREENING_FINGERPRINT_KEY it records nothing and says so.
export async function storeFingerprints(admin, { projectId, applicationId, partyRef = "primary", values, actorId = null }, secret = process.env.SCREENING_FINGERPRINT_KEY) {
  if (!secret) {
    console.warn("[screening.fingerprints] SCREENING_FINGERPRINT_KEY isn't set; no fingerprints stored.");
    return { ok: false, skipped: true, added: 0 };
  }
  const rows = fingerprintRows(projectId, values, secret);
  if (!rows.length) return { ok: true, added: 0 };
  const existing = await admin
    .from("applicant_fingerprints")
    .select("id, kind, digest")
    .eq("project_id", projectId)
    .eq("application_id", applicationId)
    .eq("party_ref", partyRef)
    .is("deleted_at", null);
  if (existing.error) throw new Error(existing.error.message);
  const have = existing.data || [];
  const known = new Set(have.map((r) => `${r.kind}:${r.digest}`));
  const add = rows.filter((r) => !known.has(`${r.kind}:${r.digest}`));
  const stale = have.filter((r) => SINGLE_KINDS.has(r.kind) && rows.some((n) => n.kind === r.kind) && !rows.some((n) => n.kind === r.kind && n.digest === r.digest));
  if (stale.length) {
    const { error } = await admin.from("applicant_fingerprints").update({ deleted_at: new Date().toISOString() }).in("id", stale.map((r) => r.id));
    if (error) throw new Error(error.message);
  }
  if (add.length) {
    const { error } = await admin
      .from("applicant_fingerprints")
      .insert(add.map((r) => ({ project_id: projectId, application_id: applicationId, party_ref: partyRef, kind: r.kind, digest: r.digest, last4: r.last4, created_by: actorId })));
    if (error) throw new Error(error.message);
  }
  return { ok: true, added: add.length };
}

export const ACCESS_OBJECTS = Object.freeze(["report", "order", "identity", "income", "document", "notice"]);
export const ACCESS_ACTIONS = Object.freeze(["view", "download", "export", "print", "dispose"]);

// The caller's address and browser from a request's headers.
export function requestOrigin(request) {
  const h = request?.headers;
  const forwarded = h?.get?.("x-forwarded-for") || "";
  return {
    ip: (forwarded.split(",")[0] || h?.get?.("x-real-ip") || "").trim().slice(0, 64) || null,
    userAgent: (h?.get?.("user-agent") || "").slice(0, 300) || null,
  };
}

// Append one access row (service role); throws when it can't be written, so the caller serves nothing unlogged.
export async function logScreeningAccess(admin, { projectId, actor, applicationId = null, objectType, objectId = null, action = "view", request = null, metadata = {} }) {
  if (!ACCESS_OBJECTS.includes(objectType)) throw new Error(`Unknown screening object: ${objectType}`);
  if (!ACCESS_ACTIONS.includes(action)) throw new Error(`Unknown screening action: ${action}`);
  const { ip, userAgent } = requestOrigin(request);
  const { error } = await admin.from("screening_access_log").insert({
    project_id: projectId,
    actor_id: actor?.id || null,
    actor_name: String(actor?.name || actor?.email || "").slice(0, 200),
    application_id: applicationId,
    object_type: objectType,
    object_id: objectId ? String(objectId).slice(0, 500) : null,
    action,
    ip,
    user_agent: userAgent,
    metadata,
  });
  if (error) throw new Error(`access log: ${error.message}`);
}

// SCREENING_DATA_KEY: 32 bytes as hex or base64.
function dataKey(secret = process.env.SCREENING_DATA_KEY) {
  if (!secret) throw new Error("SCREENING_DATA_KEY isn't set.");
  const key = /^[0-9a-f]{64}$/i.test(secret) ? Buffer.from(secret, "hex") : Buffer.from(secret, "base64");
  if (key.length !== 32) throw new Error("SCREENING_DATA_KEY must be 32 bytes (64 hex characters or base64).");
  return key;
}

// AES-256-GCM: "v1.<iv>.<tag>.<ciphertext>" (base64url), for a value that must be stored at all.
export function sealValue(plain, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(secret), iv);
  const body = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function openValue(sealed, secret) {
  const [v, iv, tag, body] = String(sealed ?? "").split(".");
  if (v !== "v1" || !iv || !tag || body === undefined) throw new Error("Not a sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
