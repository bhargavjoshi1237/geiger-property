"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { getActiveProjectId } from "./project_scope";

// Data-access layer for per-project settings (owns `property.settings`): one JSON
// value per key — company_profile, fees_policies, branding_portals, integrations,
// custom_fields, roles. Pure: null / false on failure, never throw or toast.

const TABLE = "settings";

function forProject(q) {
  const pid = getActiveProjectId();
  return pid ? q.eq("project_id", pid) : q.is("project_id", null);
}

// The stored value for a key, `fallback` when unset, null when the read failed.
export async function getSetting(key, fallback = {}) {
  if (!key || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await forProject(
      sb.from(TABLE).select("value").eq("key", key).is("deleted_at", null),
    ).maybeSingle();
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

// Replace a key's value (update when present, else insert). Returns true/false.
export async function saveSetting(key, value) {
  if (!key || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { data: existing, error: readError } = await forProject(
      sb.from(TABLE).select("id").eq("key", key).is("deleted_at", null),
    ).maybeSingle();
    if (readError) {
      console.error("[settings.save]", readError.message);
      return false;
    }
    const { error } = existing
      ? await sb.from(TABLE).update({ value }).eq("id", existing.id)
      : await sb.from(TABLE).insert({ key, value, project_id: getActiveProjectId() });
    if (error) {
      console.error("[settings.save]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[settings.save]", e);
    return false;
  }
}
