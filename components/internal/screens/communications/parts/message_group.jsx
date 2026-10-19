"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Info, MessagesSquare, MoreHorizontal, Pencil, Reply, SmilePlus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { ME, getPerson } from "@/lib/chat/people_store";
import { cn } from "@/lib/utils";
import { REACTIONS, REACTION_MAP, clockTime } from "../constants";
import { MessageAttachments } from "./message_attachments";
import { MessageText } from "./message_text";
import { UserAvatar } from "./user_avatar";

// Scroll to (and briefly highlight) the message a reply points at.
function jumpToMessage(id) {
  const el = id ? document.getElementById(`msg-${id}`) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary/50", "rounded-2xl");
  setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "rounded-2xl"), 1300);
}

function ReplyQuote({ replyTo, isMe }) {
  const who = replyTo.authorId === ME.id ? "You" : getPerson(replyTo.authorId).firstName;
  return (
    <button
      type="button"
      onClick={() => jumpToMessage(replyTo.id)}
      title="Go to message"
      className={cn(
        "mb-1 flex max-w-full items-center gap-1.5 rounded-lg border-l-2 bg-surface-hover/70 px-2 py-1 text-left text-xs transition-colors hover:bg-surface-hover",
        isMe ? "border-primary/60" : "border-border-strong",
      )}
    >
      <Reply className="h-3 w-3 shrink-0 text-primary" />
      <span className="shrink-0 font-medium text-foreground">{who}</span>
      <span className="truncate text-text-secondary">{replyTo.text || "Attachment"}</span>
    </button>
  );
}

function Reactions({ msg, onReact }) {
  const entries = Object.entries(msg.reactions || {}).filter(([key, ids]) => REACTION_MAP[key] && ids?.length);
  if (!entries.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([key, ids]) => {
        const { icon: Icon, label, colorClass } = REACTION_MAP[key];
        const mine = ids.includes(ME.id);
        const names = ids.map((id) => (id === ME.id ? "You" : getPerson(id).firstName)).join(", ");
        return (
          <button
            key={key}
            type="button"
            onClick={onReact ? () => onReact(msg, key) : undefined}
            title={`${label}: ${names}`}
            aria-label={`${label}: ${ids.length}`}
            className={cn(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors",
              mine ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-surface-card text-text-secondary hover:bg-surface-hover",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", colorClass)} />
            <span className="leading-none tabular-nums">{ids.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function ThreadPill({ thread, onOpen }) {
  const count = thread.replyCount || 0;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(thread)}
      className="mt-1 flex items-center gap-1.5 rounded-full border border-border bg-surface-card px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <MessagesSquare className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium text-foreground">{count ? `${count} ${count === 1 ? "reply" : "replies"}` : "Thread"}</span>
    </button>
  );
}

function ToolbarButton({ label, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// Hover toolbar: react, reply, thread, and a menu with copy / info / edit / delete.
function MessageActions({ msg, isMe, onReact, onReply, onStartThread, onInfo, onEdit, onDelete }) {
  const copy = () => {
    navigator.clipboard?.writeText(msg.text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Couldn't copy the message."),
    );
  };
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 self-start rounded-full border border-border bg-surface-subtle p-0.5 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100",
        isMe ? "mr-1" : "ml-1",
      )}
    >
      {onReact ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="React"
              title="React"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <SmilePlus className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isMe ? "end" : "start"} className="flex gap-0.5 border-border bg-surface-subtle p-1">
            {REACTIONS.map(({ key, label, icon: Icon, colorClass }) => (
              <DropdownMenuItem key={key} onSelect={() => onReact(msg, key)} aria-label={label} title={label} className="cursor-pointer rounded-md p-2">
                <Icon className={cn("h-4 w-4", colorClass)} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {onReply ? <ToolbarButton label="Reply" icon={Reply} onClick={() => onReply(msg)} /> : null}
      {onStartThread ? <ToolbarButton label="Reply in thread" icon={MessagesSquare} onClick={() => onStartThread(msg)} /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More actions"
            title="More"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isMe ? "end" : "start"} className="w-44 border-border bg-surface-subtle">
          {msg.text ? (
            <DropdownMenuItem onSelect={copy}>
              <Copy className="h-4 w-4" /> Copy text
            </DropdownMenuItem>
          ) : null}
          {onInfo ? (
            <DropdownMenuItem onSelect={() => onInfo(msg)}>
              <Info className="h-4 w-4" /> Message info
            </DropdownMenuItem>
          ) : null}
          {isMe && onEdit && msg.text ? (
            <DropdownMenuItem onSelect={() => onEdit(msg)}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
          ) : null}
          {isMe && onDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onDelete(msg)} className="text-red-600 focus:bg-red-500/10 dark:text-red-400">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// In-place editor for my own message: Enter saves, Escape cancels.
function InlineEditor({ msg, onSave, onCancel }) {
  const [value, setValue] = useState(msg.text);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const save = () => {
    const clean = value.trim();
    if (!clean || clean === msg.text) onCancel();
    else onSave(msg, clean);
  };
  return (
    <div className="w-full min-w-[16rem] max-w-md rounded-2xl border border-border-strong bg-surface-card p-2">
      <textarea
        ref={ref}
        value={value}
        rows={Math.min(6, Math.max(1, value.split("\n").length))}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onCancel();
        }}
        className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-text-secondary">Enter to save · Esc to cancel</p>
    </div>
  );
}

// A run of consecutive messages by one author: avatar and name once, then each
// bubble with its reply quote, attachments, reactions, thread pill and toolbar.
export function MessageGroup({ group, onReact, onReply, onInfo, onStartThread, threadsByRoot, onOpenThread, onEdit, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const author = getPerson(group.authorId);
  const isMe = group.authorId === ME.id;

  const saveEdit = (msg, text) => {
    setEditingId(null);
    onEdit?.(msg, text);
  };

  return (
    <div className={cn("flex gap-3 px-3 md:px-6", isMe && "flex-row-reverse")}>
      <div className="pt-0.5">
        <UserAvatar person={author} size="sm" />
      </div>
      <div className={cn("flex min-w-0 max-w-[78%] flex-col gap-1", isMe && "items-end")}>
        <div className={cn("flex items-baseline gap-2", isMe && "flex-row-reverse")}>
          <span className="text-xs font-semibold text-foreground">{isMe ? "You" : author.name}</span>
          <span className="text-[11px] text-text-secondary">{clockTime(group.items[0].createdAt)}</span>
        </div>
        {group.items.map((msg) => (
          <div key={msg.id} id={`msg-${msg.id}`} className={cn("group/msg flex items-center", isMe && "flex-row-reverse")}>
            <div className={cn("flex min-w-0 flex-col", isMe && "items-end")}>
              {msg.replyTo ? <ReplyQuote replyTo={msg.replyTo} isMe={isMe} /> : null}
              {editingId === msg.id ? (
                <InlineEditor msg={msg} onSave={saveEdit} onCancel={() => setEditingId(null)} />
              ) : msg.text ? (
                <div
                  className={cn(
                    "w-fit max-w-full rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    isMe ? "rounded-tr-md bg-primary text-primary-foreground" : "rounded-tl-md border border-border bg-surface-card text-foreground",
                  )}
                >
                  <MessageText text={msg.text} mentions={msg.mentions} onPrimary={isMe} />
                  {msg.editedAt ? (
                    <span className={cn("ml-1.5 text-[10px]", isMe ? "text-primary-foreground/70" : "text-text-tertiary")}>(edited)</span>
                  ) : null}
                </div>
              ) : null}
              <MessageAttachments attachments={msg.attachments} isMe={isMe} />
              <Reactions msg={msg} onReact={onReact} />
              {threadsByRoot?.[msg.id] ? <ThreadPill thread={threadsByRoot[msg.id]} onOpen={onOpenThread} /> : null}
            </div>
            {editingId !== msg.id ? (
              <MessageActions
                msg={msg}
                isMe={isMe}
                onReact={onReact}
                onReply={onReply}
                onStartThread={threadsByRoot?.[msg.id] ? undefined : onStartThread}
                onInfo={onInfo}
                onEdit={onEdit ? (m) => setEditingId(m.id) : undefined}
                onDelete={onDelete}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
