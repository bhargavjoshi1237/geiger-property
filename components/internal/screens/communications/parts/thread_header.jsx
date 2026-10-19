"use client";

import React from "react";
import { ChevronLeft, Hash, Info, Lock, MessagesSquare, Paperclip, Phone, Pin, Users, Video, X } from "lucide-react";
import { getPerson, isExternalPerson } from "@/lib/chat/people_store";
import { cn } from "@/lib/utils";
import { PRESENCE } from "../constants";
import { InviteMembersDialog } from "./conversation_dialogs";
import { ExternalBadge } from "./external_badge";
import { AvatarStack, UserAvatar } from "./user_avatar";

function HeaderButton({ icon: Icon, label, onClick, active, count, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        active ? "bg-surface-active text-foreground" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
        className,
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {count ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}

// Conversation identity on the left; members, panels, calls and details on the right.
export function ThreadHeader({ conversation, panel, threadCount, onTogglePanel, onCall, onInvite, onOpenDetails, onBack, onClose }) {
  const isChannel = conversation.type === "channel";
  const person = isChannel ? null : getPerson(conversation.participantId);
  const external = !isChannel && isExternalPerson(person);
  const presence = person ? PRESENCE[person.presence] || PRESENCE.offline : null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-3 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground md:hidden"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={onOpenDetails} className="flex min-w-0 items-center gap-3 text-left">
          {isChannel ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
              {conversation.visibility === "private" ? <Lock className="h-4 w-4" /> : <Hash className="h-[18px] w-[18px]" />}
            </div>
          ) : (
            <UserAvatar person={person} size="md" showPresence />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold text-foreground">{isChannel ? conversation.name : person.name}</h2>
              {external ? <ExternalBadge /> : null}
              {conversation.pinned ? <Pin className="h-3 w-3 shrink-0 text-text-secondary" aria-label="Pinned" /> : null}
            </div>
            <p className="truncate text-xs text-text-secondary">
              {external ? "Outside this project's team" : isChannel ? conversation.topic || `${conversation.memberIds.length} members` : presence.label}
            </p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-1">
        {isChannel ? (
          <button type="button" onClick={onOpenDetails} title="View members" className="mr-1 hidden rounded-full p-0.5 transition-opacity hover:opacity-80 md:block">
            <AvatarStack people={conversation.memberIds.map(getPerson)} max={4} />
          </button>
        ) : null}
        {isChannel ? <InviteMembersDialog channelName={conversation.name} excludeIds={conversation.memberIds} onInvite={onInvite} /> : null}
        <HeaderButton icon={MessagesSquare} label="Threads" active={panel === "threads"} count={threadCount} onClick={() => onTogglePanel("threads")} />
        <HeaderButton icon={Paperclip} label="Files" active={panel === "files"} onClick={() => onTogglePanel("files")} />
        <HeaderButton icon={Phone} label="Start audio call" onClick={() => onCall("audio")} />
        <HeaderButton icon={Video} label="Start video call" onClick={() => onCall("video")} />
        <HeaderButton icon={isChannel ? Users : Info} label={isChannel ? "Channel details" : "Contact details"} onClick={onOpenDetails} className="hidden sm:flex" />
        <HeaderButton icon={X} label="Close conversation" onClick={onClose} className="hidden md:flex" />
      </div>
    </header>
  );
}
