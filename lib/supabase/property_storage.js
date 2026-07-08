"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { compressImageUnder } from "@/lib/image/compress";

// Image/file storage for Geiger Property. Everything lives in the public
// "products" bucket (shared across the suite) under a `property/…` prefix, so no
// new bucket has to be provisioned. Writes persist the public URL on the row;
// reads are public. Helpers return { path, url } / true / [] / null like the
// data layer — the caller owns UX.

export const PROPERTY_MEDIA_BUCKET = "products";

// owner-scoped prefix, e.g. property/unit/<uuid>/ ; floor plans get their own.
export function propertyMediaPrefix(ownerType, ownerId) {
  return `property/${ownerType || "misc"}/${ownerId || "unassigned"}`;
}

export function floorPlanPrefix(planId) {
  return `property/floor-plans/${planId || "unassigned"}`;
}

export function buildPublicUrl(path) {
  if (!path) return null;
  const sb = createClient();
  const { data } = sb.storage.from(PROPERTY_MEDIA_BUCKET).getPublicUrl(path);
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

// Compress only real images; pass PDFs/others through untouched.
async function preparePayload(file, compress) {
  const isImage = (file?.type || "").startsWith("image/");
  if (compress && isImage) return compressImageUnder(file, 500);
  return file;
}

async function uploadTo(prefix, file, options = {}) {
  const { compress = true } = options;
  try {
    const payload = await preparePayload(file, compress);
    const path = `${prefix}/${uniqueName(payload)}`;
    const sb = createClient();
    const { error } = await sb.storage
      .from(PROPERTY_MEDIA_BUCKET)
      .upload(path, payload, {
        cacheControl: "3600",
        upsert: false,
        contentType: payload.type || file.type || "application/octet-stream",
      });
    if (error) {
      console.error("[property_storage.upload]", error.message);
      return null;
    }
    return { path, url: buildPublicUrl(path), sizeBytes: payload.size ?? 0 };
  } catch (e) {
    console.error("[property_storage.upload]", e);
    return null;
  }
}

// Upload one media/image for an owner (property, unit, building…). Returns
// { path, url, sizeBytes } or null.
export async function uploadPropertyImage(ownerType, ownerId, file, options = {}) {
  if (!ownerId || !file || !isSupabaseConfigured()) return null;
  return uploadTo(propertyMediaPrefix(ownerType, ownerId), file, options);
}

// Upload one floor-plan drawing (image or PDF). Returns { path, url, sizeBytes }.
export async function uploadFloorPlanImage(planId, file, options = {}) {
  if (!planId || !file || !isSupabaseConfigured()) return null;
  return uploadTo(floorPlanPrefix(planId), file, options);
}

// Remove a stored object by its full path. Returns true on success.
export async function removePropertyImage(path) {
  if (!path || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb.storage.from(PROPERTY_MEDIA_BUCKET).remove([path]);
    if (error) {
      console.error("[property_storage.remove]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[property_storage.remove]", e);
    return false;
  }
}

// The storage object path for a previously-stored public URL (for deletion).
export function pathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${PROPERTY_MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}
