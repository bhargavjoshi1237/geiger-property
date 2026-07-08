import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for property.amenity_links — the many-to-many attach between
// amenities and owners (property/unit/building/unit_type). Cross-area soft uuids,
// so there is no PostgREST embed; callers join names against amenitiesData in JS.

const TABLE = "amenity_links";

export function normalizeAmenityLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    amenityId: row.amenity_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    createdAt: row.created_at ?? null,
  };
}

// Links attached to one owner.
export async function listAmenityLinks(ownerType, ownerId) {
  if (!ownerId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId);
    if (error) {
      console.error("[amenity_links.listByOwner]", error.message);
      return null;
    }
    return (data || []).map(normalizeAmenityLink);
  } catch (e) {
    console.error("[amenity_links.listByOwner]", e);
    return null;
  }
}

// Owners an amenity is attached to (reverse — the "Attached To" section).
export async function listAmenityOwners(amenityId) {
  if (!amenityId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("amenity_id", amenityId);
    if (error) {
      console.error("[amenity_links.listByAmenity]", error.message);
      return null;
    }
    return (data || []).map(normalizeAmenityLink);
  } catch (e) {
    console.error("[amenity_links.listByAmenity]", e);
    return null;
  }
}

export async function attachAmenity(amenityId, ownerType, ownerId, id) {
  if (!amenityId || !ownerId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = {
      amenity_id: amenityId,
      owner_type: ownerType,
      owner_id: ownerId,
    };
    if (id) payload.id = id;
    const { data, error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: "amenity_id,owner_type,owner_id" })
      .select("*")
      .single();
    if (error) {
      console.error("[amenity_links.attach]", error.message);
      return null;
    }
    return normalizeAmenityLink(data);
  } catch (e) {
    console.error("[amenity_links.attach]", e);
    return null;
  }
}

export async function detachAmenity(amenityId, ownerType, ownerId) {
  if (!amenityId || !ownerId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .delete()
      .eq("amenity_id", amenityId)
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId);
    if (error) {
      console.error("[amenity_links.detach]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[amenity_links.detach]", e);
    return false;
  }
}
