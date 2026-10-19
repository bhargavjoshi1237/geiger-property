"use client";

import { schemaClient, isSupabaseConfigured } from "@/supabase/components/property-client";
import { subscribeTable } from "./chat_realtime";

// Data layer for property.chat_notifications — the chat Inbox. Rows are written
// by the actor's client for each recipient (mention, channel_invite,
// missed_call, scheduled_call, call_reminder); icons and colours come from
// NOTIFICATION_TYPE_MAP on the screen side. Pure: console.error, null / [] / false.

const TABLE = "chat_notifications";

export function normalizeNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title || "",
    body: row.body || "",
    actorId: row.actor_id ?? null,
    conversationId: row.conversation_id ?? null,
    messageId: row.message_id ?? null,
    read: !!row.read_at,
    createdAt: row.created_at,
    meta: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

export async function listNotifications(profileId, projectId) {
  if (!profileId || !projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .select("*")
      .eq("profile_id", profileId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[chat_notifications.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeNotification);
  } catch (e) {
    console.error("[chat_notifications.list]", e);
    return null;
  }
}

// Fan one notification out to several recipients.
// `input`: { projectId, type, title, body, actorId, conversationId, messageId, meta }.
export async function notifyPeople(profileIds, input) {
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  if (!ids.length || !input?.projectId || !input?.type || !isSupabaseConfigured()) return false;
  try {
    const rows = ids.map((profileId) => ({
      profile_id: profileId,
      project_id: input.projectId,
      type: input.type,
      title: input.title || "",
      body: input.body || "",
      actor_id: input.actorId || null,
      conversation_id: input.conversationId || null,
      message_id: input.messageId || null,
      metadata: input.meta || {},
    }));
    const { error } = await schemaClient().from(TABLE).insert(rows);
    if (error) {
      console.error("[chat_notifications.notify]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_notifications.notify]", e);
    return false;
  }
}

export async function markNotificationRead(id, read = true) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ read_at: read ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) {
      console.error("[chat_notifications.markRead]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_notifications.markRead]", e);
    return false;
  }
}

export async function markAllNotificationsRead(profileId, projectId) {
  if (!profileId || !projectId || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq("profile_id", profileId)
      .eq("project_id", projectId)
      .is("read_at", null);
    if (error) {
      console.error("[chat_notifications.markAllRead]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_notifications.markAllRead]", e);
    return false;
  }
}

export async function softDeleteNotification(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[chat_notifications.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_notifications.delete]", e);
    return false;
  }
}

// Realtime: notifications addressed to me (new ones and read-state changes).
export function subscribeNotifications(profileId, handler) {
  if (!profileId) return () => {};
  return subscribeTable(
    "chat-notifications",
    { table: TABLE, filter: `profile_id=eq.${profileId}` },
    (row, type) => handler?.(row, type),
  );
}
