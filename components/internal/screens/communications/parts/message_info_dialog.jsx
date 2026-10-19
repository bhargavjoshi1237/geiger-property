"use client";

import React from "react";
import { Check, CheckCheck, Clock, Pencil, Smile, User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@geiger/ui";
import { ME, getPerson } from "@/lib/chat/people_store";
import { cn } from "@/lib/utils";
import { REACTION_MAP, dateTime } from "../constants";
import { MessageText } from "./message_text";
import { UserAvatar } from "./user_avatar";

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
      <span className="w-20 shrink-0 text-xs text-text-secondary">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{children}</span>
    </div>
  );
}

// Who sent a message, when, whether it has been seen (my DMs) or read by
// channel members, and who reacted.
export function MessageInfoDialog({ message, conversation, open, onOpenChange }) {
  if (!message) return null;
  const author = getPerson(message.authorId);
  const isMe = message.authorId === ME.id;
  const sentAt = new Date(message.createdAt).getTime();
  const readers = Object.entries(conversation?.reads || {})
    .filter(([id, at]) => id !== message.authorId && at && new Date(at).getTime() >= sentAt)
    .map(([id]) => getPerson(id));
  const reactions = Object.entries(message.reactions || {}).filter(([key, ids]) => REACTION_MAP[key] && ids?.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Message info</DialogTitle>
          <DialogDescription className="sr-only">Details for the selected message.</DialogDescription>
        </DialogHeader>
        {message.text ? (
          <div className="rounded-xl border border-border bg-surface-card px-3.5 py-2.5 text-sm text-foreground">
            <MessageText text={message.text} mentions={message.mentions} />
          </div>
        ) : null}
        <div className="flex flex-col">
          <InfoRow icon={User} label="From">
            <span className="flex items-center gap-2">
              <UserAvatar person={author} size="xs" />
              {isMe ? "You" : author.name}
            </span>
          </InfoRow>
          <InfoRow icon={Clock} label="Sent">{dateTime(message.createdAt)}</InfoRow>
          {message.editedAt ? <InfoRow icon={Pencil} label="Edited">{dateTime(message.editedAt)}</InfoRow> : null}
          {isMe ? (
            <InfoRow icon={readers.length ? CheckCheck : Check} label={conversation?.type === "dm" ? "Status" : "Read by"}>
              {conversation?.type === "dm" ? (
                <span className={readers.length ? "text-primary" : "text-text-secondary"}>{readers.length ? "Seen" : "Sent"}</span>
              ) : readers.length ? (
                readers.map((p) => p.firstName).join(", ")
              ) : (
                <span className="text-text-secondary">No one yet</span>
              )}
            </InfoRow>
          ) : null}
          {reactions.length ? (
            <InfoRow icon={Smile} label="Reactions">
              <span className="flex flex-wrap items-center gap-1.5">
                {reactions.map(([key, ids]) => {
                  const { icon: Icon, label, colorClass } = REACTION_MAP[key];
                  return (
                    <span
                      key={key}
                      title={`${label}: ${ids.map((id) => getPerson(id).firstName).join(", ")}`}
                      className="flex items-center gap-1 rounded-full border border-border bg-surface-card px-1.5 py-0.5 text-xs"
                    >
                      <Icon className={cn("h-3.5 w-3.5", colorClass)} />
                      {ids.length}
                    </span>
                  );
                })}
              </span>
            </InfoRow>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
