import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { scopeQuery, stampProject } from "./project_scope";
import { mergeRecordMeta } from "./meta";

// Data-access layer for the Properties area — the only place that talks to
// property.properties. Pure: validate, console.error on failure, return
// null/[]/false; never throw or toast. DB snake_case ↔ UI camelCase mapped here.

const TABLE = "properties";

// Tolerates DB rows (snake) and already-normalized view models (camel); metadata
// keys surface as first-class fields, real columns win on overlap.
export function normalizeProperty(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    name: row.name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    zip: row.zip ?? "",
    type: row.type ?? "Multi-family",
    status: row.status ?? "Draft",
    portfolioId: row.portfolio_id ?? row.portfolioId ?? null,
    yearBuilt: row.year_built ?? row.yearBuilt ?? null,
    description: row.description ?? "",
    coverUrl: row.cover_url ?? row.coverUrl ?? "",
    units: row.unit_count ?? row.units ?? 0,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    metadata: meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    name: "name",
    address: "address",
    city: "city",
    state: "state",
    zip: "zip",
    type: "type",
    status: "status",
    portfolioId: "portfolio_id",
    description: "description",
    coverUrl: "cover_url",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("yearBuilt" in input) row.year_built = Number(input.yearBuilt) || null;
  if ("units" in input) row.unit_count = Number(input.units) || 0;
  if ("portfolioId" in input) row.portfolio_id = input.portfolioId || null;
  if (input.metadata && typeof input.metadata === "object") row.metadata = input.metadata;
  return row;
}

export async function listProperties() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await scopeQuery(sb.from(TABLE).select("*"))
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[properties.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeProperty);
  } catch (e) {
    console.error("[properties.list]", e);
    return null;
  }
}

// Properties assigned to one portfolio.
export async function listPropertiesByPortfolio(portfolioId) {
  if (!portfolioId) return [];
  const rows = await listProperties();
  return rows ? rows.filter((r) => r.portfolioId === portfolioId) : null;
}

export async function getProperty(id) {
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
      console.error("[properties.get]", error.message);
      return null;
    }
    return normalizeProperty(data);
  } catch (e) {
    console.error("[properties.get]", e);
    return null;
  }
}

export async function createProperty(input) {
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
      console.error("[properties.create]", error.message);
      return null;
    }
    return normalizeProperty(data);
  } catch (e) {
    console.error("[properties.create]", e);
    return null;
  }
}

export async function updateProperty(id, patch) {
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
      console.error("[properties.update]", error.message);
      return null;
    }
    return normalizeProperty(data);
  } catch (e) {
    console.error("[properties.update]", e);
    return null;
  }
}

export async function softDeleteProperty(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[properties.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[properties.delete]", e);
    return false;
  }
}

export const propertiesData = {
  mergeMeta: (id, patch) => mergeRecordMeta(TABLE, id, patch),
  list: listProperties,
  create: createProperty,
  update: updateProperty,
  softDelete: softDeleteProperty,
  normalize: normalizeProperty,
  columnKeys: ["name", "address", "city", "state", "zip", "type", "status", "portfolioId", "yearBuilt", "description", "coverUrl", "units"],
};
