import "server-only";
import { createHash } from "node:crypto";

import { FILES_BUCKET, SCREENING_BUCKET, inPrefix, isUuid, objectPath, uniqueName } from "@/lib/files/refs";

// Screening files (RISK-02): an application's IDs, pay stubs, reports and notices live in the private property-screening bucket
// under <projectId>/application/<applicationId>/, written and signed by the service role only (the bucket has no client policy).
// Signed URLs last 5 minutes at most; older application files in property-files are signed the same way.

export const SCREENING_TTL = 300;
export const SCREENING_MAX_BYTES = 10 * 1024 * 1024;

const allowedType = (type) => /^image\//.test(type) || type === "application/pdf";

// { bucket, path, applicationId } when the object is an application file inside the project; null otherwise.
export function screeningFileRef(projectId, bucket, path) {
  if (![SCREENING_BUCKET, FILES_BUCKET].includes(bucket) || !isUuid(projectId)) return null;
  const parts = String(path || "").split("/");
  if (!inPrefix(path, `${projectId}/application`) || parts.length < 4 || !isUuid(parts[2]) || !parts[3]) return null;
  return { bucket, path, applicationId: parts[2] };
}

// Store one upload for an application → { ok, file: { bucket, path, name, size, type, sha256 } } or { ok: false, error }.
export async function uploadScreeningFile(admin, { projectId, applicationId, file }) {
  if (!file || typeof file.arrayBuffer !== "function") return { ok: false, error: "Choose a file to upload." };
  const type = file.type || "application/octet-stream";
  if (!allowedType(type)) return { ok: false, error: "Upload a photo or a PDF." };
  if (file.size > SCREENING_MAX_BYTES) return { ok: false, error: "Files must be 10 MB or smaller." };
  const path = objectPath(projectId, "application", applicationId, uniqueName(file.name, type));
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(SCREENING_BUCKET).upload(path, bytes, { contentType: type, cacheControl: "0", upsert: false });
  if (error) throw new Error(`storage: ${error.message}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { ok: true, file: { bucket: SCREENING_BUCKET, path, name: String(file.name || "file").slice(0, 200), size: file.size, type, sha256 } };
}

// A signed URL for one screening object, never longer than 5 minutes; `download` names the saved file.
export async function signedScreeningUrl(admin, path, ttl = SCREENING_TTL, { bucket = SCREENING_BUCKET, download = null } = {}) {
  const seconds = Math.max(1, Math.min(SCREENING_TTL, Math.floor(Number(ttl)) || SCREENING_TTL));
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, seconds, download ? { download } : undefined);
  if (error || !data?.signedUrl) throw new Error(`sign: ${error?.message || "no URL"}`);
  return { url: data.signedUrl, expiresIn: seconds };
}
