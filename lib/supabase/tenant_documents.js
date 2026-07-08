import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// createClient() already defaults to `db.schema: "property"` (see
// lib/supabase/client.js) — call it directly; do not use schemaClient().

// Data-access layer for Tenant Documents (the "Documents" Tenants sub-item).
// Owns `property.tenant_documents`. Pure actions: validate, console.error on
// failure, return null / false / []. DB is snake_case; UI is camelCase.

const TABLE = "tenant_documents";

export function normalizeTenantDocument(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    tenantId: row.tenant_id ?? null,
    kind: row.kind ?? "other",
    name: row.name ?? "Document",
    url: row.url ?? "",
    sizeBytes: Number(row.size_bytes ?? 0),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    metadata: meta,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    tenantId: "tenant_id",
    kind: "kind",
    name: "name",
    url: "url",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("sizeBytes" in input) row.size_bytes = Number(input.sizeBytes) || 0;
  if ("metadata" in input && input.metadata && typeof input.metadata === "object")
    row.metadata = input.metadata;
  return row;
}

export async function listTenantDocuments(tenantId) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    let q = sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error) {
      console.error("[tenantDocs.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeTenantDocument);
  } catch (e) {
    console.error("[tenantDocs.list]", e);
    return null;
  }
}

export async function createTenantDocument(input) {
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
      console.error("[tenantDocs.create]", error.message);
      return null;
    }
    return normalizeTenantDocument(data);
  } catch (e) {
    console.error("[tenantDocs.create]", e);
    return null;
  }
}

export async function updateTenantDocument(id, patch) {
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
      console.error("[tenantDocs.update]", error.message);
      return null;
    }
    return normalizeTenantDocument(data);
  } catch (e) {
    console.error("[tenantDocs.update]", e);
    return null;
  }
}

export async function softDeleteTenantDocument(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[tenantDocs.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[tenantDocs.delete]", e);
    return false;
  }
}

export const tenantDocumentsData = {
  list: listTenantDocuments,
  create: createTenantDocument,
  update: updateTenantDocument,
  softDelete: softDeleteTenantDocument,
  normalize: normalizeTenantDocument,
};
