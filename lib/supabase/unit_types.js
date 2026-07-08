import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for the Unit Types area — the only place that talks to
// property.unit_types. Pure: validate, console.error on failure, return
// null/[]/false; never throw or toast. DB snake_case ↔ UI camelCase mapped here.

const TABLE = "unit_types";

export function normalizeUnitType(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "",
    bedrooms: Number(row.bedrooms ?? 0),
    bathrooms: Number(row.bathrooms ?? 0),
    sqft: row.sqft ?? null,
    marketRent: Number(row.market_rent ?? 0),
    deposit: Number(row.deposit ?? 0),
    floorPlanId: row.floor_plan_id ?? null,
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
    floorPlanId: "floor_plan_id",
    description: "description",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("bedrooms" in input) row.bedrooms = Number(input.bedrooms) || 0;
  if ("bathrooms" in input) row.bathrooms = Number(input.bathrooms) || 0;
  if ("marketRent" in input) row.market_rent = Number(input.marketRent) || 0;
  if ("deposit" in input) row.deposit = Number(input.deposit) || 0;
  if ("sqft" in input) row.sqft = Number(input.sqft) || null;
  return row;
}

export async function listUnitTypes() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[unit_types.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeUnitType);
  } catch (e) {
    console.error("[unit_types.list]", e);
    return null;
  }
}

export async function getUnitType(id) {
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
      console.error("[unit_types.get]", error.message);
      return null;
    }
    return normalizeUnitType(data);
  } catch (e) {
    console.error("[unit_types.get]", e);
    return null;
  }
}

export async function createUnitType(input) {
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
      console.error("[unit_types.create]", error.message);
      return null;
    }
    return normalizeUnitType(data);
  } catch (e) {
    console.error("[unit_types.create]", e);
    return null;
  }
}

export async function updateUnitType(id, patch) {
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
      console.error("[unit_types.update]", error.message);
      return null;
    }
    return normalizeUnitType(data);
  } catch (e) {
    console.error("[unit_types.update]", e);
    return null;
  }
}

export async function softDeleteUnitType(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[unit_types.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[unit_types.delete]", e);
    return false;
  }
}

export const unitTypesData = {
  list: listUnitTypes,
  create: createUnitType,
  update: updateUnitType,
  softDelete: softDeleteUnitType,
  normalize: normalizeUnitType,
};
