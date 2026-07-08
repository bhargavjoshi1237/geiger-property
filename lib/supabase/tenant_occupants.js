import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// createClient() already defaults to `db.schema: "property"` (see
// lib/supabase/client.js) — call it directly; do not use schemaClient().

// Data-access layer for Household Occupants (the Household & Occupants editor's
// Occupants child list). Owns `property.tenant_occupants` — one row per person
// in a household. Pure actions: validate, console.error on failure, return
// null / false / []. DB is snake_case; UI is camelCase.

const TABLE = "tenant_occupants";

export function normalizeOccupant(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    householdId: row.household_id ?? null,
    name: row.name ?? "Occupant",
    relationship: row.relationship ?? "",
    age: row.age ?? "",
    createdBy: row.created_by ?? null,
    metadata: meta,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    householdId: "household_id",
    name: "name",
    relationship: "relationship",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("age" in input) row.age = input.age === "" ? null : Number(input.age) || null;
  if ("metadata" in input && input.metadata && typeof input.metadata === "object")
    row.metadata = input.metadata;
  return row;
}

export async function listOccupants(householdId) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let q = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (householdId) q = q.eq("household_id", householdId);
    const { data, error } = await q;
    if (error) {
      console.error("[occupants.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeOccupant);
  } catch (e) {
    console.error("[occupants.list]", e);
    return null;
  }
}

export async function createOccupant(input) {
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
      console.error("[occupants.create]", error.message);
      return null;
    }
    return normalizeOccupant(data);
  } catch (e) {
    console.error("[occupants.create]", e);
    return null;
  }
}

export async function softDeleteOccupant(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[occupants.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[occupants.delete]", e);
    return false;
  }
}

export const occupantsData = {
  list: listOccupants,
  create: createOccupant,
  softDelete: softDeleteOccupant,
  normalize: normalizeOccupant,
};
