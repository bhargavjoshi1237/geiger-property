import { FILES_BUCKET, PORTAL_TTL, PUBLIC_BUCKET, collectRefs, inPrefix, portalPrefix, uniqueName } from "@/lib/files/refs";

// Server-only portal files (PLAT-01g): the service role stores uploads in the private property-files bucket under the member's own
// prefix (<projectId>/portal/<memberId>/<purpose>/…), so portal users never hold storage rights. Records keep { bucket, path } and
// may only reference the uploader's own prefix (isOwnUpload); every portal response carries 15-minute signed URLs (signPortalFiles).

const MAX_BYTES = 10 * 1024 * 1024;
const PURPOSES = ["request", "insurance", "work_order", "invoice", "compliance", "message", "other"];

const allowedType = (type) => /^image\//.test(type) || type === "application/pdf";

// Signed URLs for paths in one bucket → Map(path → url); missing or failed paths are left out.
async function signPaths(admin, bucket, paths, ttl) {
  const out = new Map();
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths.slice(i, i + 100), ttl);
    if (error) {
      console.error("[portal.files.sign]", error.message);
      continue;
    }
    for (const d of data || []) if (d?.signedUrl && !d.error) out.set(d.path, d.signedUrl);
  }
  return out;
}

// Store one upload for the member (`who` = { projectId, memberId }) → { ok, file: { bucket, path, name, size, type, url } } (url: a preview link).
export async function storePortalFile(admin, who, file, purpose = "other") {
  if (!file || typeof file.arrayBuffer !== "function") return { ok: false, error: "Choose a file to upload." };
  if (!who?.projectId || !who?.memberId) return { ok: false, error: "The upload failed. Try again." };
  const type = file.type || "application/octet-stream";
  if (!allowedType(type)) return { ok: false, error: "Upload a photo or a PDF." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Files must be 10 MB or smaller." };
  const folder = PURPOSES.includes(purpose) ? purpose : "other";
  const path = `${portalPrefix(who.projectId, who.memberId)}/${folder}/${uniqueName(file.name, type)}`;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(FILES_BUCKET).upload(path, bytes, { contentType: type, cacheControl: "3600", upsert: false });
    if (error) {
      console.error("[portal.upload]", error.message);
      return { ok: false, error: "The upload failed. Try again." };
    }
    const url = (await signPaths(admin, FILES_BUCKET, [path], PORTAL_TTL)).get(path) || "";
    return { ok: true, file: { bucket: FILES_BUCKET, path, name: String(file.name || "file").slice(0, 200), size: file.size, type, url } };
  } catch (e) {
    console.error("[portal.upload]", e);
    return { ok: false, error: "The upload failed. Try again." };
  }
}

// True when `ref` is a property-files object inside this member's own upload prefix.
export function isOwnUpload(ref, projectId, memberId) {
  if (!ref || ref.bucket !== FILES_BUCKET || !projectId || !memberId) return false;
  return inPrefix(ref.path, portalPrefix(projectId, memberId));
}

// Untrusted [{ bucket, path, name }] → the member's own uploads as { id, label, bucket, path } (ctx: the portal context).
export function ownFiles(list, ctx, max = 12) {
  const projectId = ctx?.projectId;
  const memberId = ctx?.member?.id;
  return (Array.isArray(list) ? list : [])
    .filter((f) => isOwnUpload(f, projectId, memberId))
    .slice(0, max)
    .map((f) => ({ id: crypto.randomUUID(), label: String(f.name || f.label || "Photo").slice(0, 200), bucket: FILES_BUCKET, path: f.path }));
}

// A single uploaded document as a metadata ref ({ bucket, path, name }), or null.
export const storedDocument = (file) => (file ? { bucket: file.bucket, path: file.path, name: file.label || file.name || "" } : null);

// Give every { bucket, path } ref in a portal payload a short-lived `url` (a copy; the payload is not changed). Only the member's
// project's property-files objects are signed; anything else gets no link.
export async function signPortalFiles(admin, projectId, payload, ttl = PORTAL_TTL) {
  const copy = structuredClone(payload);
  const refs = collectRefs(copy);
  if (!refs.length) return copy;
  const signable = refs.filter((r) => r.bucket === FILES_BUCKET && inPrefix(r.path, projectId));
  let urls = new Map();
  try {
    urls = signable.length ? await signPaths(admin, FILES_BUCKET, [...new Set(signable.map((r) => r.path))], ttl) : urls;
  } catch (e) {
    console.error("[portal.files.sign]", e);
  }
  for (const r of refs) {
    if (r.bucket === PUBLIC_BUCKET && inPrefix(r.path, projectId)) r.url = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(r.path).data?.publicUrl || "";
    else r.url = signable.includes(r) ? urls.get(r.path) || "" : "";
  }
  return copy;
}
