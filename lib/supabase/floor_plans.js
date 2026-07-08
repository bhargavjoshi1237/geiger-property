import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for the Floor Plans area — the only place that talks to
// property.floor_plans. Pure: validate, console.error on failure, return
// null/[]/false; never throw or toast. DB snake_case ↔ UI camelCase mapped here.

const TABLE = "floor_plans";

export function normalizeFloorPlan(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "",
    bedrooms: Number(row.bedrooms ?? 0),
    bathrooms: Number(row.bathrooms ?? 0),
    sqft: row.sqft ?? null,
    dimensions: row.dimensions ?? "",
    imageUrl: row.image_url ?? "",
    propertyId: row.property_id ?? null,
    description: row.description ?? "",
    status: row.status ?? "Active",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    name: "name",
    dimensions: "dimensions",
    imageUrl: "image_url",
    propertyId: "property_id",
    description: "description",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("bedrooms" in input) row.bedrooms = Number(input.bedrooms) || 0;
  if ("bathrooms" in input) row.bathrooms = Number(input.bathrooms) || 0;
  if ("sqft" in input) row.sqft = Number(input.sqft) || null;
  return row;
}

export async function listFloorPlans() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[floor_plans.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeFloorPlan);
  } catch (e) {
    console.error("[floor_plans.list]", e);
    return null;
  }
}

export async function getFloorPlan(id) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[floor_plans.get]", error.message);
      return null;
    }
    return normalizeFloorPlan(data);
  } catch (e) {
    console.error("[floor_plans.get]", e);
    return null;
  }
}

export async function createFloorPlan(input) {
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
      console.error("[floor_plans.create]", error.message);
      return null;
    }
    return normalizeFloorPlan(data);
  } catch (e) {
    console.error("[floor_plans.create]", e);
    return null;
  }
}

export async function updateFloorPlan(id, patch) {
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
      console.error("[floor_plans.update]", error.message);
      return null;
    }
    return normalizeFloorPlan(data);
  } catch (e) {
    console.error("[floor_plans.update]", e);
    return null;
  }
}

export async function softDeleteFloorPlan(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[floor_plans.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[floor_plans.delete]", e);
    return false;
  }
}

export const floorPlansData = {
  list: listFloorPlans,
  create: createFloorPlan,
  update: updateFloorPlan,
  softDelete: softDeleteFloorPlan,
  normalize: normalizeFloorPlan,
};
