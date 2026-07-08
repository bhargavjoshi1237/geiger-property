import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for property.media — both the standalone media library
// (all assets) and per-owner galleries (owner_type/owner_id). Pure: null/[]/
// false, console.error on failure, never throw/toast.

const TABLE = "media";

export function normalizeMedia(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    ownerType: row.owner_type ?? null,
    ownerId: row.owner_id ?? null,
    kind: row.kind ?? "photo",
    name: row.name ?? "Media",
    url: row.url ?? "",
    thumbUrl: row.thumb_url ?? "",
    isCover: row.is_cover ?? false,
    sort: Number(row.sort ?? 0),
    sizeBytes: Number(row.size_bytes ?? 0),
    status: row.status ?? "Published",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    ownerType: "owner_type",
    ownerId: "owner_id",
    kind: "kind",
    name: "name",
    url: "url",
    thumbUrl: "thumb_url",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("isCover" in input) row.is_cover = Boolean(input.isCover);
  if ("sort" in input) row.sort = Number(input.sort) || 0;
  if ("sizeBytes" in input) row.size_bytes = Number(input.sizeBytes) || 0;
  return row;
}

// The whole media library, newest first (for the standalone screen).
export async function listAllMedia() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[media.listAll]", error.message);
      return null;
    }
    return (data || []).map(normalizeMedia);
  } catch (e) {
    console.error("[media.listAll]", e);
    return null;
  }
}

// Media for one owner (a property/unit/building gallery), cover first then newest.
export async function listMedia(ownerType, ownerId) {
  if (!ownerId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .order("is_cover", { ascending: false })
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[media.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeMedia);
  } catch (e) {
    console.error("[media.list]", e);
    return null;
  }
}

export async function createMedia(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[media.create]", error.message);
      return null;
    }
    return normalizeMedia(data);
  } catch (e) {
    console.error("[media.create]", e);
    return null;
  }
}

export async function updateMedia(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .update(toRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[media.update]", error.message);
      return null;
    }
    return normalizeMedia(data);
  } catch (e) {
    console.error("[media.update]", e);
    return null;
  }
}

export async function softDeleteMedia(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[media.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[media.delete]", e);
    return false;
  }
}

// Make one asset the cover for its owner (clears the flag on the owner's others).
export async function setCoverMedia(ownerType, ownerId, mediaId) {
  if (!ownerId || !mediaId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error: clearErr } = await sb
      .from(TABLE)
      .update({ is_cover: false })
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId);
    if (clearErr) {
      console.error("[media.setCover.clear]", clearErr.message);
      return false;
    }
    const { error } = await sb
      .from(TABLE)
      .update({ is_cover: true })
      .eq("id", mediaId);
    if (error) {
      console.error("[media.setCover]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[media.setCover]", e);
    return false;
  }
}

// Contract for the standalone Media library Entity screen.
export const mediaData = {
  list: listAllMedia,
  create: createMedia,
  update: updateMedia,
  softDelete: softDeleteMedia,
  normalize: normalizeMedia,
};
