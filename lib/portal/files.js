import { PORTAL_BUCKET, portalUploadPrefix } from "./constants";

// Server-only portal uploads: files go to the shared public bucket under the
// member's own prefix (property/portal/<memberId>/<purpose>/…) via the
// service-role client, so portal users never need storage write rights. Records
// may only reference URLs inside the uploader's prefix (isOwnUpload).

const MAX_BYTES = 10 * 1024 * 1024;
const PURPOSES = ["request", "insurance", "work_order", "invoice", "compliance", "message", "other"];

const extOf = (file) => {
  const fromName = String(file?.name || "").split(".").pop();
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) return fromName.toLowerCase();
  return String(file?.type || "").split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
};

const allowedType = (type) => /^image\//.test(type) || type === "application/pdf";

export async function storePortalFile(admin, memberId, file, purpose = "other") {
  if (!file || typeof file.arrayBuffer !== "function") return { ok: false, error: "Choose a file to upload." };
  const type = file.type || "application/octet-stream";
  if (!allowedType(type)) return { ok: false, error: "Upload a photo or a PDF." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Files must be 10 MB or smaller." };
  const folder = PURPOSES.includes(purpose) ? purpose : "other";
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const path = `${portalUploadPrefix(memberId)}/${folder}/${stamp}-${Math.random().toString(36).slice(2, 8)}.${extOf(file)}`;
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage
      .from(PORTAL_BUCKET)
      .upload(path, bytes, { contentType: type, cacheControl: "3600", upsert: false });
    if (error) {
      console.error("[portal.upload]", error.message);
      return { ok: false, error: "The upload failed. Try again." };
    }
    const { data } = admin.storage.from(PORTAL_BUCKET).getPublicUrl(path);
    return { ok: true, file: { url: data?.publicUrl || "", path, name: String(file.name || "file").slice(0, 200), size: file.size, type } };
  } catch (e) {
    console.error("[portal.upload]", e);
    return { ok: false, error: "The upload failed. Try again." };
  }
}

// True when `url` is a public object inside this member's upload prefix.
export function isOwnUpload(url, memberId) {
  if (typeof url !== "string" || !memberId) return false;
  return url.includes(`/object/public/${PORTAL_BUCKET}/${portalUploadPrefix(memberId)}/`);
}

// Untrusted [{ url, name }] → the member's own uploads as { id, label, url }.
export function ownFiles(list, memberId, max = 12) {
  return (Array.isArray(list) ? list : [])
    .filter((f) => isOwnUpload(f?.url, memberId))
    .slice(0, max)
    .map((f) => ({ id: crypto.randomUUID(), label: String(f.name || f.label || "Photo").slice(0, 200), url: f.url }));
}
