"use client";

import { schemaClient, isSupabaseConfigured } from "@/supabase/components/property-client";

// Data layer for property.chat_calls (call history, one row per person per call)
// and property.chat_scheduled_calls (planned calls with per-person reminders).
// Pure: console.error on failure, return null / [] / false.

const CALLS = "chat_calls";
const SCHEDULED = "chat_scheduled_calls";

export function normalizeCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id ?? null,
    title: row.title || "Call",
    kind: row.kind || "audio",
    direction: row.direction || "outgoing",
    missed: !!row.missed,
    durationSecs: Number(row.duration_secs ?? 0),
    participantIds: Array.isArray(row.participant_ids) ? row.participant_ids : [],
    createdAt: row.created_at,
  };
}

// My call history in a project, newest first.
export async function listCalls(projectId, ownerId) {
  if (!projectId || !ownerId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(CALLS)
      .select("*")
      .eq("project_id", projectId)
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[chat_calls.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeCall);
  } catch (e) {
    console.error("[chat_calls.list]", e);
    return null;
  }
}

export async function logCall({ projectId, conversationId, ownerId, title, kind, direction, missed = false, durationSecs = 0, participantIds = [] }) {
  if (!projectId || !ownerId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(CALLS)
      .insert({
        project_id: projectId,
        conversation_id: conversationId || null,
        owner_id: ownerId,
        title: title || "Call",
        kind: kind === "video" ? "video" : "audio",
        direction: direction === "incoming" ? "incoming" : "outgoing",
        missed: !!missed,
        duration_secs: Math.max(0, Math.round(durationSecs)),
        participant_ids: participantIds.filter(Boolean),
      })
      .select("*")
      .single();
    if (error) {
      console.error("[chat_calls.log]", error.message);
      return null;
    }
    return normalizeCall(data);
  } catch (e) {
    console.error("[chat_calls.log]", e);
    return null;
  }
}

export function normalizeScheduledCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id ?? null,
    title: row.title || "Scheduled call",
    kind: row.kind || "video",
    scheduledAt: row.scheduled_at,
    createdBy: row.created_by ?? null,
    participantIds: Array.isArray(row.participant_ids) ? row.participant_ids : [],
  };
}

// The organiser is always a participant, so "calls I'm in" is one contains filter.
export async function createScheduledCall({ projectId, conversationId, title, kind, scheduledAt, createdBy, participantIds = [] }) {
  if (!projectId || !scheduledAt || !createdBy || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(SCHEDULED)
      .insert({
        project_id: projectId,
        conversation_id: conversationId || null,
        title: (title || "").trim() || "Scheduled call",
        kind: kind === "audio" ? "audio" : "video",
        scheduled_at: scheduledAt,
        created_by: createdBy,
        participant_ids: [...new Set([createdBy, ...participantIds])],
      })
      .select("*")
      .single();
    if (error) {
      console.error("[chat_scheduled_calls.create]", error.message);
      return null;
    }
    return normalizeScheduledCall(data);
  } catch (e) {
    console.error("[chat_scheduled_calls.create]", e);
    return null;
  }
}

// Calls I'm in that haven't passed yet (kept for an hour after their start).
export async function listScheduledCalls(projectId, profileId) {
  if (!projectId || !profileId || !isSupabaseConfigured()) return null;
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await schemaClient()
      .from(SCHEDULED)
      .select("*")
      .eq("project_id", projectId)
      .contains("participant_ids", [profileId])
      .gte("scheduled_at", since)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: true });
    if (error) {
      console.error("[chat_scheduled_calls.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeScheduledCall);
  } catch (e) {
    console.error("[chat_scheduled_calls.list]", e);
    return null;
  }
}

export async function cancelScheduledCall(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(SCHEDULED).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[chat_scheduled_calls.cancel]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_scheduled_calls.cancel]", e);
    return false;
  }
}

// My calls starting within the next 15 minutes that I haven't been reminded of.
export async function listDueReminders(projectId, profileId) {
  if (!projectId || !profileId || !isSupabaseConfigured()) return [];
  try {
    const now = new Date();
    const { data, error } = await schemaClient()
      .from(SCHEDULED)
      .select("*")
      .eq("project_id", projectId)
      .contains("participant_ids", [profileId])
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", new Date(now.getTime() + 15 * 60 * 1000).toISOString())
      .is("deleted_at", null);
    if (error) {
      console.error("[chat_scheduled_calls.due]", error.message);
      return [];
    }
    return (data || [])
      .filter((r) => !(r.reminded_ids || []).includes(profileId))
      .map(normalizeScheduledCall);
  } catch (e) {
    console.error("[chat_scheduled_calls.due]", e);
    return [];
  }
}

// Claim a reminder; true only for the first claim, so two tabs never both remind.
export async function claimReminder(id, profileId) {
  if (!id || !profileId || !isSupabaseConfigured()) return false;
  try {
    const { data, error } = await schemaClient().rpc("chat_mark_reminded", { p_id: id, p_profile: profileId });
    if (error) {
      console.error("[chat_scheduled_calls.claim]", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("[chat_scheduled_calls.claim]", e);
    return false;
  }
}
