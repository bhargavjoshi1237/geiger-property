"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ME, getPerson } from "./people_store";
import { notify } from "./browser_notifications";
import { listConversations, subscribeMembership } from "@/lib/supabase/chat_conversations";
import { subscribeMessages } from "@/lib/supabase/chat_messages";
import { listNotifications, subscribeNotifications } from "@/lib/supabase/chat_notifications";

// Workspace-level chat activity for the Communications host: unread counts for
// the rail badges (DMs, channels, Inbox) and desktop notifications for messages
// that arrive while the tab is hidden or the conversation isn't open. Honours
// mute, Do Not Disturb and the per-person notification preferences.

const INBOX_DESKTOP_TYPES = new Set(["missed_call", "channel_invite", "scheduled_call"]);

// id -> { type, name, participantId, muted, unread } for all my conversations.
async function fetchSummaries(meId, projectId) {
  const [dms, channels] = await Promise.all([
    listConversations(meId, "dm", projectId),
    listConversations(meId, "channel", projectId),
  ]);
  const next = {};
  for (const c of [...(dms || []), ...(channels || [])]) {
    next[c.id] = {
      type: c.type,
      name: c.type === "channel" ? `#${c.name}` : null,
      participantId: c.participantId || null,
      muted: c.muted,
      unread: c.unread,
      lastReadAt: c.lastReadAt,
    };
  }
  return next;
}

async function countUnreadNotifications(meId, projectId) {
  const rows = await listNotifications(meId, projectId);
  return rows ? rows.filter((n) => !n.read).length : null;
}

export function useChatActivity({ projectId, meId, openConversationId, onOpenConversation }) {
  const [conversations, setConversations] = useState({}); // id -> { type, name, muted, unread }
  const [inboxUnread, setInboxUnread] = useState(0);
  const conversationsRef = useRef({});
  const openRef = useRef(openConversationId);
  const openHandlerRef = useRef(onOpenConversation);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    openHandlerRef.current = onOpenConversation;
  }, [onOpenConversation]);

  useEffect(() => {
    openRef.current = openConversationId;
  }, [openConversationId]);

  const loadConversations = useCallback(async () => {
    if (meId && projectId) setConversations(await fetchSummaries(meId, projectId));
  }, [meId, projectId]);

  const loadInboxCount = useCallback(async () => {
    const count = meId && projectId ? await countUnreadNotifications(meId, projectId) : null;
    if (count !== null) setInboxUnread(count);
  }, [meId, projectId]);

  useEffect(() => {
    if (!meId || !projectId) return undefined;
    let cancelled = false;
    fetchSummaries(meId, projectId).then((next) => !cancelled && setConversations(next));
    countUnreadNotifications(meId, projectId).then((count) => !cancelled && count !== null && setInboxUnread(count));
    return () => {
      cancelled = true;
    };
  }, [meId, projectId]);

  // Joined / left a conversation, read it elsewhere, or (un)muted it.
  useEffect(() => {
    if (!meId) return undefined;
    return subscribeMembership(meId, (row, type) => {
      if (type !== "UPDATE" || !row?.conversation_id || !conversationsRef.current[row.conversation_id]) {
        loadConversations();
        return;
      }
      setConversations((prev) => {
        const current = prev[row.conversation_id];
        // Only a read marker that actually moved forward clears the badge (not a pin or mute).
        const advanced =
          row.last_read_at && new Date(row.last_read_at).getTime() > new Date(current.lastReadAt || 0).getTime();
        return {
          ...prev,
          [row.conversation_id]: {
            ...current,
            muted: !!row.muted,
            unread: advanced ? 0 : current.unread,
            lastReadAt: advanced ? row.last_read_at : current.lastReadAt,
          },
        };
      });
    });
  }, [meId, loadConversations]);

  useEffect(() => {
    if (!meId) return undefined;
    return subscribeMessages((row, type) => {
      if (type !== "INSERT" || !row || row.deleted_at || row.thread_id || row.author_id === ME.id) return;
      const conversation = conversationsRef.current[row.conversation_id];
      if (!conversation) return;

      const isOpen = openRef.current === row.conversation_id;
      if (!isOpen) {
        setConversations((prev) => ({
          ...prev,
          [row.conversation_id]: { ...prev[row.conversation_id], unread: (prev[row.conversation_id]?.unread || 0) + 1 },
        }));
      }

      const hidden = typeof document !== "undefined" && document.hidden;
      if ((isOpen && !hidden) || conversation.muted || ME.doNotDisturb) return;
      const mentioned = (row.metadata?.mentions || []).includes(ME.id);
      const wanted =
        conversation.type === "dm" ? ME.notify.dms : ME.notify.channels || (mentioned && ME.notify.mentions);
      if (!wanted) return;

      const author = getPerson(row.author_id);
      const where = conversation.type === "channel" ? conversation.name : null;
      notify({
        title: where ? `${author.name} in ${where}` : author.name,
        body: row.text || (row.metadata?.call ? "Call" : "Sent an attachment"),
        tag: `property-chat-${row.conversation_id}`,
        onClick: () => openHandlerRef.current?.(row.conversation_id, conversation.type),
      });
    });
  }, [meId]);

  useEffect(() => {
    if (!meId) return undefined;
    return subscribeNotifications(meId, (row, type) => {
      if (row?.project_id !== projectId) return;
      loadInboxCount();
      if (type !== "INSERT" || ME.doNotDisturb || !INBOX_DESKTOP_TYPES.has(row.type)) return;
      notify({ title: row.title, body: row.body || "", tag: `property-chat-inbox-${row.id}` });
    });
  }, [meId, projectId, loadInboxCount]);

  // The open conversation never counts — the screen is marking it read.
  const unread = (kind) =>
    Object.entries(conversations).reduce(
      (sum, [id, c]) => (c.type === kind && !c.muted && id !== openConversationId ? sum + (c.unread || 0) : sum),
      0,
    );

  return { unreadDms: unread("dm"), unreadChannels: unread("channel"), inboxUnread, refreshInbox: loadInboxCount };
}
