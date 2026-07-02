"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { compressImageUnder } from "@/lib/image/compress";

// Reusable image storage for the Events area. All event media lives in the
// public "products" bucket under events/<event-uuid>/. Writes are authoritative
// (RLS: only the event's creator); reads are public, so we persist the direct
// public URL in flow_events.cover_url / gallery.
//
//   import { uploadEventImage } from "@/lib/supabase/storage";
//   const { url } = await uploadEventImage(eventId, file, { compress: true });

export const EVENT_MEDIA_BUCKET = "products";

export function eventMediaPrefix(eventId) {
  return `events/${eventId}`;
}

// Venue media lives alongside event media in the same public bucket, under
// venues/<venue-uuid>/.
export function venueMediaPrefix(venueId) {
  return `venues/${venueId}`;
}

// Public URL for a stored object path.
export function buildPublicUrl(path) {
  if (!path) return null;
  const sb = createClient();
  const { data } = sb.storage.from(EVENT_MEDIA_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

function extFromFile(file) {
  const fromName = (file?.name || "").split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromType = (file?.type || "").split("/")[1];
  return (fromType || "jpg").toLowerCase();
}

function uniqueName(file) {
  const ts = new Date().toISOString().replace(/[.:]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}.${extFromFile(file)}`;
}

/**
 * Upload one image for an event. Compresses to <500 KB by default. Returns
 * `{ path, url }` on success, or `null` on failure (validation, auth/RLS, or
 * network) — the caller decides UX. Only the event's creator is allowed to
 * write (enforced by storage RLS).
 */
export async function uploadEventImage(eventId, file, options = {}) {
  if (!eventId || !file || !isSupabaseConfigured()) return null;
  const { compress = true } = options;
  try {
    const payload = compress ? await compressImageUnder(file, 500) : file;
    const path = `${eventMediaPrefix(eventId)}/${uniqueName(payload)}`;
    const sb = createClient();
    const { error } = await sb.storage
      .from(EVENT_MEDIA_BUCKET)
      .upload(path, payload, {
        cacheControl: "3600",
        upsert: false,
        contentType: payload.type || file.type || "image/jpeg",
      });
    if (error) {
      console.error("[storage.uploadEventImage]", error.message);
      return null;
    }
    return { path, url: buildPublicUrl(path) };
  } catch (e) {
    console.error("[storage.uploadEventImage]", e);
    return null;
  }
}

/**
 * Upload one image for a venue. Compresses to <500 KB by default. Returns
 * `{ path, url }` on success, or `null` on failure. Only the venue's creator is
 * allowed to write (enforced by storage RLS). Mirrors uploadEventImage.
 */
export async function uploadVenueImage(venueId, file, options = {}) {
  if (!venueId || !file || !isSupabaseConfigured()) return null;
  const { compress = true } = options;
  try {
    const payload = compress ? await compressImageUnder(file, 500) : file;
    const path = `${venueMediaPrefix(venueId)}/${uniqueName(payload)}`;
    const sb = createClient();
    const { error } = await sb.storage
      .from(EVENT_MEDIA_BUCKET)
      .upload(path, payload, {
        cacheControl: "3600",
        upsert: false,
        contentType: payload.type || file.type || "image/jpeg",
      });
    if (error) {
      console.error("[storage.uploadVenueImage]", error.message);
      return null;
    }
    return { path, url: buildPublicUrl(path) };
  } catch (e) {
    console.error("[storage.uploadVenueImage]", e);
    return null;
  }
}

// Existing images for an event, newest first, as { name, path, url }.
export async function listEventImages(eventId) {
  if (!eventId || !isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    const prefix = eventMediaPrefix(eventId);
    const { data, error } = await sb.storage
      .from(EVENT_MEDIA_BUCKET)
      .list(prefix, { sortBy: { column: "created_at", order: "desc" } });
    if (error) {
      console.error("[storage.listEventImages]", error.message);
      return [];
    }
    return (data || [])
      .filter((f) => f.name && !f.name.startsWith("."))
      .map((f) => {
        const path = `${prefix}/${f.name}`;
        return { name: f.name, path, url: buildPublicUrl(path) };
      });
  } catch (e) {
    console.error("[storage.listEventImages]", e);
    return [];
  }
}

// Remove an image by its full object path. Returns true on success.
export async function removeEventImage(path) {
  if (!path || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb.storage.from(EVENT_MEDIA_BUCKET).remove([path]);
    if (error) {
      console.error("[storage.removeEventImage]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[storage.removeEventImage]", e);
    return false;
  }
}

// The storage object path for a previously-stored public URL (for deletion).
export function pathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${EVENT_MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}
