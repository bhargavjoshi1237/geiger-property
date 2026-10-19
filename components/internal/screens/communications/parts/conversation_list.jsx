"use client";

import React, { useMemo, useRef, useState } from "react";
import { Bell, BellOff, CheckCheck, Hash, Info, Lock, LogOut, MessageSquare, Pin, PinOff, Trash2 } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@geiger/ui";
import { SearchInput } from "@/components/internal/shared/screen_kit";
import { getPerson, isExternalPerson } from "@/lib/chat/people_store";
import { cn } from "@/lib/utils";
import { fromNow } from "../constants";
import { conversationTitle, lastMessagePreview, previewAuthor } from "../chat_utils";
import { CreateChannelDialog, NewMessageDialog } from "./conversation_dialogs";
import { ExternalBadge } from "./external_badge";
import { UserAvatar } from "./user_avatar";

function RowMenu({ conversation, children, onPin, onMute, onMarkRead, onLeave, onOpenDetails }) {
  const isChannel = conversation.type === "channel";
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => onPin?.(conversation, !conversation.pinned)}>
          {conversation.pinned ? <PinOff /> : <Pin />} {conversation.pinned ? "Unpin" : "Pin to top"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onMute?.(conversation, !conversation.muted)}>
          {conversation.muted ? <Bell /> : <BellOff />} {conversation.muted ? "Unmute" : "Mute notifications"}
        </ContextMenuItem>
        <ContextMenuItem disabled={!conversation.unread} onSelect={() => onMarkRead?.(conversation)}>
          <CheckCheck /> Mark as read
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onOpenDetails?.(conversation)}>
          <Info /> {isChannel ? "Channel details" : "Contact details"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onLeave?.(conversation)}>
          {isChannel ? <LogOut /> : <Trash2 />} {isChannel ? "Leave channel" : "Remove from list"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ConversationRow({ conversation, active, onSelect, menuProps }) {
  const isChannel = conversation.type === "channel";
  const person = isChannel ? null : getPerson(conversation.participantId);
  const external = !isChannel && isExternalPerson(person);
  const bold = active || (conversation.unread && !conversation.muted);
  // The list re-orders live; selecting on mouse press means a re-order between
  // press and release can't swallow the click. Touch/keyboard keep plain click.
  const pressedAt = useRef(0);

  return (
    <RowMenu conversation={conversation} {...menuProps}>
      <button
        type="button"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button === 0) {
            pressedAt.current = Date.now();
            onSelect(conversation);
          }
        }}
        onClick={() => {
          if (Date.now() - pressedAt.current > 700) onSelect(conversation);
        }}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
          active ? "bg-surface-active" : "hover:bg-surface-hover",
        )}
      >
        {isChannel ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
            {conversation.visibility === "private" ? <Lock className="h-4 w-4" /> : <Hash className="h-[18px] w-[18px]" />}
          </div>
        ) : (
          <UserAvatar person={person} size="md" showPresence />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn("truncate text-sm text-foreground", bold ? "font-semibold" : "font-medium")}>
                {conversationTitle(conversation)}
              </span>
              {external ? <ExternalBadge label="Ext." className="px-1" /> : null}
              {conversation.muted ? <BellOff className="h-3 w-3 shrink-0 text-text-tertiary" aria-label="Muted" /> : null}
            </span>
            <span className="shrink-0 text-[11px] text-text-secondary">{fromNow(conversation.lastActivityAt)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-text-secondary">
              {previewAuthor(conversation)}
              {lastMessagePreview(conversation) || (isChannel ? conversation.topic : "")}
            </span>
            {conversation.unread ? (
              <span
                className={cn(
                  "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                  conversation.muted ? "bg-surface-hover text-text-secondary" : "bg-primary text-primary-foreground",
                )}
              >
                {conversation.unread > 99 ? "99+" : conversation.unread}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </RowMenu>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 px-1 pt-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-1.5 py-2">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-card" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-card" />
            <div className="h-2.5 w-3/4 animate-pulse rounded bg-surface-card" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Left column: search, pinned and recent conversations, and the new-DM /
// create-channel action. Selection is owned by the screen.
export function ConversationList({ title, variant, items, activeId, loading, onSelect, onStartDm, onCreateChannel, menuProps }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((c) => conversationTitle(c).toLowerCase().includes(q)) : items;
  }, [items, query]);
  const pinned = filtered.filter((c) => c.pinned);
  const rest = filtered.filter((c) => !c.pinned);
  const EmptyIcon = variant === "channel" ? Hash : MessageSquare;

  const renderRows = (rows) =>
    rows.map((c) => <ConversationRow key={c.id} conversation={c} active={c.id === activeId} onSelect={onSelect} menuProps={menuProps} />);

  return (
    <div className="flex h-full w-full flex-col border-r border-border md:w-80 lg:w-[336px]">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        {variant === "channel" ? <CreateChannelDialog onCreateChannel={onCreateChannel} /> : <NewMessageDialog onStartDm={onStartDm} />}
      </div>
      <div className="px-3 pb-2">
        <SearchInput expanded value={query} onChange={setQuery} placeholder={variant === "channel" ? "Search channels" : "Search people"} />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 scrollbar-subtle">
        {loading ? (
          <ListSkeleton />
        ) : (
          <>
            {pinned.length ? <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">Pinned</p> : null}
            {renderRows(pinned)}
            {pinned.length && rest.length ? (
              <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                {variant === "channel" ? "Channels" : "Recent"}
              </p>
            ) : null}
            {renderRows(rest)}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-card text-text-secondary">
                  <EmptyIcon className="h-5 w-5" />
                </div>
                <p className="text-sm text-text-secondary">
                  {query.trim()
                    ? "Nothing matches your search."
                    : variant === "channel"
                      ? "No channels yet. Create one for a building, a turn or a vendor."
                      : "No direct messages yet. Start one with a teammate."}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
