"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Hash, MessageSquare, SearchX } from "lucide-react";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { useChat } from "@/lib/chat/chat_context";
import { ME, ensurePeople, hydratePeople, isExternalPerson, usePeopleVersion } from "@/lib/chat/people_store";
import { deliverMessage } from "@/lib/chat/deliver_message";
import { buildOptimisticAttachments, revokeOptimistic } from "@/lib/chat/attachments";
import { findProfile } from "@/lib/supabase/chat_profiles";
import {
  createChannel,
  createOrGetDm,
  inviteMembers,
  leaveConversation,
  listConversations,
  markRead,
  setMuted,
  setPinned,
  subscribeConversations,
  subscribeMembers,
  subscribeMembership,
  updateConversation,
} from "@/lib/supabase/chat_conversations";
import {
  editMessage,
  listMessages,
  normalizeMessage,
  restoreMessage,
  softDeleteMessage,
  subscribeMessages,
  toggleReaction,
} from "@/lib/supabase/chat_messages";
import { createThread, listThreads, renameThread, softDeleteThread, subscribeThreads } from "@/lib/supabase/chat_threads";
import { listFilesByConversation } from "@/lib/supabase/chat_files";
import { notifyPeople } from "@/lib/supabase/chat_notifications";
import { cn } from "@/lib/utils";
import { useCallApi } from "./call_provider";
import { mergeTimeline, toggleReactionIn } from "./chat_utils";
import { ChatThread } from "./parts/chat_thread";
import { ConversationList } from "./parts/conversation_list";
import { DetailsSheet } from "./parts/details_sheet";
import { ExternalContactDialog } from "./parts/external_contact_dialog";

const PAGE = 30;

// Data-owning container for Messages (DMs) and Channels: loads my conversations,
// keeps them live over realtime, and persists every action optimistically. The
// open conversation comes from the URL (?conversation=<id>).
export function ChatScreen({ variant, title, conversationId, onOpenConversation, onNavigate }) {
  usePeopleVersion();
  const { projectId, me } = useChat();
  const { callConversation } = useCallApi();
  const tab = variant === "channel" ? "Channels" : "Messages";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [detailsId, setDetailsId] = useState(null);
  const [externalPending, setExternalPending] = useState(null);

  const itemsRef = useRef([]);
  const activeIdRef = useRef(conversationId);
  const loadedRef = useRef(new Set()); // conversations whose timeline is loaded
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    activeIdRef.current = conversationId;
  }, [conversationId]);

  const patchConversation = useCallback((id, patch) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) } : c)));
  }, []);

  const openConversation = useCallback((id) => onOpenConversation(id, variant), [onOpenConversation, variant]);
  const closeConversation = useCallback(() => onNavigate(tab), [onNavigate, tab]);

  // Re-read the list, keeping timelines, threads and files already loaded.
  const refresh = useCallback(async () => {
    const convs = await listConversations(me.id, variant, projectId);
    if (!convs) return false;
    await ensurePeople(convs.flatMap((c) => c.memberIds));
    setItems((prev) => {
      const old = Object.fromEntries(prev.map((c) => [c.id, c]));
      return convs.map((c) => {
        const kept = old[c.id];
        const merged = kept && loadedRef.current.has(c.id) ? { ...c, messages: kept.messages, hasMore: kept.hasMore } : c;
        return {
          ...merged,
          threads: kept?.threads,
          files: kept?.files,
          unread: c.id === activeIdRef.current ? 0 : c.unread,
        };
      });
    });
    return true;
  }, [me.id, variant, projectId]);

  useEffect(() => {
    let cancelled = false;
    refresh().then((ok) => {
      if (cancelled) return;
      if (!ok) toast.error("Couldn't load conversations.");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const refreshThreads = useCallback(
    async (id) => {
      const threads = id ? await listThreads(id) : null;
      if (threads) patchConversation(id, { threads });
    },
    [patchConversation],
  );

  // Opening a conversation: mark it read, load its threads, and its timeline once.
  const activeExists = items.some((c) => c.id === conversationId);
  useEffect(() => {
    if (!conversationId || !activeExists) return;
    const id = conversationId;
    const needsTimeline = !loadedRef.current.has(id);
    if (needsTimeline) loadedRef.current.add(id);
    Promise.all([markRead(id, me.id), listThreads(id), needsTimeline ? listMessages(id, { limit: PAGE }) : null]).then(
      async ([, threads, msgs]) => {
        if (needsTimeline && !msgs) {
          loadedRef.current.delete(id);
          toast.error("Couldn't load messages.");
        }
        if (msgs) await ensurePeople(msgs.map((m) => m.authorId));
        setItems((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  unread: 0,
                  ...(threads ? { threads } : {}),
                  ...(msgs ? { messages: mergeTimeline(msgs, c.messages), hasMore: msgs.length === PAGE } : {}),
                }
              : c,
          ),
        );
      },
    );
  }, [conversationId, activeExists, me.id]);

  // --- realtime ---------------------------------------------------------------

  useEffect(
    () =>
      subscribeMessages((row, type) => {
        if (!row?.id) return;
        const convId = row.conversation_id;
        if (!itemsRef.current.some((c) => c.id === convId)) return;
        // Thread replies stay out of the timeline; just refresh the reply counts.
        if (row.thread_id) {
          if (convId === activeIdRef.current) refreshThreads(convId);
          return;
        }
        if (row.author_id) ensurePeople([row.author_id]);
        const msg = normalizeMessage(row);
        const isActive = convId === activeIdRef.current;
        setItems((prev) => {
          const conv = prev.find((c) => c.id === convId);
          if (!conv) return prev;
          const msgs = conv.messages || [];
          const index = msgs.findIndex((m) => m.id === msg.id);
          if (msg.deleted) {
            return index === -1 ? prev : prev.map((c) => (c.id === convId ? { ...c, messages: msgs.filter((m) => m.id !== msg.id) } : c));
          }
          if (index >= 0) {
            return prev.map((c) => (c.id === convId ? { ...c, messages: msgs.map((m) => (m.id === msg.id ? msg : m)) } : c));
          }
          if (type !== "INSERT") return prev;
          const updated = {
            ...conv,
            messages: loadedRef.current.has(convId) ? [...msgs, msg] : [msg],
            lastActivityAt: msg.createdAt,
            unread: isActive || msg.authorId === ME.id ? conv.unread : (conv.unread || 0) + 1,
          };
          return [updated, ...prev.filter((c) => c.id !== convId)];
        });
        if (type === "INSERT" && isActive && row.author_id !== ME.id) markRead(convId, ME.id);
      }),
    [refreshThreads],
  );

  // Joined / left somewhere → reload the list; pin or mute changed elsewhere → patch it.
  // My own read-marker updates land here too and need nothing.
  useEffect(
    () =>
      subscribeMembership(me.id, (row, type) => {
        if (type !== "UPDATE") {
          refresh();
          return;
        }
        if (row?.conversation_id && itemsRef.current.some((c) => c.id === row.conversation_id)) {
          patchConversation(row.conversation_id, { pinned: !!row.pinned, muted: !!row.muted });
        }
      }),
    [me.id, refresh, patchConversation],
  );

  // Other members' read markers (receipts) and joins / leaves.
  useEffect(
    () =>
      subscribeMembers((row, type, old) => {
        const convId = row?.conversation_id || old?.conversation_id;
        if (!convId || !itemsRef.current.some((c) => c.id === convId)) return;
        if (type === "UPDATE" && row.profile_id !== ME.id) {
          patchConversation(convId, (c) => ({ reads: { ...(c.reads || {}), [row.profile_id]: row.last_read_at } }));
        } else if (type === "INSERT") {
          ensurePeople([row.profile_id]);
          patchConversation(convId, (c) => ({ memberIds: [...new Set([...(c.memberIds || []), row.profile_id])] }));
        } else if (type === "DELETE" && old?.profile_id) {
          patchConversation(convId, (c) => ({ memberIds: (c.memberIds || []).filter((id) => id !== old.profile_id) }));
        }
      }),
    [patchConversation],
  );

  // Renamed / re-topiced channels, or a removed conversation.
  useEffect(
    () =>
      subscribeConversations(projectId, (row) => {
        if (!itemsRef.current.some((c) => c.id === row.id)) return;
        if (row.deleted_at) {
          setItems((prev) => prev.filter((c) => c.id !== row.id));
          return;
        }
        patchConversation(row.id, { name: row.name || "", topic: row.topic || "", visibility: row.visibility || "public" });
      }),
    [projectId, patchConversation],
  );

  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeThreads(conversationId, () => refreshThreads(conversationId));
  }, [conversationId, refreshThreads]);

  // --- actions ----------------------------------------------------------------

  const updateMessages = (convId, fn) => patchConversation(convId, (c) => ({ messages: fn(c.messages || []) }));

  const handleSend = async (text, files, mentions, replyTo) => {
    const conv = itemsRef.current.find((c) => c.id === activeIdRef.current);
    if (!conv) return;
    const id = crypto.randomUUID();
    const optimistic = buildOptimisticAttachments(files);
    const now = new Date().toISOString();
    setItems((prev) => {
      const current = prev.find((c) => c.id === conv.id);
      if (!current) return prev;
      const message = { id, authorId: ME.id, text, createdAt: now, reactions: {}, replyTo, mentions, attachments: optimistic };
      const updated = { ...current, messages: [...(current.messages || []), message], lastActivityAt: now };
      return [updated, ...prev.filter((c) => c.id !== conv.id)];
    });
    const { saved, failedUploads } = await deliverMessage({ projectId, conversation: conv, id, text, files, optimistic, replyTo, mentions });
    if (failedUploads) toast.error("Some files couldn't be uploaded.");
    if (saved) {
      updateMessages(conv.id, (msgs) => msgs.map((m) => (m.id === id ? saved : m)));
      // Keep an already-loaded Files panel in step with the new upload.
      if (files.length && itemsRef.current.find((c) => c.id === conv.id)?.files) handleLoadFiles(conv.id);
    } else {
      updateMessages(conv.id, (msgs) => msgs.filter((m) => m.id !== id));
      toast.error("Couldn't send the message.");
    }
    setTimeout(() => revokeOptimistic(optimistic), 10000);
  };

  const handleReact = async (msg, key) => {
    const convId = activeIdRef.current;
    updateMessages(convId, (msgs) => msgs.map((m) => (m.id === msg.id ? { ...m, reactions: toggleReactionIn(m.reactions, key) } : m)));
    if (!(await toggleReaction(msg.id, key, ME.id))) {
      updateMessages(convId, (msgs) => msgs.map((m) => (m.id === msg.id ? { ...m, reactions: msg.reactions } : m)));
      toast.error("Couldn't update the reaction.");
    }
  };

  const handleEdit = async (msg, text) => {
    const convId = activeIdRef.current;
    updateMessages(convId, (msgs) => msgs.map((m) => (m.id === msg.id ? { ...m, text, editedAt: new Date().toISOString() } : m)));
    if (!(await editMessage(msg.id, text))) {
      updateMessages(convId, (msgs) => msgs.map((m) => (m.id === msg.id ? msg : m)));
      toast.error("Couldn't edit the message.");
    }
  };

  const handleDelete = async (msg) => {
    const convId = activeIdRef.current;
    const reinsert = () =>
      updateMessages(convId, (msgs) => [...msgs.filter((m) => m.id !== msg.id), msg].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
    updateMessages(convId, (msgs) => msgs.filter((m) => m.id !== msg.id));
    if (!(await softDeleteMessage(msg.id))) {
      reinsert();
      toast.error("Couldn't delete the message.");
      return;
    }
    toast.success("Message deleted", {
      action: {
        label: "Undo",
        onClick: async () => {
          if (await restoreMessage(msg.id)) reinsert();
          else toast.error("Couldn't restore the message.");
        },
      },
    });
  };

  const handleLoadOlder = async (id) => {
    const conv = itemsRef.current.find((c) => c.id === id);
    const oldest = conv?.messages?.[0]?.createdAt;
    if (!oldest) return;
    setLoadingOlder(true);
    const older = await listMessages(id, { before: oldest, limit: PAGE });
    if (older) await ensurePeople(older.map((m) => m.authorId));
    setLoadingOlder(false);
    if (!older) {
      toast.error("Couldn't load older messages.");
      return;
    }
    patchConversation(id, (c) => {
      const seen = new Set((c.messages || []).map((m) => m.id));
      return { messages: [...older.filter((m) => !seen.has(m.id)), ...(c.messages || [])], hasMore: older.length === PAGE };
    });
  };

  const handleLoadFiles = async (id) => {
    setFilesLoading(true);
    const files = await listFilesByConversation(id);
    setFilesLoading(false);
    if (!files) toast.error("Couldn't load files.");
    patchConversation(id, { files: files || [] });
  };

  const handleCreateThread = async (msg) => {
    const convId = activeIdRef.current;
    const id = crypto.randomUUID();
    const threadTitle = (msg.text || msg.attachments?.[0]?.name || "Thread").trim().slice(0, 60) || "Thread";
    const optimistic = { id, conversationId: convId, rootMessageId: msg.id, title: threadTitle, createdBy: ME.id, lastActivityAt: new Date().toISOString(), replyCount: 0 };
    patchConversation(convId, (c) => ({ threads: [optimistic, ...(c.threads || [])] }));
    const created = await createThread({ id, conversationId: convId, rootMessageId: msg.id, title: threadTitle, createdBy: ME.id });
    if (!created) {
      patchConversation(convId, (c) => ({ threads: (c.threads || []).filter((t) => t.id !== id) }));
      toast.error("Couldn't start the thread.");
      return null;
    }
    return created;
  };

  const handleRenameThread = async (threadId, threadTitle) => {
    const convId = activeIdRef.current;
    const before = itemsRef.current.find((c) => c.id === convId)?.threads || [];
    patchConversation(convId, (c) => ({ threads: (c.threads || []).map((t) => (t.id === threadId ? { ...t, title: threadTitle } : t)) }));
    const ok = await renameThread(threadId, threadTitle);
    if (!ok) patchConversation(convId, { threads: before });
    return ok;
  };

  const handleDeleteThread = async (thread) => {
    const convId = activeIdRef.current;
    const before = itemsRef.current.find((c) => c.id === convId)?.threads || [];
    patchConversation(convId, (c) => ({ threads: (c.threads || []).filter((t) => t.id !== thread.id) }));
    const ok = await softDeleteThread(thread.id);
    if (ok) toast.success("Thread deleted");
    else {
      patchConversation(convId, { threads: before });
      toast.error("Couldn't delete the thread.");
    }
    return ok;
  };

  const notifyInvited = (conversation, ids) =>
    notifyPeople(ids.filter((id) => id !== ME.id), {
      projectId,
      type: "channel_invite",
      title: `${ME.name} added you to #${conversation.name}`,
      body: conversation.topic || "",
      actorId: ME.id,
      conversationId: conversation.id,
    });

  const handleCreateChannel = async (draft) => {
    const created = await createChannel({ id: crypto.randomUUID(), ...draft, createdBy: ME.id, projectId });
    if (!created) {
      toast.error("Couldn't create the channel — the name may already be taken.");
      return;
    }
    loadedRef.current.add(created.id);
    setItems((prev) => [{ ...created, messages: [], hasMore: false }, ...prev]);
    notifyInvited(created, draft.memberIds);
    toast.success(`Created #${created.name}`);
    openConversation(created.id);
  };

  const openDmWith = async (person) => {
    hydratePeople([person]);
    const conv = await createOrGetDm(ME.id, person.id, projectId);
    if (!conv) {
      toast.error("Couldn't start the conversation.");
      return;
    }
    setItems((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]));
    openConversation(conv.id);
  };

  const handleStartDm = async (target) => {
    let person = target;
    if (target?.query) {
      person = await findProfile(target.query);
      if (!person) {
        toast.error("No one with that email or username has used chat yet.");
        return;
      }
    }
    if (!person?.id) return;
    if (person.id === ME.id) {
      toast.error("That's you.");
      return;
    }
    if (isExternalPerson(person)) setExternalPending(person);
    else openDmWith(person);
  };

  const handleInvite = async (ids) => {
    const conv = itemsRef.current.find((c) => c.id === activeIdRef.current);
    if (!conv || !ids.length) return;
    if (!(await inviteMembers(conv.id, ids))) {
      toast.error("Couldn't add people.");
      return;
    }
    patchConversation(conv.id, (c) => ({ memberIds: [...new Set([...(c.memberIds || []), ...ids])] }));
    notifyInvited(conv, ids);
    toast.success(ids.length > 1 ? `Added ${ids.length} people` : "Added 1 person");
  };

  const handlePin = async (conv, pinned) => {
    patchConversation(conv.id, { pinned });
    if (!(await setPinned(conv.id, ME.id, pinned))) {
      patchConversation(conv.id, { pinned: !pinned });
      toast.error("Couldn't update the pin.");
    }
  };

  const handleMute = async (conv, muted) => {
    patchConversation(conv.id, { muted });
    if (await setMuted(conv.id, ME.id, muted)) toast.success(muted ? "Notifications muted" : "Notifications on");
    else {
      patchConversation(conv.id, { muted: !muted });
      toast.error("Couldn't update notifications.");
    }
  };

  const handleMarkRead = async (conv) => {
    patchConversation(conv.id, { unread: 0 });
    await markRead(conv.id, ME.id);
  };

  const handleLeave = async (conv) => {
    setItems((prev) => prev.filter((c) => c.id !== conv.id));
    if (activeIdRef.current === conv.id) closeConversation();
    if (await leaveConversation(conv.id, ME.id)) {
      toast.success(conv.type === "channel" ? `Left #${conv.name}` : "Conversation removed");
    } else {
      toast.error("Couldn't remove the conversation.");
      refresh();
    }
  };

  const handleUpdateChannel = async (conv, patch) => {
    const before = { name: conv.name, topic: conv.topic };
    patchConversation(conv.id, patch);
    const ok = await updateConversation(conv.id, patch);
    if (ok) toast.success("Channel updated");
    else {
      patchConversation(conv.id, before);
      toast.error("Couldn't update the channel — the name may already be taken.");
    }
    return ok;
  };

  const active = items.find((c) => c.id === conversationId) || null;
  const detailsConversation = items.find((c) => c.id === detailsId) || null;
  const EmptyIcon = variant === "channel" ? Hash : MessageSquare;

  return (
    <div className="relative flex h-full min-h-0">
      <div className={cn("h-full w-full md:block md:w-auto", conversationId && "hidden")}>
        <ConversationList
          title={title}
          variant={variant}
          items={items}
          activeId={conversationId}
          loading={loading}
          onSelect={(conv) => openConversation(conv.id)}
          onStartDm={handleStartDm}
          onCreateChannel={handleCreateChannel}
          menuProps={{
            onPin: handlePin,
            onMute: handleMute,
            onMarkRead: handleMarkRead,
            onLeave: handleLeave,
            onOpenDetails: (conv) => setDetailsId(conv.id),
          }}
        />
      </div>

      <div className={cn("h-full min-w-0 flex-1 md:flex", conversationId ? "flex" : "hidden")}>
        {active ? (
          <ChatThread
            key={active.id}
            conversation={active}
            threads={active.threads || []}
            files={active.files || []}
            filesLoading={filesLoading}
            hasMore={!!active.hasMore}
            loadingOlder={loadingOlder}
            onLoadOlder={handleLoadOlder}
            onLoadFiles={handleLoadFiles}
            onSend={handleSend}
            onReact={handleReact}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCreateThread={handleCreateThread}
            onRenameThread={handleRenameThread}
            onDeleteThread={handleDeleteThread}
            onThreadActivity={() => refreshThreads(active.id)}
            onInvite={handleInvite}
            onCall={(kind) => callConversation(active, kind)}
            onOpenDetails={() => setDetailsId(active.id)}
            onBack={closeConversation}
            onClose={closeConversation}
          />
        ) : conversationId && !loading ? (
          <EmptyState
            icon={SearchX}
            title="Conversation not available"
            description="It may have been removed, or you're no longer a member."
            className="w-full"
          />
        ) : (
          <EmptyState
            icon={EmptyIcon}
            title={variant === "channel" ? "No channel selected" : "No conversation selected"}
            description={variant === "channel" ? "Pick a channel to jump back into the discussion." : "Pick a conversation, or start a new one."}
            className="w-full"
          />
        )}
      </div>

      <DetailsSheet
        conversation={detailsConversation}
        open={!!detailsConversation}
        onOpenChange={(open) => !open && setDetailsId(null)}
        onCall={(kind) => callConversation(detailsConversation, kind)}
        onMute={handleMute}
        onLeave={handleLeave}
        onUpdateChannel={handleUpdateChannel}
      />
      <ExternalContactDialog
        person={externalPending}
        onConfirm={() => {
          const person = externalPending;
          setExternalPending(null);
          if (person) openDmWith(person);
        }}
        onCancel={() => setExternalPending(null)}
      />
    </div>
  );
}
