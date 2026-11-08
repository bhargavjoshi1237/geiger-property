"use client";

import { useEffect, useState } from "react";
import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { PRIVATE_BUCKETS, PUBLIC_BUCKET, SIGNED_TTL, fileRef, isPrivate, isStored, refKey } from "@/lib/files/refs";

// Browser file URLs (PLAT-01g): private objects open through short-lived signed URLs (the caller's storage policies decide who may sign),
// property-public objects through their public URL, legacy and external files as stored. Signed URLs are cached per path until near expiry.

const CHUNK = 100;
const REFRESH_MS = 5 * 60 * 1000;
const cache = new Map();

// A cached signed URL with more than five minutes left, else "".
function cached(key, now = Date.now()) {
  const hit = cache.get(key);
  return hit && hit.expiresAt - REFRESH_MS > now ? hit.url : "";
}

// A URL usable right now: the public or plain URL, or a cached signed URL ("" until signed).
export function urlFor(ref) {
  if (!ref) return "";
  if (isPrivate(ref)) return cached(refKey(ref));
  if (!isStored(ref)) return ref.url || "";
  if (ref.bucket !== PUBLIC_BUCKET || !isSupabaseConfigured()) return ref.url || "";
  return createClient().storage.from(PUBLIC_BUCKET).getPublicUrl(ref.path).data?.publicUrl || ref.url || "";
}

// URLs for many refs → Map(refKey → url): one createSignedUrls call per bucket (chunked), each path cached until shortly before it expires.
export async function signedUrls(refs, ttl = SIGNED_TTL) {
  const out = new Map();
  const need = new Map();
  for (const ref of refs || []) {
    if (!ref) continue;
    const key = refKey(ref);
    const now = urlFor(ref);
    if (now || !isPrivate(ref)) out.set(key, now);
    else need.set(ref.bucket, (need.get(ref.bucket) || new Set()).add(ref.path));
  }
  if (!need.size || !isSupabaseConfigured()) return out;
  const storage = createClient().storage;
  await Promise.all(
    [...need].map(async ([bucket, set]) => {
      const paths = [...set];
      for (let i = 0; i < paths.length; i += CHUNK) {
        try {
          const expiresAt = Date.now() + ttl * 1000;
          const { data, error } = await storage.from(bucket).createSignedUrls(paths.slice(i, i + CHUNK), ttl);
          if (error) {
            console.error("[file_urls.sign]", error.message);
            continue;
          }
          for (const d of data || []) {
            if (!d?.signedUrl || d.error) continue;
            cache.set(`${bucket}/${d.path}`, { url: d.signedUrl, expiresAt });
            out.set(`${bucket}/${d.path}`, d.signedUrl);
          }
        } catch (e) {
          console.error("[file_urls.sign]", e);
        }
      }
    }),
  );
  return out;
}

// Requests from many components in the same tick share one signing call.
let pending = null;
function queueSign(refs) {
  if (!pending) {
    pending = { refs: [], waiters: [] };
    setTimeout(async () => {
      const batch = pending;
      pending = null;
      const map = await signedUrls(batch.refs);
      for (const resolve of batch.waiters) resolve(map);
    }, 0);
  }
  pending.refs.push(...refs);
  return new Promise((resolve) => pending.waiters.push(resolve));
}

// The private refs behind a hook's key list ("<bucket>/<path>" per line).
function privateRefsOf(keys) {
  return keys
    .split("\n")
    .map((key) => {
      const bucket = PRIVATE_BUCKETS.find((b) => key.startsWith(`${b}/`));
      return bucket ? { bucket, path: key.slice(bucket.length + 1), url: "" } : null;
    })
    .filter(Boolean);
}

// URLs for a list of items: returns (item) => url ("" until signed). Private files are signed in one batch, retried twice
// (a chat file is readable once its row lands) and re-signed before they expire.
export function useSignedUrls(items, toRef = fileRef) {
  const keys = (items || [])
    .map((item) => toRef(item))
    .filter(isPrivate)
    .map(refKey)
    .join("\n");
  const [, setVersion] = useState(0);

  useEffect(() => {
    const refs = keys ? privateRefsOf(keys) : [];
    if (!refs.length) return undefined;
    let alive = true;
    let timer = null;
    const load = (attempt) =>
      queueSign(refs).then((map) => {
        if (!alive) return;
        setVersion((v) => v + 1);
        const missing = refs.some((r) => !map.get(refKey(r)));
        const expiry = Math.min(...refs.map((r) => cache.get(refKey(r))?.expiresAt ?? Infinity));
        const delay = missing && attempt < 2 ? 2000 * (attempt + 1) : Number.isFinite(expiry) ? Math.max(expiry - REFRESH_MS - Date.now() + 1000, 1000) : SIGNED_TTL * 1000;
        timer = setTimeout(() => load(missing && attempt < 2 ? attempt + 1 : 0), delay);
      });
    load(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [keys]);

  return (item) => urlFor(toRef(item));
}

// One file's URL ("" until ready).
export function useSignedUrl(ref) {
  return useSignedUrls(ref ? [ref] : [], (r) => r)(ref);
}
