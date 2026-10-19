"use client";

import { schemaClient, isSupabaseConfigured } from "@/supabase/components/property-client";
import { subscribeTable } from "./chat_realtime";

// Data layer for property.chat_messages. reactions ({ key: [profileId] }),
// replyTo ({ id, authorId, text }), mentions ([profileId]), call (call-event
// card) and attachments live in the metadata bag. Pure: the screen owns
// optimistic state and toasts.

const TABLE = "chat_messages";

export function normalizeMessage(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    conversationId: row.conversation_id ?? null,
    threadId: row.thread_id ?? null,
    authorId: row.author_id ?? null,
    text: row.text ?? "",
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deleted: !!row.deleted_at,
    reactions: meta.reactions && typeof meta.reactions === "object" ? meta.reactions : {},
    replyTo: meta.replyTo || null,
    mentions: Array.isArray(meta.mentions) ? meta.mentions : [],
    call: meta.call || null,
    attachments: Array.isArray(meta.attachments) ? meta.attachments : [],
  };
}

// One page of a timeline, returned oldest-first. threadId null = the main
// timeline; `before` (an ISO createdAt) pages backwards for infinite scroll.
export async function listMessages(conversationId, { threadId = null, before = null, limit = 30 } = {}) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    let query = schemaClient().from(TABLE).select("*").eq("conversation_id", conversationId).is("deleted_at", null);
    query = threadId ? query.eq("thread_id", threadId) : query.is("thread_id", null);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (error) {
      console.error("[chat_messages.list]", error.message);
      return null;
    }
    return (data || []).map(normalizeMessage).reverse();
  } catch (e) {
    console.error("[chat_messages.list]", e);
    return null;
  }
}

// Insert a message, honouring a caller-supplied id so the optimistic bubble and
// the row share a UUID.
export async function sendMessage({ id, conversationId, authorId, text, threadId, replyTo, mentions, call, attachments }) {
  if (!conversationId || !isSupabaseConfigured()) return null;
  try {
    const metadata = {};
    if (replyTo?.id) metadata.replyTo = { id: replyTo.id, authorId: replyTo.authorId || null, text: replyTo.text || "" };
    if (mentions?.length) metadata.mentions = [...new Set(mentions)];
    if (call) metadata.call = call;
    if (attachments?.length) metadata.attachments = attachments;
    const payload = { conversation_id: conversationId, author_id: authorId || null, text: text ?? "", metadata };
    if (id) payload.id = id;
    if (threadId) payload.thread_id = threadId;
    const { data, error } = await schemaClient().from(TABLE).insert(payload).select("*").single();
    if (error) {
      console.error("[chat_messages.send]", error.message);
      return null;
    }
    return normalizeMessage(data);
  } catch (e) {
    console.error("[chat_messages.send]", e);
    return null;
  }
}

export async function editMessage(id, text) {
  const clean = (text || "").trim();
  if (!id || !clean || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(TABLE)
      .update({ text: clean, edited_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[chat_messages.edit]", error.message);
      return null;
    }
    return normalizeMessage(data);
  } catch (e) {
    console.error("[chat_messages.edit]", e);
    return null;
  }
}

export async function softDeleteMessage(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      console.error("[chat_messages.delete]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_messages.delete]", e);
    return false;
  }
}

// Undo a soft delete.
export async function restoreMessage(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().from(TABLE).update({ deleted_at: null }).eq("id", id);
    if (error) {
      console.error("[chat_messages.restore]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_messages.restore]", e);
    return false;
  }
}

// Toggle my reaction atomically on the server (chat_toggle_reaction), so two
// people reacting at once never overwrite each other.
export async function toggleReaction(messageId, reaction, profileId) {
  if (!messageId || !reaction || !profileId || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient().rpc("chat_toggle_reaction", {
      p_message: messageId,
      p_reaction: reaction,
      p_profile: profileId,
    });
    if (error) {
      console.error("[chat_messages.react]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_messages.react]", e);
    return false;
  }
}

// Realtime inserts and updates (reactions, edits, soft deletes) across every
// conversation; the screen keeps the ones it shows.
export function subscribeMessages(handler) {
  return subscribeTable("chat-messages", { table: TABLE }, (row, type) => handler?.(row, type));
}
