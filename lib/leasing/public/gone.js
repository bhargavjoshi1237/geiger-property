import { adminClient } from "@/lib/supabase/admin";
import { isValidHandle } from "@/lib/leasing/slug";

// Proxy check (LEAS-01): is /l/<handle>/<slug> a listing that has been leased or archived? proxy.js rewrites those to
// the "no longer available" page with HTTP 410. Answers are kept per instance for the public cache window.

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;
const SLUG = /^[a-z0-9-]{1,80}$/;
const GONE = new Set(["Leased", "Archived"]);
const memo = new Map();

// Second path segments that are routes of their own, not listings.
const NOT_LISTINGS = new Set(["embed", "p", "sitemap.xml"]);

// "/l/<handle>/<slug>" (with or without the /property basePath) → { handle, slug }, else null.
export function listingPathParts(pathname) {
  const m = /^(?:\/property)?\/l\/([^/]+)\/([^/]+)\/?$/.exec(pathname || "");
  if (!m || NOT_LISTINGS.has(m[2]) || !isValidHandle(m[1]) || !SLUG.test(m[2])) return null;
  return { handle: m[1], slug: m[2] };
}

async function lookup(handle, slug) {
  const db = adminClient({ source: "leasing-site" });
  if (!db) return false;
  const site = await db.from("leasing_sites").select("project_id").eq("handle", handle).eq("enabled", true).is("deleted_at", null).limit(1);
  const projectId = site.data?.[0]?.project_id;
  if (site.error || !projectId) return false;
  const listing = await db.from("listings").select("status").eq("project_id", projectId).eq("slug", slug).is("deleted_at", null).limit(1);
  return !listing.error && GONE.has(listing.data?.[0]?.status);
}

// isListingGone(handle, slug) → true only for a leased or archived listing of an enabled site; failures say "not gone".
export async function isListingGone(handle, slug) {
  const key = `${handle}/${slug}`;
  const hit = memo.get(key);
  if (hit && hit.at > Date.now() - TTL_MS) return hit.gone;
  let gone = false;
  try {
    gone = await lookup(handle, slug);
  } catch (e) {
    console.error("[leasing.gone]", e?.message || e);
  }
  if (memo.size >= MAX_ENTRIES) memo.delete(memo.keys().next().value);
  memo.set(key, { gone, at: Date.now() });
  return gone;
}
