import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for the Amenities area — the only place that talks to
// property.amenities. Pure: validate, console.error on failure, return
// null/[]/false; never throw or toast. DB snake_case ↔ UI camelCase mapped here.

const TABLE = "amenities";

export function normalizeAmenity(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "",
    category: row.category ?? "Community",
    scope: row.scope ?? "both",
    icon: row.icon ?? "",
    feeType: row.fee_type ?? "none",
    feeAmount: Number(row.fee_amount ?? 0),
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
    category: "category",
    scope: "scope",
    icon: "icon",
    feeType: "fee_type",
    description: "description",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("feeAmount" in input) row.fee_amount = Number(input.feeAmount) || 0;
  return row;
}

export async function listAmenities() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[amenities.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeAmenity);
  } catch (e) {
    console.error("[amenities.list]", e);
    return null;
  }
}

export async function getAmenity(id) {
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
      console.error("[amenities.get]", error.message);
      return null;
    }
    return normalizeAmenity(data);
  } catch (e) {
    console.error("[amenities.get]", e);
    return null;
  }
}

export async function createAmenity(input) {
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
      console.error("[amenities.create]", error.message);
      return null;
    }
    return normalizeAmenity(data);
  } catch (e) {
    console.error("[amenities.create]", e);
    return null;
  }
}

export async function updateAmenity(id, patch) {
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
      console.error("[amenities.update]", error.message);
      return null;
    }
    return normalizeAmenity(data);
  } catch (e) {
    console.error("[amenities.update]", e);
    return null;
  }
}

export async function softDeleteAmenity(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[amenities.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[amenities.delete]", e);
    return false;
  }
}

export const amenitiesData = {
  list: listAmenities,
  create: createAmenity,
  update: updateAmenity,
  softDelete: softDeleteAmenity,
  normalize: normalizeAmenity,
};
