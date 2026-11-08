import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { getActiveProjectId } from "./scope";
import { PER_TYPE_LIMIT, searchNeedle } from "@/lib/search";

// Data-access layer for ⌘K record search (PLAT-05): calls property.search_records as the signed-in user, so member RLS
// and each type's view keys decide what comes back. Returns [] for nothing to search, null on a failed read.

function normalizeHit(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title ?? "",
    subtitle: row.subtitle ?? null,
    keywords: row.keywords ?? "",
  };
}

// Up to `limit` live records per type in the active project whose search text contains the query.
export async function searchRecords(query, { projectId = getActiveProjectId(), types = null, limit = PER_TYPE_LIMIT } = {}) {
  if (!projectId || !searchNeedle(query) || (types && !types.length) || !isSupabaseConfigured()) return [];
  try {
    const { data, error } = await createClient().rpc("search_records", {
      p_project: projectId,
      p_query: String(query).trim(),
      p_types: types,
      p_limit: limit,
    });
    if (error) {
      console.error("[search.records]", error.message);
      return null;
    }
    return (data || []).map(normalizeHit);
  } catch (e) {
    console.error("[search.records]", e);
    return null;
  }
}
