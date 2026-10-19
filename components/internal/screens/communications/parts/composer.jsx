"use client";

import React, { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, ImageIcon, Paperclip, Phone, Reply, SendHorizonal, Video, X } from "lucide-react";
import { fileKind } from "@/lib/supabase/chat_files";
import { getPerson } from "@/lib/chat/people_store";
import { cn } from "@/lib/utils";
import { MAX_ATTACHMENT_BYTES, formatSize } from "../constants";
import { UserAvatar } from "./user_avatar";

const COMMANDS = [
  { id: "call", label: "/call", hint: "Start an audio call", icon: Phone },
  { id: "video", label: "/video", hint: "Start a video call", icon: Video },
];

// The "@word" being typed right before the caret, if any.
function mentionQueryAt(value, caret) {
  const match = /(^|\s)@([\w.-]{0,30})$/.exec(value.slice(0, caret));
  return match ? { query: match[2].toLowerCase(), start: caret - match[2].length - 1 } : null;
}

// Message input: auto-grows, Enter sends (Shift+Enter for a newline), "@" opens
// member suggestions, "/" opens call commands, and files can be attached by
// picker, paste or drop. `onSend(text, files, mentionIds)`.
export function Composer({
  placeholder = "Write a message…",
  onSend,
  onCommand,
  onTyping,
  replyingTo,
  onCancelReply,
  memberIds = [],
  allowAttachments = true,
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState([]);
  const [mentions, setMentions] = useState([]); // [{ id, name }]
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const ref = useRef(null);
  const fileRef = useRef(null);

  const mention = dismissed ? null : mentionQueryAt(value, caret);
  const suggestions = useMemo(() => {
    if (!mention) return [];
    return memberIds
      .map(getPerson)
      .filter((p) => p.name !== "Unknown" && p.name.toLowerCase().includes(mention.query))
      .slice(0, 6);
  }, [mention, memberIds]);
  const commands = !dismissed && /^\/\w*$/.test(value) ? COMMANDS.filter((c) => c.id.startsWith(value.slice(1).toLowerCase())) : [];
  const menu = suggestions.length ? "mention" : commands.length && onCommand ? "command" : null;
  const menuItems = menu === "mention" ? suggestions : commands;

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const addFiles = (list) => {
    if (!allowAttachments) return;
    const accepted = [];
    for (const f of list) {
      if (f.size > MAX_ATTACHMENT_BYTES) toast.error(`${f.name} is over 25 MB.`);
      else accepted.push(f);
    }
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };

  const reset = () => {
    setValue("");
    setFiles([]);
    setMentions([]);
    if (ref.current) ref.current.style.height = "auto";
  };

  const submit = () => {
    const text = value.trim();
    if (!text && !files.length) return;
    const mentionIds = [...new Set(mentions.filter((m) => text.includes(`@${m.name}`)).map((m) => m.id))];
    onSend?.(text, files, mentionIds);
    reset();
  };

  const pickMention = (person) => {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(caret);
    const next = `${before}@${person.name} ${after}`;
    const nextCaret = before.length + person.name.length + 2;
    setValue(next);
    setMentions((prev) => (prev.some((m) => m.id === person.id) ? prev : [...prev, { id: person.id, name: person.name }]));
    setCaret(nextCaret);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(nextCaret, nextCaret);
      resize();
    });
  };

  const runCommand = (cmd) => {
    onCommand?.(cmd.id);
    reset();
  };

  const choose = (index) => {
    const item = menuItems[Math.min(index, menuItems.length - 1)];
    if (!item) return;
    if (menu === "mention") pickMention(item);
    else runCommand(item);
  };

  const onKeyDown = (e) => {
    if (menu) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((i) => (i + step + menuItems.length) % menuItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(active);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === "Escape" && replyingTo) onCancelReply?.();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (e) => {
    setValue(e.target.value);
    setCaret(e.target.selectionStart ?? e.target.value.length);
    setDismissed(false);
    setActive(0);
    resize();
    if (e.target.value) onTyping?.();
  };

  return (
    <div
      className="relative px-3 pb-4 pt-1 md:px-6"
      onDragOver={(e) => {
        if (!allowAttachments || !e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!allowAttachments || !e.dataTransfer?.files?.length) return;
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {menu ? (
        <div className="absolute bottom-full left-3 right-3 z-20 mb-2 overflow-hidden rounded-xl border border-border bg-surface-subtle p-1 shadow-xl md:left-6 md:right-6">
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
            {menu === "mention" ? "Mention" : "Commands"}
          </p>
          {menuItems.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors", i === active ? "bg-surface-hover" : "hover:bg-surface-hover")}
            >
              {menu === "mention" ? (
                <>
                  <UserAvatar person={item} size="xs" />
                  <span className="truncate text-sm text-foreground">{item.name}</span>
                </>
              ) : (
                <>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card text-muted-foreground">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{item.label}</span>
                    <span className="block truncate text-xs text-text-secondary">{item.hint}</span>
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {replyingTo ? (
        <div className="mx-1 mb-1.5 flex items-center gap-2 rounded-lg border border-l-2 border-border border-l-primary/60 bg-surface-card px-2.5 py-1.5">
          <Reply className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">Replying to {replyingTo.name}</p>
            <p className="truncate text-xs text-text-secondary">{replyingTo.text || "Attachment"}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {files.length ? (
        <div className="mx-1 mb-1.5 flex flex-wrap gap-2">
          {files.map((f, i) => {
            const Icon = fileKind(f.name) === "image" ? ImageIcon : FileText;
            return (
              <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-surface-card py-1.5 pl-2 pr-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-hover text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 max-w-[160px]">
                  <span className="block truncate text-xs font-medium text-foreground">{f.name}</span>
                  <span className="block text-[11px] text-text-secondary">{formatSize(f.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border bg-surface-subtle px-2.5 py-2 transition-colors focus-within:border-border-strong",
          dragging ? "border-primary/60 bg-primary/5" : "border-border",
        )}
      >
        {allowAttachments ? (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach files"
              title="Attach files"
              className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Paperclip className="h-[17px] w-[17px]" />
            </button>
          </>
        ) : null}
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData?.files || []);
            if (!pasted.length || !allowAttachments) return;
            e.preventDefault();
            addFiles(pasted);
          }}
          placeholder={dragging ? "Drop files to attach" : placeholder}
          aria-label={placeholder}
          className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 text-foreground placeholder:text-text-secondary focus:outline-none scrollbar-subtle"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() && !files.length}
          aria-label="Send"
          title="Send"
          className={cn(
            "mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            value.trim() || files.length ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-surface-hover text-text-secondary",
          )}
        >
          <SendHorizonal className="h-[17px] w-[17px]" />
        </button>
      </div>
    </div>
  );
}
