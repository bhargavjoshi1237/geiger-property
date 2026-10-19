"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Globe, Loader2 } from "lucide-react";
import { useChat } from "@/lib/chat/chat_context";
import { ME, getPerson, isExternalPerson } from "@/lib/chat/people_store";
import { useTyping } from "@/lib/chat/use_typing";
import { cn } from "@/lib/utils";
import { groupTimeline } from "../chat_utils";
import { CallEventCard } from "./call_event_card";
import { Composer } from "./composer";
import { FilesPanel } from "./files_panel";
import { MessageGroup } from "./message_group";
import { MessageInfoDialog } from "./message_info_dialog";
import { ThreadHeader } from "./thread_header";
import { ThreadPanel } from "./thread_panel";
import { TypingIndicator } from "./typing_indicator";
import { useTimelineScroll } from "./use_timeline_scroll";

// The open conversation: header, timeline (paged backwards on scroll), read
// receipt, typing indicator and composer, plus the Threads / Files side panel.
// Controlled — the screen owns the data and persistence. Remounted per
// conversation (keyed by id), so local state starts fresh.
export function ChatThread({
  conversation,
  threads = [],
  files = [],
  filesLoading = false,
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
  onLoadFiles,
  onSend,
  onReact,
  onEdit,
  onDelete,
  onCreateThread,
  onRenameThread,
  onDeleteThread,
  onThreadActivity,
  onInvite,
  onCall,
  onOpenDetails,
  onBack,
  onClose,
}) {
  const { projectName } = useChat();
  const [replyTo, setReplyTo] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  const [panel, setPanel] = useState(null); // null | "threads" | "files"
  const [openThreadId, setOpenThreadId] = useState(null);
  const topRef = useRef(null);
  const { typingIds, notifyTyping, notifyStopped } = useTyping(conversation.id, ME.id);
  const messages = useMemo(() => conversation.messages || [], [conversation.messages]);
  const { scrollRef, onScroll, beforeLoadOlder } = useTimelineScroll(messages, { typingCount: typingIds.length, loadingOlder });

  const requestOlder = useCallback(() => {
    if (!hasMore || loadingOlder) return;
    beforeLoadOlder();
    onLoadOlder?.(conversation.id);
  }, [hasMore, loadingOlder, onLoadOlder, conversation.id, beforeLoadOlder]);

  useEffect(() => {
    const node = topRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && requestOlder(), {
      root: scrollRef.current,
      rootMargin: "140px 0px 0px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, requestOlder, scrollRef]);

  const timeline = useMemo(() => groupTimeline(messages), [messages]);
  const threadsByRoot = useMemo(() => Object.fromEntries(threads.filter((t) => t.rootMessageId).map((t) => [t.rootMessageId, t])), [threads]);

  // "Seen" on my last DM message once the other person's read marker passes it.
  const receipt = useMemo(() => {
    if (conversation.type !== "dm") return null;
    const last = messages[messages.length - 1];
    if (!last || last.authorId !== ME.id || last.call) return null;
    const read = conversation.reads?.[conversation.participantId];
    return { seen: !!read && new Date(read).getTime() >= new Date(last.createdAt).getTime() };
  }, [conversation.type, conversation.reads, conversation.participantId, messages]);

  const togglePanel = (next) => {
    setOpenThreadId(null);
    setPanel((current) => {
      if (current === next) return null;
      if (next === "files") onLoadFiles?.(conversation.id);
      return next;
    });
  };

  const startThread = async (msg) => {
    const thread = await onCreateThread?.(msg);
    if (thread) {
      setPanel("threads");
      setOpenThreadId(thread.id);
    }
  };

  const openThread = (thread) => {
    setPanel("threads");
    setOpenThreadId(thread?.id ?? null);
  };

  const send = (text, attachments, mentions) => {
    onSend?.(text, attachments, mentions, replyTo);
    setReplyTo(null);
    notifyStopped();
  };

  const person = conversation.type === "dm" ? getPerson(conversation.participantId) : null;
  const external = person && isExternalPerson(person) ? person : null;
  const panelOpen = panel !== null;

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className={cn("flex h-full min-w-0 flex-1 flex-col", panelOpen && "hidden md:flex")}>
        <ThreadHeader
          conversation={conversation}
          panel={panel}
          threadCount={threads.length}
          onTogglePanel={togglePanel}
          onCall={onCall}
          onInvite={onInvite}
          onOpenDetails={onOpenDetails}
          onBack={onBack}
          onClose={onClose}
        />
        {external ? (
          <div className="flex items-center gap-2 border-b border-amber-500/15 bg-amber-500/[0.06] px-4 py-2 text-xs text-amber-700 dark:text-amber-400 md:px-6">
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">
              <span className="font-medium">{external.firstName}</span> isn&apos;t on the {projectName || "project"} team — this is an external
              conversation.
            </span>
          </div>
        ) : null}

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-5 overflow-y-auto py-5 scrollbar-subtle">
          {hasMore ? <div ref={topRef} /> : null}
          {loadingOlder ? (
            <div className="flex justify-center py-1">
              <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
            </div>
          ) : null}
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm font-medium text-foreground">
                {conversation.type === "channel" ? `This is the start of #${conversation.name}` : `This is the start of your conversation with ${person?.firstName}`}
              </p>
              <p className="text-xs text-text-secondary">Messages, files and calls shared here stay with this project.</p>
            </div>
          ) : (
            timeline.map((item) => {
              if (item.kind === "day") {
                return (
                  <div key={item.key} className="flex items-center gap-3 px-3 md:px-6" role="separator">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium text-text-tertiary">{item.label}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                );
              }
              if (item.kind === "call") {
                return <CallEventCard key={item.key} message={item.message} onCallBack={onCall} />;
              }
              return (
                <MessageGroup
                  key={item.key}
                  group={item}
                  onReact={onReact}
                  onReply={(m) => setReplyTo({ id: m.id, authorId: m.authorId, text: m.text })}
                  onInfo={setInfoMsg}
                  onStartThread={startThread}
                  threadsByRoot={threadsByRoot}
                  onOpenThread={openThread}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              );
            })
          )}
          {receipt && !typingIds.length ? (
            <div className="flex items-center justify-end gap-1 px-3 text-[11px] text-text-secondary md:px-6">
              {receipt.seen ? <CheckCheck className="h-3.5 w-3.5 text-primary" /> : <Check className="h-3.5 w-3.5" />}
              {receipt.seen ? "Seen" : "Sent"}
            </div>
          ) : null}
          <TypingIndicator ids={typingIds} />
        </div>

        <Composer
          placeholder={conversation.type === "channel" ? `Message #${conversation.name}` : `Message ${person?.firstName || ""}`}
          memberIds={conversation.memberIds}
          onSend={send}
          onTyping={notifyTyping}
          onCommand={(id) => onCall?.(id === "video" ? "video" : "audio")}
          replyingTo={replyTo ? { name: replyTo.authorId === ME.id ? "yourself" : getPerson(replyTo.authorId).firstName, text: replyTo.text } : null}
          onCancelReply={() => setReplyTo(null)}
        />

        <MessageInfoDialog message={infoMsg} conversation={conversation} open={!!infoMsg} onOpenChange={(open) => !open && setInfoMsg(null)} />
      </div>

      {panel === "threads" ? (
        <ThreadPanel
          conversation={conversation}
          threads={threads}
          openThreadId={openThreadId}
          onOpenThread={(t) => setOpenThreadId(t?.id ?? null)}
          onRename={onRenameThread}
          onDelete={async (thread) => {
            if ((await onDeleteThread?.(thread)) && openThreadId === thread.id) setOpenThreadId(null);
          }}
          onActivity={onThreadActivity}
          onClose={() => togglePanel("threads")}
        />
      ) : null}
      {panel === "files" ? <FilesPanel files={files} loading={filesLoading} onClose={() => setPanel(null)} /> : null}
    </div>
  );
}
