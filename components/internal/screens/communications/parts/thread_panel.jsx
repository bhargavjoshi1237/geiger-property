"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, Loader2, MessagesSquare, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@geiger/ui";
import { useChat } from "@/lib/chat/chat_context";
import { ME, ensurePeople, getPerson } from "@/lib/chat/people_store";
import { useTyping } from "@/lib/chat/use_typing";
import { deliverMessage } from "@/lib/chat/deliver_message";
import { buildOptimisticAttachments, revokeOptimistic } from "@/lib/chat/attachments";
import { editMessage, listMessages, normalizeMessage, softDeleteMessage, subscribeMessages, toggleReaction } from "@/lib/supabase/chat_messages";
import { fromNow } from "../constants";
import { groupTimeline, toggleReactionIn } from "../chat_utils";
import { Composer } from "./composer";
import { MessageGroup } from "./message_group";
import { TypingIndicator } from "./typing_indicator";
import { useTimelineScroll } from "./use_timeline_scroll";

const PAGE = 30;

// One open thread: its replies (paged, live) and a composer.
function ThreadView({ conversation, thread, onActivity }) {
  const { projectId } = useChat();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const topRef = useRef(null);
  const messagesRef = useRef([]);
  const { typingIds, notifyTyping, notifyStopped } = useTyping(thread.id, ME.id);
  const { scrollRef, onScroll, beforeLoadOlder } = useTimelineScroll(messages, { typingCount: typingIds.length, loadingOlder });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    listMessages(conversation.id, { threadId: thread.id, limit: PAGE }).then(async (rows) => {
      await ensurePeople((rows || []).map((m) => m.authorId));
      if (cancelled) return;
      setMessages(rows || []);
      setHasMore((rows?.length || 0) === PAGE);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [conversation.id, thread.id]);

  useEffect(
    () =>
      subscribeMessages((row, type) => {
        if (row?.thread_id !== thread.id) return;
        if (row.author_id) ensurePeople([row.author_id]);
        const msg = normalizeMessage(row);
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === row.id);
          if (msg.deleted) return i === -1 ? prev : prev.filter((m) => m.id !== row.id);
          if (i >= 0) return prev.map((m) => (m.id === row.id ? msg : m));
          return type === "INSERT" ? [...prev, msg] : prev;
        });
      }),
    [thread.id],
  );

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || loadingOlder || !hasMore) return;
    beforeLoadOlder();
    setLoadingOlder(true);
    const older = await listMessages(conversation.id, { threadId: thread.id, before: oldest.createdAt, limit: PAGE });
    await ensurePeople((older || []).map((m) => m.authorId));
    setMessages((prev) => [...(older || []).filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
    setHasMore((older?.length || 0) === PAGE);
    setLoadingOlder(false);
  }, [conversation.id, thread.id, hasMore, loadingOlder, beforeLoadOlder]);

  useEffect(() => {
    const node = topRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && loadOlder(), {
      root: scrollRef.current,
      rootMargin: "120px 0px 0px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadOlder, scrollRef]);

  const handleSend = async (text, files, mentions) => {
    const id = crypto.randomUUID();
    const optimistic = buildOptimisticAttachments(files);
    const reply = replyTo;
    setReplyTo(null);
    notifyStopped();
    setMessages((prev) => [
      ...prev,
      { id, authorId: ME.id, text, createdAt: new Date().toISOString(), reactions: {}, replyTo: reply, mentions, attachments: optimistic },
    ]);
    const { saved, failedUploads } = await deliverMessage({
      projectId, conversation, threadId: thread.id, id, text, files, optimistic, replyTo: reply, mentions,
    });
    if (failedUploads) toast.error("Some files couldn't be uploaded.");
    if (saved) {
      setMessages((prev) => prev.map((m) => (m.id === id ? saved : m)));
      onActivity?.();
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      toast.error("Couldn't send the reply.");
    }
    setTimeout(() => revokeOptimistic(optimistic), 10000);
  };

  const handleReact = async (msg, key) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: toggleReactionIn(m.reactions, key) } : m)));
    if (!(await toggleReaction(msg.id, key, ME.id))) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: msg.reactions } : m)));
      toast.error("Couldn't update the reaction.");
    }
  };

  const handleEdit = async (msg, text) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, text, editedAt: new Date().toISOString() } : m)));
    const saved = await editMessage(msg.id, text);
    if (!saved) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      toast.error("Couldn't edit the message.");
    }
  };

  const handleDelete = async (msg) => {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    if (await softDeleteMessage(msg.id)) {
      onActivity?.();
    } else {
      setMessages((prev) => [...prev, msg].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
      toast.error("Couldn't delete the message.");
    }
  };

  const timeline = useMemo(() => groupTimeline(messages), [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-4 overflow-y-auto py-4 scrollbar-subtle">
        {hasMore ? <div ref={topRef} /> : null}
        {loadingOlder ? (
          <div className="flex justify-center py-1">
            <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
          </div>
        ) : null}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <MessagesSquare className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-text-secondary">No replies yet. Start the thread.</p>
          </div>
        ) : (
          timeline.map((item) =>
            item.kind === "group" ? (
              <MessageGroup
                key={item.key}
                group={item}
                onReact={handleReact}
                onReply={(m) => setReplyTo({ id: m.id, authorId: m.authorId, text: m.text })}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ) : item.kind === "day" ? (
              <p key={item.key} className="text-center text-[11px] font-medium text-text-tertiary">{item.label}</p>
            ) : null,
          )
        )}
        <TypingIndicator ids={typingIds} />
      </div>
      <Composer
        placeholder="Reply in thread…"
        memberIds={conversation.memberIds}
        onSend={handleSend}
        onTyping={notifyTyping}
        replyingTo={replyTo ? { name: replyTo.authorId === ME.id ? "yourself" : getPerson(replyTo.authorId).firstName, text: replyTo.text } : null}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}

function ThreadRow({ thread, onOpen, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(thread.title);

  const commit = async () => {
    const clean = value.trim();
    setEditing(false);
    if (!clean || clean === thread.title) {
      setValue(thread.title);
      return;
    }
    if (!(await onRename(thread.id, clean))) {
      setValue(thread.title);
      toast.error("Couldn't rename the thread.");
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg px-2 py-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setEditing(false);
              setValue(thread.title);
            }
          }}
          aria-label="Thread name"
          className="h-8 flex-1 rounded-md border border-border-strong bg-surface-card px-2 text-sm text-foreground focus:outline-none"
        />
        <button type="button" onClick={commit} aria-label="Save" className="flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-hover">
          <Check className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover">
      <button type="button" onClick={() => onOpen(thread)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
          <MessagesSquare className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{thread.title}</span>
          <span className="block truncate text-xs text-text-secondary">
            {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"} · {fromNow(thread.lastActivityAt)}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Thread options"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary opacity-0 transition-opacity hover:bg-surface-active hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onDelete(thread)} className="text-red-600 focus:bg-red-500/10 dark:text-red-400">
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Right panel: the conversation's threads, or one open thread.
export function ThreadPanel({ conversation, threads, openThreadId, onOpenThread, onRename, onDelete, onActivity, onClose }) {
  const open = openThreadId ? threads.find((t) => t.id === openThreadId) : null;
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background md:w-[360px] md:border-l md:border-border">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          {open ? (
            <button
              type="button"
              onClick={() => onOpenThread(null)}
              aria-label="Back to threads"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <MessagesSquare className="ml-1 h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          )}
          <h3 className="truncate text-sm font-semibold text-foreground">{open ? open.title : "Threads"}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </header>
      {open ? (
        <ThreadView key={open.id} conversation={conversation} thread={open} onActivity={onActivity} />
      ) : (
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 scrollbar-subtle">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-card text-text-secondary">
                <MessagesSquare className="h-5 w-5" />
              </div>
              <p className="text-sm text-text-secondary">
                No threads yet. Hover a message and choose <span className="text-foreground">Reply in thread</span>.
              </p>
            </div>
          ) : (
            threads.map((t) => <ThreadRow key={t.id} thread={t} onOpen={onOpenThread} onRename={onRename} onDelete={onDelete} />)
          )}
        </div>
      )}
    </div>
  );
}
