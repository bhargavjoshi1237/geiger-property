import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// NOTE: createClient() already defaults to `db.schema: "property"` (see
// lib/supabase/client.js), so we call it directly. (The `property` schema must
// be in Supabase → Settings → API → Exposed schemas, else PostgREST returns
// PGRST106 "Invalid schema: property" — a project setting, not a code fix.)

// Data-access layer for the Tenants area. The only place that talks to the
// `property.tenants` table. Keeps actions pure: validate, console.error on
// failure, and return null / false / [] — never throw, never toast (the screen
// owns UX). DB is snake_case; the UI is camelCase, mapped at this boundary.

const TABLE = "tenants";

// DB row -> camelCase view model the screens render directly.
export function normalizeTenant(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    unit: row.unit ?? "",
    propertyId: row.property_id ?? null,
    householdId: row.household_id ?? null,
    status: row.status ?? "Applicant",
    balance: Number(row.balance ?? 0),
    leaseStart: row.lease_start ?? null,
    leaseEnd: row.lease_end ?? null,
    portalEnabled: row.portal_enabled ?? false,
    portalLastSeen: row.portal_last_seen ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    // Keep the raw bag for read-modify-write of section attributes…
    metadata: meta,
    // …and spread its keys so they also read as first-class fields.
    ...meta,
  };
}

// camelCase patch -> snake_case columns. Emits a column only when its key is
// present in `input`, so one updateTenant() serves both a full-form save and a
// single-field inline edit (`{ status }`, `{ balance }`…).
function toRow(input) {
  const row = {};
  const map = {
    name: "name",
    email: "email",
    phone: "phone",
    unit: "unit",
    propertyId: "property_id",
    householdId: "household_id",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("balance" in input) row.balance = Number(input.balance) || 0;
  // Dates empty-string -> null so the date column stays valid.
  if ("leaseStart" in input) row.lease_start = input.leaseStart || null;
  if ("leaseEnd" in input) row.lease_end = input.leaseEnd || null;
  if ("portalEnabled" in input)
    row.portal_enabled = Boolean(input.portalEnabled);
  if ("portalLastSeen" in input)
    row.portal_last_seen = input.portalLastSeen || null;
  // Section attributes persist as a whole-bag read-modify-write.
  if ("metadata" in input && input.metadata && typeof input.metadata === "object")
    row.metadata = input.metadata;
  return row;
}

// All tenants, newest first. Returns null when the DB is absent so the screen
// renders its empty state; [] when there are simply no rows.
export async function listTenants() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[tenants.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeTenant);
  } catch (e) {
    console.error("[tenants.list]", e);
    return null;
  }
}

export async function getTenant(id) {
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
      console.error("[tenants.get]", error.message);
      return null;
    }
    return normalizeTenant(data);
  } catch (e) {
    console.error("[tenants.get]", e);
    return null;
  }
}

// Insert. Honors a caller-supplied `id` (the UI mints a UUID up front for
// optimistic rendering) so the row and the optimistic list entry stay in sync.
export async function createTenant(input) {
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
      console.error("[tenants.create]", error.message);
      return null;
    }
    return normalizeTenant(data);
  } catch (e) {
    console.error("[tenants.create]", e);
    return null;
  }
}

export async function updateTenant(id, patch) {
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
      console.error("[tenants.update]", error.message);
      return null;
    }
    return normalizeTenant(data);
  } catch (e) {
    console.error("[tenants.update]", e);
    return null;
  }
}

// Soft delete — sets deleted_at; lists filter it out.
export async function softDeleteTenant(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[tenants.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tenants.delete]", e);
    return false;
  }
}

// The data-layer contract the Entity engine binds to. Centralizes which CRUD
// functions back the Tenants list so the engine stays generic.
export const tenantsData = {
  list: listTenants,
  create: createTenant,
  update: updateTenant,
  softDelete: softDeleteTenant,
  normalize: normalizeTenant,
};
