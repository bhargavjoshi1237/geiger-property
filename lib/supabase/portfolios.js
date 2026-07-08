import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for the Portfolios area — the only place that talks to
// property.portfolios. Pure: validate, console.error on failure, return
// null/[]/false; never throw or toast. DB snake_case ↔ UI camelCase mapped here.

const TABLE = "portfolios";

export function normalizePortfolio(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    name: row.name ?? "",
    description: row.description ?? "",
    manager: row.manager ?? "",
    region: row.region ?? "",
    color: row.color ?? "",
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
    description: "description",
    manager: "manager",
    region: "region",
    color: "color",
    status: "status",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  return row;
}

export async function listPortfolios() {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[portfolios.list]", error.message);
      return null;
    }
    return (data || []).map(normalizePortfolio);
  } catch (e) {
    console.error("[portfolios.list]", e);
    return null;
  }
}

export async function getPortfolio(id) {
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
      console.error("[portfolios.get]", error.message);
      return null;
    }
    return normalizePortfolio(data);
  } catch (e) {
    console.error("[portfolios.get]", e);
    return null;
  }
}

export async function createPortfolio(input) {
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
      console.error("[portfolios.create]", error.message);
      return null;
    }
    return normalizePortfolio(data);
  } catch (e) {
    console.error("[portfolios.create]", e);
    return null;
  }
}

export async function updatePortfolio(id, patch) {
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
      console.error("[portfolios.update]", error.message);
      return null;
    }
    return normalizePortfolio(data);
  } catch (e) {
    console.error("[portfolios.update]", e);
    return null;
  }
}

export async function softDeletePortfolio(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[portfolios.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[portfolios.delete]", e);
    return false;
  }
}

export const portfoliosData = {
  list: listPortfolios,
  create: createPortfolio,
  update: updatePortfolio,
  softDelete: softDeletePortfolio,
  normalize: normalizePortfolio,
};
