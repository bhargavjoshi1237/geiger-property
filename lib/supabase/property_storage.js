"use client";

import { createClient } from "./client";
import { getActiveProjectId } from "./scope";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { compressImageUnder } from "@/lib/image/compress";
import { FILES_BUCKET, PUBLIC_BUCKET, objectPath, uniqueName } from "@/lib/files/refs";

// Browser uploads for Geiger Property (PLAT-01g): files go to the private property-files bucket under
// <projectId>/<ownerType>/<ownerId>/; only `public: true` (listing photos, cover images) lands in property-public.
// Callers persist { bucket, path } and read it back through lib/supabase/file_urls.js. Returns null on failure; the caller owns UX.

// Compress only real images; pass PDFs and other files through untouched.
async function preparePayload(file, compress) {
  const isImage = (file?.type || "").startsWith("image/");
  if (compress && isImage) return compressImageUnder(file, 500);
  return file;
}

// Upload one file for an owner record → { bucket, path, url, sizeBytes, contentType } (url only for public files).
export async function uploadPropertyFile(ownerType, ownerId, file, options = {}) {
  const { compress = true, public: isPublic = false, projectId = getActiveProjectId() } = options;
  if (!ownerId || !file || !projectId || !isSupabaseConfigured()) return null;
  try {
    const payload = await preparePayload(file, compress);
    const contentType = payload.type || file.type || "application/octet-stream";
    const bucket = isPublic ? PUBLIC_BUCKET : FILES_BUCKET;
    const path = objectPath(projectId, ownerType, ownerId, uniqueName(payload.name || file.name, contentType));
    const storage = createClient().storage.from(bucket);
    const { error } = await storage.upload(path, payload, { cacheControl: "3600", upsert: false, contentType });
    if (error) {
      console.error("[property_storage.upload]", error.message);
      return null;
    }
    const url = isPublic ? storage.getPublicUrl(path).data?.publicUrl || "" : "";
    return { bucket, path, url, sizeBytes: payload.size ?? file.size ?? 0, contentType };
  } catch (e) {
    console.error("[property_storage.upload]", e);
    return null;
  }
}
