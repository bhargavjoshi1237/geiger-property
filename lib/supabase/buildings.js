import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery, stampProject } from "./project_scope";
import { mergeRecordMeta } from "./meta";

// Data-access layer for the Buildings area — the only place that talks to
// property.buildings. Pure: validate, console.error on failure, return
// null/[]/false; never throw or toast. DB snake_case ↔ UI camelCase mapped here.

const TABLE = "buildings";

// Tolerates DB rows (snake) and already-normalized view models (camel); metadata
// keys surface as first-class fields, real columns win on overlap.
export function normalizeBuilding(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    name: row.name ?? "",
    blockCode: row.block_code ?? row.blockCode ?? "",
    propertyId: row.property_id ?? row.propertyId ?? null,
    floors: row.floors ?? 1,
    yearBuilt: row.year_built ?? row.yearBuilt ?? null,
    structureType: row.structure_type ?? row.structureType ?? "",
    wing: row.wing ?? "",
    description: row.description ?? "",
    status: row.status ?? "Active",
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    metadata: meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    name: "name",
    blockCode: "block_code",
    propertyId: "property_id",
    structureType: "structure_type",
    wing: "wing",
    description: "description",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("floors" in input) row.floors = Number(input.floors) || 1;
  if ("yearBuilt" in input) row.year_built = Number(input.yearBuilt) || null;
  if ("propertyId" in input) row.property_id = input.propertyId || null;
  if (input.metadata && typeof input.metadata === "object") row.metadata = input.metadata;
  return row;
}

export async function listBuildings() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await scopeQuery(sb.from(TABLE).select("*"))
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[buildings.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeBuilding);
  } catch (e) {
    console.error("[buildings.list]", e);
    return null;
  }
}

// Buildings that belong to one property.
export async function listBuildingsByProperty(propertyId) {
  if (!propertyId) return [];
  const rows = await listBuildings();
  return rows ? rows.filter((r) => r.propertyId === propertyId) : null;
}

export async function getBuilding(id) {
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
      console.error("[buildings.get]", error.message);
      return null;
    }
    return normalizeBuilding(data);
  } catch (e) {
    console.error("[buildings.get]", e);
    return null;
  }
}

export async function createBuilding(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = toRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(TABLE)
      .insert(stampProject(payload))
      .select("*")
      .single();
    if (error) {
      console.error("[buildings.create]", error.message);
      return null;
    }
    return normalizeBuilding(data);
  } catch (e) {
    console.error("[buildings.create]", e);
    return null;
  }
}

export async function updateBuilding(id, patch) {
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
      console.error("[buildings.update]", error.message);
      return null;
    }
    return normalizeBuilding(data);
  } catch (e) {
    console.error("[buildings.update]", e);
    return null;
  }
}

export async function softDeleteBuilding(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[buildings.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[buildings.delete]", e);
    return false;
  }
}

export const buildingsData = {
  mergeMeta: (id, patch) => mergeRecordMeta(TABLE, id, patch),
  list: listBuildings,
  create: createBuilding,
  update: updateBuilding,
  softDelete: softDeleteBuilding,
  normalize: normalizeBuilding,
  columnKeys: ["name", "blockCode", "propertyId", "floors", "yearBuilt", "structureType", "wing", "description", "status"],
};
