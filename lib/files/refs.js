// File references (PLAT-01g): a stored file is { bucket, path } in a Property bucket (path = <projectId>/…); legacy and external files are a plain { url }.

export const FILES_BUCKET = "property-files";
export const PUBLIC_BUCKET = "property-public";
export const CHAT_BUCKET = "property-chat";
export const INTAKE_BUCKET = "property-private";
export const PRIVATE_BUCKETS = [FILES_BUCKET, CHAT_BUCKET, INTAKE_BUCKET];
export const BUCKETS = [...PRIVATE_BUCKETS, PUBLIC_BUCKET];

// Signed-URL lifetimes in seconds: staff screens, and portal responses (15 minutes).
export const SIGNED_TTL = 3600;
export const PORTAL_TTL = 900;

// The pre-01g public URLs in the suite-shared products bucket, and their object prefix.
export const LEGACY_BUCKET = "products";
export const LEGACY_PREFIX = "property/";
export const LEGACY_MARKER = `/object/public/${LEGACY_BUCKET}/${LEGACY_PREFIX}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID.test(v);

// { bucket, path, url } from a row, view model or metadata item (path | storagePath | storage_path); null when it names no file.
export function fileRef(src, fallbackUrl = "") {
  const s = src && typeof src === "object" ? src : {};
  const path = s.path ?? s.storagePath ?? s.storage_path ?? "";
  const url = (typeof s.url === "string" && s.url) || (typeof fallbackUrl === "string" && fallbackUrl) || "";
  if (BUCKETS.includes(s.bucket) && typeof path === "string" && path) return { bucket: s.bucket, path, url };
  return url ? { bucket: null, path: null, url } : null;
}

// The file behind a `<x>Url` field: its `<x>File` ref when stored, else the plain URL.
export const fieldFile = (item, urlKey) => fileRef(item?.[urlKey.replace(/Url$/, "File")], item?.[urlKey]);

// The uploaded file next to a link field (`documentUrl` / `documentLink` → `documentFile`), with its name; null when there is none.
export function storedFileOf(item, key) {
  const name = `${String(key).replace(/(Url|Link)$/, "")}File`;
  const src = item?.metadata?.[name] ?? item?.[name];
  const ref = fileRef(src);
  return ref?.bucket ? { ...ref, name: typeof src?.name === "string" ? src.name : "" } : null;
}

export const isStored = (ref) => Boolean(ref?.bucket && ref?.path);
export const isPrivate = (ref) => isStored(ref) && PRIVATE_BUCKETS.includes(ref.bucket);
export const refKey = (ref) => (isStored(ref) ? `${ref.bucket}/${ref.path}` : ref?.url || "");
export const isPdf = (ref) => /\.pdf($|\?)/i.test(ref?.path || ref?.url || "");

// One path segment: letters, digits, _ and - only.
export const safeSegment = (v, fallback = "misc") =>
  String(v ?? "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || fallback;

function extOf(name, type) {
  const fromName = String(name || "").split(".").pop();
  if (fromName && fromName !== name && fromName.length <= 5 && /^[a-z0-9]+$/i.test(fromName)) return fromName.toLowerCase();
  return String(type || "").split("/")[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 5).toLowerCase() || "bin";
}

// A collision-free object name that keeps the extension: <timestamp>-<random>.<ext>.
export function uniqueName(name, type, now = new Date()) {
  const ts = now.toISOString().replace(/[.:]/g, "-");
  return `${ts}-${Math.random().toString(36).slice(2, 8)}.${extOf(name, type)}`;
}

// <projectId>/<ownerType>/<ownerId>/<file>; throws without a project, so nothing lands outside one.
export function objectPath(projectId, ownerType, ownerId, fileName) {
  if (!isUuid(projectId)) throw new Error("A project is required to store a file.");
  return `${projectId}/${safeSegment(ownerType)}/${safeSegment(ownerId, "unassigned")}/${fileName}`;
}

// Portal uploads: <projectId>/portal/<memberId>.
export const portalPrefix = (projectId, memberId) => `${projectId}/portal/${memberId}`;

// True when `path` sits under `prefix` with no relative segments.
export const inPrefix = (path, prefix) =>
  typeof path === "string" && Boolean(prefix) && path.startsWith(`${prefix}/`) && !path.split("/").some((p) => p === ".." || p === ".");

// The products object path ("property/…") behind a legacy public URL, or null.
export function legacyPath(url) {
  if (typeof url !== "string") return null;
  const at = url.indexOf(LEGACY_MARKER);
  if (at === -1) return null;
  let path = url.slice(at + LEGACY_MARKER.length - LEGACY_PREFIX.length).split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  return inPrefix(path, LEGACY_PREFIX.slice(0, -1)) ? path : null;
}

// Where storage-migrate copies a legacy object: <projectId>/<the path without property/>.
export function migratedPath(projectId, legacy) {
  if (!isUuid(projectId) || !legacy?.startsWith(LEGACY_PREFIX)) return null;
  return `${projectId}/${legacy.slice(LEGACY_PREFIX.length)}`;
}

// Every { bucket, path } file ref inside a JSON value (arrays and nested objects), in walk order.
export function collectRefs(value, out = []) {
  if (Array.isArray(value)) {
    for (const v of value) collectRefs(v, out);
  } else if (value && typeof value === "object") {
    if (BUCKETS.includes(value.bucket) && typeof value.path === "string" && value.path) out.push(value);
    for (const v of Object.values(value)) if (v && typeof v === "object") collectRefs(v, out);
  }
  return out;
}
