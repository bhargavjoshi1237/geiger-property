"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { getActiveProjectId, scopeQuery, stampProject } from "./scope";

// Data-access layer for the project's public leasing site (owns `property.leasing_sites`, LEAS-01): one row per
// project. Writes need Manage settings (RLS). Pure: null / false on failure, never throw or toast.

const TABLE = "leasing_sites";
const COLUMNS = "id, project_id, handle, enabled, display_name, brand, contact, updated_at";

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function normalizeLeasingSite(row) {
  if (!row) return null;
  const contact = obj(row.contact);
  return {
    id: row.id,
    projectId: row.project_id,
    handle: row.handle || "",
    enabled: Boolean(row.enabled),
    displayName: row.display_name || "",
    brand: obj(row.brand),
    contact: { phone: contact.phone || "", email: contact.email || "", officeHours: contact.officeHours || "" },
    updatedAt: row.updated_at || null,
  };
}

// The active project's site, null when it has none yet (or the read failed: `{ error }`).
export async function getLeasingSite() {
  if (!isSupabaseConfigured()) return { error: "Supabase isn't configured." };
  try {
    const sb = createClient();
    const { data, error } = await scopeQuery(sb.from(TABLE).select(COLUMNS).is("deleted_at", null)).maybeSingle();
    if (error) {
      console.error("[leasingSites.get]", error.message);
      return { error: error.message };
    }
    return normalizeLeasingSite(data);
  } catch (e) {
    console.error("[leasingSites.get]", e);
    return { error: "Couldn't load the leasing site." };
  }
}

// Create or update the active project's site → { ok, site } | { ok: false, error, code }.
export async function saveLeasingSite(site) {
  if (!getActiveProjectId() || !isSupabaseConfigured()) return { ok: false, error: "No active project." };
  const row = {
    handle: site.handle,
    enabled: Boolean(site.enabled),
    display_name: site.displayName || "",
    contact: { phone: site.contact?.phone || "", email: site.contact?.email || "", officeHours: site.contact?.officeHours || "" },
  };
  try {
    const sb = createClient();
    const q = site.id
      ? sb.from(TABLE).update(row).eq("id", site.id)
      : sb.from(TABLE).insert(stampProject(row));
    const { data, error } = await q.select(COLUMNS).single();
    if (error) {
      console.error("[leasingSites.save]", error.message);
      return { ok: false, error: error.message, code: error.code };
    }
    return { ok: true, site: normalizeLeasingSite(data) };
  } catch (e) {
    console.error("[leasingSites.save]", e);
    return { ok: false, error: "Couldn't save the leasing site." };
  }
}
