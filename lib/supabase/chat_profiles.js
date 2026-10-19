"use client";

import { schemaClient, isSupabaseConfigured } from "@/supabase/components/property-client";
import { subscribeTable } from "./chat_realtime";

// Data layer for property.chat_profiles — the people directory chat resolves
// authors, members and contacts through. One row per person (the auth user id),
// shared across projects; project_ids lists the projects they've opened chat in.
// Pure: console.error on failure, return null / [] / false. Never throws or toasts.

const TABLE = "chat_profiles";

// A heartbeat older than this reads as offline whatever presence was last
// written, so a tab that died without a clean "offline" write still drops off.
const PRESENCE_STALE_MS = 2 * 60 * 1000;

export const DEFAULT_NOTIFY_PREFS = { dms: true, mentions: true, channels: false };

export function normalizeProfile(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const name = row.display_name || row.username || (row.email ? row.email.split("@")[0] : "") || "User";
  const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  const stale = !lastSeenMs || Date.now() - lastSeenMs > PRESENCE_STALE_MS;
  return {
    id: row.id,
    name,
    firstName: name.split(" ")[0] || name,
    role: row.role ?? "",
    color: row.avatar_color || "#6366f1",
    presence: stale ? "offline" : row.presence || "offline",
    lastSeenAt: row.last_seen_at ?? null,
    email: row.email ?? "",
    username: row.username ?? "",
    projectIds: Array.isArray(row.project_ids) ? row.project_ids : [],
    doNotDisturb: meta.doNotDisturb === true,
    notify: { ...DEFAULT_NOTIFY_PREFS, ...(meta.notify || {}) },
  };
}

export async function listProfiles(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .contains("project_ids", [projectId])
      .is("deleted_at", null)
      .order("display_name", { ascending: true });
    if (error) {
      console.error("[chat_profiles.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeProfile);
  } catch (e) {
    console.error("[chat_profiles.list]", e);
    return null;
  }
}

// Profiles by id, not project-scoped — resolves authors and members who aren't in
// this project's directory (an external contact) so they never render "Unknown".
export async function getProfilesByIds(ids = []) {
  const clean = [...new Set((ids || []).filter(Boolean))];
  if (clean.length === 0 || !isSupabaseConfigured()) return [];
  try {
    const { data, error } = await schemaClient().from(TABLE).select("*").in("id", clean);
    if (error) {
      console.error("[chat_profiles.getByIds]", error.message);
      return [];
    }
    return (data || []).map(normalizeProfile);
  } catch (e) {
    console.error("[chat_profiles.getByIds]", e);
    return [];
  }
}

// Exact email or username match, deliberately not project-scoped: typing someone's
// exact address is how a conversation with a person outside the project starts.
export async function findProfile(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q || /[,()]/.test(q) || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .or(`email.eq.${q},username.eq.${q}`)
      .is("deleted_at", null)
      .limit(1);
    if (error) {
      console.error("[chat_profiles.find]", error.message);
      return null;
    }
    return normalizeProfile(data?.[0] ?? null);
  } catch (e) {
    console.error("[chat_profiles.find]", e);
    return null;
  }
}

// Partial name / username / email search within a project's directory, for the
// live typeahead in the people pickers.
export async function searchProfiles(query, { projectId, limit = 20 } = {}) {
  const safe = (query || "").trim().toLowerCase().replace(/[%,()]/g, " ").trim();
  if (!safe || !projectId || !isSupabaseConfigured()) return [];
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .contains("project_ids", [projectId])
      .or(`display_name.ilike.%${safe}%,username.ilike.%${safe}%,email.ilike.%${safe}%`)
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .limit(limit);
    if (error) {
      console.error("[chat_profiles.search]", error.message);
      return [];
    }
    return (data || []).map(normalizeProfile);
  } catch (e) {
    console.error("[chat_profiles.search]", e);
    return [];
  }
}

// Make sure the signed-in person has a profile and that it lists this project.
// The display name is only seeded on first insert so a name edited in chat
// Settings isn't overwritten by the auth name on the next visit.
export async function ensureProfile({ id, email, username, name, color, projectId }) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const read = () => sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    const first = await read();
    let existing = first.data;
    const readError = first.error;
    if (readError) {
      console.error("[chat_profiles.ensure]", readError.message);
      return null;
    }

    // First visit: create the row. ignoreDuplicates makes a concurrent first
    // visit (another tab) a no-op instead of an error; both then read the winner.
    if (!existing) {
      const payload = {
        id,
        email: email ? email.toLowerCase() : null,
        username: username ? username.toLowerCase() : null,
        display_name: name || "User",
        project_ids: projectId ? [projectId] : [],
      };
      if (color) payload.avatar_color = color;
      const { error } = await sb.from(TABLE).upsert(payload, { onConflict: "id", ignoreDuplicates: true });
      if (error) {
        console.error("[chat_profiles.ensure]", error.message);
        return null;
      }
      ({ data: existing } = await read());
      if (!existing) return null;
    }

    // Returning visit: add this project and refresh the email if they changed.
    const patch = {};
    const projects = Array.isArray(existing.project_ids) ? existing.project_ids : [];
    if (projectId && !projects.includes(projectId)) patch.project_ids = [...projects, projectId];
    if (email && existing.email !== email.toLowerCase()) patch.email = email.toLowerCase();
    if (username && !existing.username) patch.username = username.toLowerCase();
    if (existing.deleted_at) patch.deleted_at = null;
    if (Object.keys(patch).length === 0) return normalizeProfile(existing);
    const { data, error } = await sb.from(TABLE).update(patch).eq("id", id).select("*").single();
    if (error) {
      console.error("[chat_profiles.ensure]", error.message);
      return null;
    }
    return normalizeProfile(data);
  } catch (e) {
    console.error("[chat_profiles.ensure]", e);
    return null;
  }
}

// Edit the visible profile ({ name, role }).
export async function updateProfile(id, { name, role } = {}) {
  if (!id || !isSupabaseConfigured()) return null;
  const patch = {};
  if (name !== undefined) patch.display_name = (name || "").trim() || "User";
  if (role !== undefined) patch.role = (role || "").trim();
  try {
    const { data, error } = await schemaClient().from(TABLE).update(patch).eq("id", id).select("*").single();
    if (error) {
      console.error("[chat_profiles.update]", error.message);
      return null;
    }
    return normalizeProfile(data);
  } catch (e) {
    console.error("[chat_profiles.update]", e);
    return null;
  }
}

// Shallow-merge preferences ({ notify, doNotDisturb }) into the metadata bag.
export async function updateProfilePrefs(id, patch) {
  if (!id || !patch || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().rpc("merge_meta", { p_table: TABLE, p_id: id, p_patch: patch });
    if (error) {
      console.error("[chat_profiles.prefs]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_profiles.prefs]", e);
    return false;
  }
}

export async function setPresence(id, presence) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ presence, last_seen_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[chat_profiles.presence]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_profiles.presence]", e);
    return false;
  }
}

// Realtime presence / profile edits. Unfiltered (project_ids is an array), so the
// caller keeps only people it already shows.
export function subscribeProfiles(handler) {
  return subscribeTable("chat-profiles", { table: TABLE }, (row) => handler?.(row));
}
