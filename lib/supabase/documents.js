import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for polymorphic per-owner documents (property.documents).
// owner_type ∈ property | unit | building | unit_type | portfolio. Pure:
// null/[]/false, console.error on failure, never throw/toast.

const TABLE = "documents";

export function normalizeDocument(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    ownerType: row.owner_type ?? null,
    ownerId: row.owner_id ?? null,
    kind: row.kind ?? "other",
    name: row.name ?? "Document",
    url: row.url ?? "",
    sizeBytes: Number(row.size_bytes ?? 0),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    ownerType: "owner_type",
    ownerId: "owner_id",
    kind: "kind",
    name: "name",
    url: "url",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("sizeBytes" in input) row.size_bytes = Number(input.sizeBytes) || 0;
  return row;
}

// Documents for one owner, newest first.
export async function listDocuments(ownerType, ownerId) {
  if (!ownerId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[documents.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeDocument);
  } catch (e) {
    console.error("[documents.list]", e);
    return null;
  }
}

export async function createDocument(input) {
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
      console.error("[documents.create]", error.message);
      return null;
    }
    return normalizeDocument(data);
  } catch (e) {
    console.error("[documents.create]", e);
    return null;
  }
}

export async function softDeleteDocument(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[documents.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[documents.delete]", e);
    return false;
  }
}
