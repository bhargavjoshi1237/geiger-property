import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery, stampProject } from "./project_scope";
import { mergeRecordMeta } from "./meta";

// Data-access layer for the Units area — the only place that talks to
// property.units. Pure: validate, console.error on failure, return
// null/[]/false; never throw or toast. DB snake_case ↔ UI camelCase mapped here.

const TABLE = "units";

export function normalizeUnit(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    label: row.label ?? "",
    propertyId: row.property_id ?? row.propertyId ?? null,
    buildingId: row.building_id ?? row.buildingId ?? null,
    unitTypeId: row.unit_type_id ?? row.unitTypeId ?? null,
    floorPlanId: row.floor_plan_id ?? row.floorPlanId ?? null,
    floor: row.floor ?? "",
    bedrooms: Number(row.bedrooms ?? 0),
    bathrooms: Number(row.bathrooms ?? 0),
    sqft: row.sqft ?? null,
    rent: Number(row.rent ?? 0),
    deposit: Number(row.deposit ?? 0),
    status: row.status ?? "Vacant",
    occupantName: row.occupant_name ?? row.occupantName ?? "",
    tenantId: row.tenant_id ?? row.tenantId ?? null,
    leaseStart: row.lease_start ?? row.leaseStart ?? null,
    leaseEnd: row.lease_end ?? row.leaseEnd ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    metadata: meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    label: "label",
    propertyId: "property_id",
    buildingId: "building_id",
    unitTypeId: "unit_type_id",
    floorPlanId: "floor_plan_id",
    floor: "floor",
    status: "status",
    occupantName: "occupant_name",
    tenantId: "tenant_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("bedrooms" in input) row.bedrooms = Number(input.bedrooms) || 0;
  if ("bathrooms" in input) row.bathrooms = Number(input.bathrooms) || 0;
  if ("sqft" in input) row.sqft = Number(input.sqft) || null;
  if ("rent" in input) row.rent = Number(input.rent) || 0;
  if ("deposit" in input) row.deposit = Number(input.deposit) || 0;
  if ("leaseStart" in input) row.lease_start = input.leaseStart || null;
  if ("leaseEnd" in input) row.lease_end = input.leaseEnd || null;
  // Soft uuid links: "" (cleared picker) → null.
  if ("propertyId" in input) row.property_id = input.propertyId || null;
  if ("buildingId" in input) row.building_id = input.buildingId || null;
  if ("unitTypeId" in input) row.unit_type_id = input.unitTypeId || null;
  if ("floorPlanId" in input) row.floor_plan_id = input.floorPlanId || null;
  if ("tenantId" in input) row.tenant_id = input.tenantId || null;
  if (input.metadata && typeof input.metadata === "object") row.metadata = input.metadata;
  return row;
}

export async function listUnits() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await scopeQuery(sb.from(TABLE).select("*"))
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[units.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeUnit);
  } catch (e) {
    console.error("[units.list]", e);
    return null;
  }
}

export async function getUnit(id) {
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
      console.error("[units.get]", error.message);
      return null;
    }
    return normalizeUnit(data);
  } catch (e) {
    console.error("[units.get]", e);
    return null;
  }
}

export async function createUnit(input) {
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
      console.error("[units.create]", error.message);
      return null;
    }
    return normalizeUnit(data);
  } catch (e) {
    console.error("[units.create]", e);
    return null;
  }
}

export async function updateUnit(id, patch) {
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
      console.error("[units.update]", error.message);
      return null;
    }
    return normalizeUnit(data);
  } catch (e) {
    console.error("[units.update]", e);
    return null;
  }
}

export async function softDeleteUnit(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[units.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[units.delete]", e);
    return false;
  }
}

export const unitsData = {
  mergeMeta: (id, patch) => mergeRecordMeta(TABLE, id, patch),
  list: listUnits,
  create: createUnit,
  update: updateUnit,
  softDelete: softDeleteUnit,
  normalize: normalizeUnit,
  columnKeys: ["label", "propertyId", "buildingId", "unitTypeId", "floorPlanId", "floor", "status", "occupantName", "tenantId", "bedrooms", "bathrooms", "sqft", "rent", "deposit", "leaseStart", "leaseEnd"],
};
