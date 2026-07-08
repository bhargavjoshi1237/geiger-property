import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// createClient() already defaults to `db.schema: "property"` (see
// lib/supabase/client.js) — call it directly; do not use schemaClient().

// Data-access layer for Tenant Households & Occupants (the "Household &
// Occupants" Tenants sub-item). Owns `property.tenant_households`. Pure actions:
// validate, console.error on failure, return null / false / []. DB is
// snake_case; the UI is camelCase, mapped at this boundary.

const TABLE = "tenant_households";

export function normalizeHousehold(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "Household",
    primaryTenantId: row.primary_tenant_id ?? null,
    propertyId: row.property_id ?? null,
    occupantCount: Number(row.occupant_count ?? 0),
    createdBy: row.created_by ?? null,
    metadata: meta,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    name: "name",
    primaryTenantId: "primary_tenant_id",
    propertyId: "property_id",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("occupantCount" in input)
    row.occupant_count = Number(input.occupantCount) || 0;
  if ("metadata" in input && input.metadata && typeof input.metadata === "object")
    row.metadata = input.metadata;
  return row;
}

export async function listHouseholds(tenantId) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let q = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (tenantId) q = q.eq("primary_tenant_id", tenantId);
    const { data, error } = await q;
    if (error) {
      console.error("[households.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeHousehold);
  } catch (e) {
    console.error("[households.list]", e);
    return null;
  }
}

export async function createHousehold(input) {
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
      console.error("[households.create]", error.message);
      return null;
    }
    return normalizeHousehold(data);
  } catch (e) {
    console.error("[households.create]", e);
    return null;
  }
}

export async function updateHousehold(id, patch) {
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
      console.error("[households.update]", error.message);
      return null;
    }
    return normalizeHousehold(data);
  } catch (e) {
    console.error("[households.update]", e);
    return null;
  }
}

export async function softDeleteHousehold(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[households.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[households.delete]", e);
    return false;
  }
}

export const householdsData = {
  list: listHouseholds,
  create: createHousehold,
  update: updateHousehold,
  softDelete: softDeleteHousehold,
  normalize: normalizeHousehold,
};
