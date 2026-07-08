import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";

// Data-access layer for the polymorphic per-owner activity timeline
// (property.activity). System entries (created/updated/attached) and user notes.
// Pure: null/[]/false, console.error on failure, never throw/toast.
//
// NOTE: distinct from lib/supabase/activity.js — that wraps Supabase's fetch for
// tracking; this is the editor's human-readable timeline.

const TABLE = "activity";

export function normalizeActivity(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    ownerType: row.owner_type ?? null,
    ownerId: row.owner_id ?? null,
    verb: row.verb ?? "note",
    summary: row.summary ?? "",
    actorId: row.actor_id ?? null,
    actorName: row.actor_name ?? "",
    occurredAt: row.occurred_at ?? row.created_at ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function toRow(input) {
  const row = {};
  const map = {
    ownerType: "owner_type",
    ownerId: "owner_id",
    verb: "verb",
    summary: "summary",
    actorId: "actor_id",
    actorName: "actor_name",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("occurredAt" in input) row.occurred_at = input.occurredAt || null;
  return row;
}

export async function listActivity(ownerType, ownerId) {
  if (!ownerId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false });
    if (error) {
      console.error("[activity_log.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeActivity);
  } catch (e) {
    console.error("[activity_log.list]", e);
    return null;
  }
}

// Log an entry (note or system event).
export async function createActivity(input) {
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
      console.error("[activity_log.create]", error.message);
      return null;
    }
    return normalizeActivity(data);
  } catch (e) {
    console.error("[activity_log.create]", e);
    return null;
  }
}

export async function softDeleteActivity(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[activity_log.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[activity_log.delete]", e);
    return false;
  }
}
