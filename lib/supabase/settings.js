"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { getActiveProjectId, scopeQuery } from "./scope";

// Data-access layer for per-project settings (owns `property.settings`): one JSON
// value per key — company_profile, fees_policies, branding_portals, integrations,
// custom_fields, roles. Writes need the key's permission (property.settings_write_permission). Pure: null / false on failure, never throw or toast.

const TABLE = "settings";

// The stored value for a key, `fallback` when unset, null when the read failed.
export async function getSetting(key, fallback = {}) {
  if (!key || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await scopeQuery(sb.from(TABLE).select("value").eq("key", key).is("deleted_at", null)).maybeSingle();
    if (error) {
      console.error("[settings.get]", error.message);
      return null;
    }
    return data?.value ?? fallback;
  } catch (e) {
    console.error("[settings.get]", e);
    return null;
  }
}

// Replace a key's value: update (restoring a soft-deleted row, as (project_id, key) stays unique) or insert. Returns true/false.
export async function saveSetting(key, value) {
  // Settings always belong to the active project; there are no shared ones.
  if (!key || !getActiveProjectId() || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { data: existing, error: readError } = await scopeQuery(sb.from(TABLE).select("id, deleted_at").eq("key", key)).maybeSingle();
    if (readError) {
      console.error("[settings.save]", readError.message);
      return false;
    }
    const { data, error } = existing
      ? await sb.from(TABLE).update(existing.deleted_at ? { value, deleted_at: null } : { value }).eq("id", existing.id).select("id")
      : await sb.from(TABLE).insert({ key, value, project_id: getActiveProjectId() }).select("id");
    if (error) {
      console.error("[settings.save]", error.message);
      return false;
    }
    // A key the caller's role can't write (PLAT-01d) updates zero rows rather than raising.
    return Boolean(data?.length);
  } catch (e) {
    console.error("[settings.save]", e);
    return false;
  }
}
