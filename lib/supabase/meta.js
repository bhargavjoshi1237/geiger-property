import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Shallow-merge a patch into property.<table>.metadata via property.merge_meta,
// so one editor tab never clobbers another's keys. Returns the merged bag or null.
export async function mergeRecordMeta(table, id, patch) {
  if (!table || !id || !patch || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("merge_meta", {
      p_table: table,
      p_id: id,
      p_patch: patch,
    });
    if (error) {
      console.error(`[${table}.mergeMeta]`, error.message);
      return null;
    }
    return data || {};
  } catch (e) {
    console.error(`[${table}.mergeMeta]`, e);
    return null;
  }
}
