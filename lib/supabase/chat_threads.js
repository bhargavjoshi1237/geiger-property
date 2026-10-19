"use client";

import { schemaClient, isSupabaseConfigured } from "@/supabase/components/property-client";
import { subscribeTable } from "./chat_realtime";

// Data layer for property.chat_threads — a named sub-thread rooted on a message.
// Replies are chat_messages carrying thread_id. View model:
//   { id, conversationId, rootMessageId, title, createdBy, lastActivityAt, replyCount }
// Pure: console.error on failure, return null / [] / false.

const TABLE = "chat_threads";
const MESSAGES = "chat_messages";

export function normalizeThread(row, replyCount = 0) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    rootMessageId: row.root_message_id ?? null,
    title: row.title || "Thread",
    createdBy: row.created_by ?? null,
    lastActivityAt: row.last_activity_at || row.created_at || null,
    replyCount,
  };
}

// A conversation's threads, most recently active first, with reply counts.
export async function listThreads(conversationId) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("last_activity_at", { ascending: false });
    if (error) {
      console.error("[chat_threads.list]", error.message);
      return null;
    }
    if (!data?.length) return [];

    const { data: replies } = await sb
      .from(MESSAGES)
      .select("thread_id")
      .in("thread_id", data.map((t) => t.id))
      .is("deleted_at", null);
    const counts = {};
    for (const r of replies || []) counts[r.thread_id] = (counts[r.thread_id] || 0) + 1;
    return data.map((t) => normalizeThread(t, counts[t.id] || 0));
  } catch (e) {
    console.error("[chat_threads.list]", e);
    return null;
  }
}

export async function createThread({ id, conversationId, rootMessageId, title, createdBy }) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    const payload = {
      conversation_id: conversationId,
      root_message_id: rootMessageId || null,
      title: (title || "").trim().slice(0, 120) || "Thread",
      created_by: createdBy || null,
    };
    if (id) payload.id = id;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[chat_threads.create]", error.message);
      return null;
    }
    return normalizeThread(data);
  } catch (e) {
    console.error("[chat_threads.create]", e);
    return null;
  }
}

export async function renameThread(id, title) {
  const clean = (title || "").trim().slice(0, 120);
  if (!id || !clean || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ title: clean }).eq("id", id);
    if (error) {
      console.error("[chat_threads.rename]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_threads.rename]", e);
    return false;
  }
}

export async function softDeleteThread(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[chat_threads.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_threads.delete]", e);
    return false;
  }
}

// Realtime: threads created, renamed or deleted in one conversation.
export function subscribeThreads(conversationId, handler) {
  if (!conversationId) return () => {};
  return subscribeTable(
    "chat-threads",
    { table: TABLE, filter: `conversation_id=eq.${conversationId}` },
    (row, type) => handler?.(row, type),
  );
}
