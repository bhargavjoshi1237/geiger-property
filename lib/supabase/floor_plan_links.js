import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for property.floor_plan_links — the many-to-many attach
// between floor plans and owners (property/building). Units instead reference a
// single plan via units.floor_plan_id. Cross-area soft uuids; callers join names
// against floorPlansData in JS.

const TABLE = "floor_plan_links";

export function normalizeFloorPlanLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    floorPlanId: row.floor_plan_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    createdAt: row.created_at ?? null,
  };
}

// Plans attached to one owner.
export async function listFloorPlanLinks(ownerType, ownerId) {
  if (!ownerId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId);
    if (error) {
      console.error("[floor_plan_links.listByOwner]", error.message);
      return null;
    }
    return (data || []).map(normalizeFloorPlanLink);
  } catch (e) {
    console.error("[floor_plan_links.listByOwner]", e);
    return null;
  }
}

// Owners a plan is attached to (reverse — the "Linked" section).
export async function listFloorPlanOwners(floorPlanId) {
  if (!floorPlanId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("floor_plan_id", floorPlanId);
    if (error) {
      console.error("[floor_plan_links.listByPlan]", error.message);
      return null;
    }
    return (data || []).map(normalizeFloorPlanLink);
  } catch (e) {
    console.error("[floor_plan_links.listByPlan]", e);
    return null;
  }
}

export async function attachFloorPlan(floorPlanId, ownerType, ownerId, id) {
  if (!floorPlanId || !ownerId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = {
      floor_plan_id: floorPlanId,
      owner_type: ownerType,
      owner_id: ownerId,
    };
    if (id) payload.id = id;
    const { data, error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: "floor_plan_id,owner_type,owner_id" })
      .select("*")
      .single();
    if (error) {
      console.error("[floor_plan_links.attach]", error.message);
      return null;
    }
    return normalizeFloorPlanLink(data);
  } catch (e) {
    console.error("[floor_plan_links.attach]", e);
    return null;
  }
}

export async function detachFloorPlan(floorPlanId, ownerType, ownerId) {
  if (!floorPlanId || !ownerId || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .delete()
      .eq("floor_plan_id", floorPlanId)
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId);
    if (error) {
      console.error("[floor_plan_links.detach]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[floor_plan_links.detach]", e);
    return false;
  }
}
