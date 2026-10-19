"use client";

import React from "react";
import { getPerson } from "@/lib/chat/people_store";
import { UserAvatar } from "./user_avatar";

// "Alex is typing…" bubble for whoever is composing right now.
export function TypingIndicator({ ids = [] }) {
  if (!ids.length) return null;
  const people = ids.map(getPerson);
  const label =
    people.length === 1
      ? `${people[0].firstName} is typing`
      : people.length === 2
        ? `${people[0].firstName} and ${people[1].firstName} are typing`
        : "Several people are typing";
  return (
    <div className="flex items-center gap-3 px-3 md:px-6" aria-live="polite">
      <UserAvatar person={people[0]} size="sm" />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-surface-card px-3.5 py-2.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
      </div>
      <span className="text-xs text-text-secondary">{label}…</span>
    </div>
  );
}
