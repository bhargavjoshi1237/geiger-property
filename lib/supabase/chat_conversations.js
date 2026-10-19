"use client";

import { schemaClient, isSupabaseConfigured } from "@/supabase/components/property-client";
import { subscribeTable } from "./chat_realtime";
import { normalizeMessage } from "./chat_messages";

// Data layer for property.chat_conversations + property.chat_members. A
// conversation is a "dm" (two members, deduped per project by dm_key) or a
// "channel". View models:
//   dm:      { id, type: "dm", participantId, memberIds, unread, pinned, muted, lastActivityAt, reads, messages }
//   channel: { id, type: "channel", name, topic, visibility, memberIds, myRole, ... }
// `messages` holds only the latest message until the screen loads the timeline.
// Pure: console.error on failure, return null / [] / false. Never throws or toasts.

const CONVERSATIONS = "chat_conversations";
const MEMBERS = "chat_members";
const MESSAGES = "chat_messages";
const GENERAL = "general";

export function normalizeConversation(row, { meId, memberIds = [], lastMessage = null, unread = 0, membership = {}, reads = {} } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    type: row.kind,
    projectId: row.project_id,
    createdBy: row.created_by ?? null,
    pinned: !!membership.pinned,
    muted: !!membership.muted,
    myRole: membership.role || "member",
    unread: unread || 0,
    lastReadAt: membership.last_read_at ?? null,
    lastActivityAt: row.last_activity_at || row.created_at || null,
    memberIds,
    reads,
    messages: lastMessage ? [normalizeMessage(lastMessage)] : [],
  };
  if (row.kind === "channel") {
    return { ...base, name: row.name || "", topic: row.topic || "", visibility: row.visibility || "public" };
  }
  return { ...base, participantId: memberIds.find((id) => id !== meId) || null };
}

// My conversations of one kind in a project, newest activity first, each with
// its latest message (the list preview) and my unread count.
export async function listConversations(meId, kind, projectId) {
  if (!meId || !projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data: mine, error: mineError } = await sb
      .from(MEMBERS)
      .select("conversation_id, pinned, muted, role, last_read_at")
      .eq("profile_id", meId);
    if (mineError) {
      console.error("[chat_conversations.list]", mineError.message);
      return null;
    }
    if (!mine?.length) return [];

    const membershipById = Object.fromEntries(mine.map((m) => [m.conversation_id, m]));
    const { data: rows, error } = await sb
      .from(CONVERSATIONS)
      .select("*")
      .in("id", Object.keys(membershipById))
      .eq("project_id", projectId)
      .eq("kind", kind)
      .is("deleted_at", null);
    if (error) {
      console.error("[chat_conversations.list]", error.message);
      return null;
    }
    if (!rows?.length) return [];

    const ids = rows.map((r) => r.id);
    const { data: members } = await sb.from(MEMBERS).select("conversation_id, profile_id, last_read_at").in("conversation_id", ids);
    const memberIds = {};
    const reads = {};
    for (const m of members || []) {
      (memberIds[m.conversation_id] ||= []).push(m.profile_id);
      (reads[m.conversation_id] ||= {})[m.profile_id] = m.last_read_at || null;
    }

    // Per conversation: the latest main-timeline message (the preview) and how
    // many others' messages arrived after my read marker. Thread replies are out.
    const summaries = await Promise.all(
      rows.map(async (row) => {
        const lastRead = membershipById[row.id]?.last_read_at;
        let unreadQuery = sb
          .from(MESSAGES)
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", row.id)
          .is("deleted_at", null)
          .is("thread_id", null)
          .neq("author_id", meId);
        if (lastRead) unreadQuery = unreadQuery.gt("created_at", lastRead);
        const [{ data: last }, { count }] = await Promise.all([
          sb
            .from(MESSAGES)
            .select("id, conversation_id, author_id, text, metadata, edited_at, created_at")
            .eq("conversation_id", row.id)
            .is("deleted_at", null)
            .is("thread_id", null)
            .order("created_at", { ascending: false })
            .limit(1),
          unreadQuery,
        ]);
        return { lastMessage: last?.[0] || null, unread: count || 0 };
      }),
    );
    const summaryById = Object.fromEntries(rows.map((row, i) => [row.id, summaries[i]]));

    const activity = (row) => new Date(row.last_activity_at || row.created_at || 0).getTime();
    return rows
      .sort((a, b) => activity(b) - activity(a))
      .map((row) =>
        normalizeConversation(row, {
          meId,
          memberIds: memberIds[row.id] || [],
          lastMessage: summaryById[row.id].lastMessage,
          unread: summaryById[row.id].unread,
          membership: membershipById[row.id],
          reads: reads[row.id] || {},
        }),
      );
  } catch (e) {
    console.error("[chat_conversations.list]", e);
    return null;
  }
}

async function addMembers(sb, conversationId, profileIds, adminId = null) {
  const rows = [...new Set(profileIds.filter(Boolean))].map((pid) => ({
    conversation_id: conversationId,
    profile_id: pid,
    role: pid === adminId ? "admin" : "member",
  }));
  if (!rows.length) return true;
  const { error } = await sb.from(MEMBERS).upsert(rows, { onConflict: "conversation_id,profile_id", ignoreDuplicates: true });
  if (error) {
    console.error("[chat_conversations.addMembers]", error.message);
    return false;
  }
  return true;
}

export async function createChannel({ id, name, topic, visibility = "public", createdBy, memberIds = [], projectId }) {
  const clean = (name || "").trim().replace(/^#/, "");
  if (!clean || !projectId || !createdBy || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const payload = {
      kind: "channel",
      name: clean,
      topic: (topic || "").trim() || null,
      visibility,
      created_by: createdBy,
      project_id: projectId,
    };
    if (id) payload.id = id;
    const { data: row, error } = await sb.from(CONVERSATIONS).insert(payload).select("*").single();
    if (error) {
      console.error("[chat_conversations.createChannel]", error.message);
      return null;
    }
    const all = [...new Set([createdBy, ...memberIds])];
    await addMembers(sb, row.id, all, createdBy);
    return normalizeConversation(row, { meId: createdBy, memberIds: all, membership: { role: "admin" } });
  } catch (e) {
    console.error("[chat_conversations.createChannel]", e);
    return null;
  }
}

// The existing DM with a person in this project, or a new one. Deduped by a
// sorted dm_key; a lost insert race falls back to fetching the winner.
export async function createOrGetDm(meId, otherId, projectId) {
  if (!meId || !otherId || meId === otherId || !projectId || !isSupabaseConfigured()) return null;
  const dmKey = [meId, otherId].sort().join(":");
  try {
    const sb = schemaClient();
    const lookup = () =>
      sb
        .from(CONVERSATIONS)
        .select("*")
        .eq("project_id", projectId)
        .eq("dm_key", dmKey)
        .is("deleted_at", null)
        .maybeSingle();

    let { data: row } = await lookup();
    if (!row) {
      const { data: created, error } = await sb
        .from(CONVERSATIONS)
        .insert({ kind: "dm", dm_key: dmKey, created_by: meId, project_id: projectId })
        .select("*")
        .single();
      if (error) {
        ({ data: row } = await lookup());
        if (!row) {
          console.error("[chat_conversations.createOrGetDm]", error.message);
          return null;
        }
      } else {
        row = created;
      }
    }

    await addMembers(sb, row.id, [meId, otherId]);
    const { data: membership } = await sb
      .from(MEMBERS)
      .select("pinned, muted, role, last_read_at")
      .eq("conversation_id", row.id)
      .eq("profile_id", meId)
      .maybeSingle();
    return normalizeConversation(row, { meId, memberIds: [meId, otherId], membership: membership || {} });
  } catch (e) {
    console.error("[chat_conversations.createOrGetDm]", e);
    return null;
  }
}

export async function inviteMembers(conversationId, profileIds = []) {
  if (!conversationId || !profileIds.length || !isSupabaseConfigured()) return false;
  try {
    return await addMembers(schemaClient(), conversationId, profileIds);
  } catch (e) {
    console.error("[chat_conversations.invite]", e);
    return false;
  }
}

// Rename a channel or change its topic ({ name, topic }).
export async function updateConversation(id, { name, topic } = {}) {
  if (!id || !isSupabaseConfigured()) return false;
  const patch = {};
  if (name !== undefined) patch.name = (name || "").trim().replace(/^#/, "");
  if (topic !== undefined) patch.topic = (topic || "").trim() || null;
  if (patch.name === "") return false;
  try {
    const { error } = await schemaClient().from(CONVERSATIONS).update(patch).eq("id", id);
    if (error) {
      console.error("[chat_conversations.update]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_conversations.update]", e);
    return false;
  }
}

// One of my own membership flags ({ pinned } / { muted } / { last_read_at }).
async function updateMembership(conversationId, meId, patch, tag) {
  if (!conversationId || !meId || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(MEMBERS)
      .update(patch)
      .eq("conversation_id", conversationId)
      .eq("profile_id", meId);
    if (error) {
      console.error(`[chat_conversations.${tag}]`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[chat_conversations.${tag}]`, e);
    return false;
  }
}

export const setPinned = (conversationId, meId, pinned) =>
  updateMembership(conversationId, meId, { pinned: !!pinned }, "setPinned");

export const setMuted = (conversationId, meId, muted) =>
  updateMembership(conversationId, meId, { muted: !!muted }, "setMuted");

export const markRead = (conversationId, meId) =>
  updateMembership(conversationId, meId, { last_read_at: new Date().toISOString() }, "markRead");

// Leave a channel / drop a DM from my list (removes my membership only).
export async function leaveConversation(conversationId, meId) {
  if (!conversationId || !meId || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(MEMBERS)
      .delete()
      .eq("conversation_id", conversationId)
      .eq("profile_id", meId);
    if (error) {
      console.error("[chat_conversations.leave]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[chat_conversations.leave]", e);
    return false;
  }
}

// Guarantee the project has its #general channel, then join every public channel
// I'm not in yet, so team-wide channels show up for everyone.
export async function ensureChannelMembership(meId, projectId) {
  if (!meId || !projectId || !isSupabaseConfigured()) return false;
  try {
    const sb = schemaClient();
    const findGeneral = () =>
      sb
        .from(CONVERSATIONS)
        .select("id")
        .eq("project_id", projectId)
        .eq("kind", "channel")
        .ilike("name", GENERAL)
        .is("deleted_at", null)
        .limit(1);

    let { data: general } = await findGeneral();
    if (!general?.length) {
      const { error } = await sb.from(CONVERSATIONS).insert({
        kind: "channel",
        name: GENERAL,
        topic: "Team-wide updates and conversation",
        visibility: "public",
        created_by: meId,
        project_id: projectId,
      });
      // A lost create race is fine — the other tab's #general is picked up below.
      if (error) console.warn("[chat_conversations.ensureGeneral]", error.message);
    }

    const { data: publicChannels } = await sb
      .from(CONVERSATIONS)
      .select("id")
      .eq("project_id", projectId)
      .eq("kind", "channel")
      .eq("visibility", "public")
      .is("deleted_at", null);
    const ids = (publicChannels || []).map((c) => c.id);
    if (!ids.length) return true;

    const { data: joined } = await sb
      .from(MEMBERS)
      .select("conversation_id")
      .eq("profile_id", meId)
      .in("conversation_id", ids);
    const have = new Set((joined || []).map((m) => m.conversation_id));
    const rows = ids.filter((id) => !have.has(id)).map((id) => ({ conversation_id: id, profile_id: meId }));
    if (rows.length) {
      await sb.from(MEMBERS).upsert(rows, { onConflict: "conversation_id,profile_id", ignoreDuplicates: true });
    }
    return true;
  } catch (e) {
    console.error("[chat_conversations.ensureMembership]", e);
    return false;
  }
}

// Realtime: my membership rows changing (joined, invited, left, pinned elsewhere).
export function subscribeMembership(meId, handler) {
  if (!meId) return () => {};
  return subscribeTable("chat-membership", { table: MEMBERS, filter: `profile_id=eq.${meId}` }, (row, type, old) =>
    handler?.(row, type, old),
  );
}

// Realtime: anyone's read marker or membership moving — the screen keeps read
// receipts and member lists for the conversations it shows.
export function subscribeMembers(handler) {
  return subscribeTable("chat-members", { table: MEMBERS }, (row, type, old) => handler?.(row, type, old));
}

// Realtime: a channel renamed, its topic changed, or a conversation removed.
export function subscribeConversations(projectId, handler) {
  if (!projectId) return () => {};
  return subscribeTable(
    "chat-conversations",
    { table: CONVERSATIONS, event: "UPDATE", filter: `project_id=eq.${projectId}` },
    (row) => handler?.(row),
  );
}
