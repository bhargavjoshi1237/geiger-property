"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@geiger/ui";
import { cn } from "@/lib/utils";
import { PRESENCE, initials } from "../constants";

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-9 text-sm",
  lg: "size-11 text-base",
  xl: "size-16 text-xl",
};

const DOT_SIZES = {
  xs: "h-1.5 w-1.5",
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
  xl: "h-3.5 w-3.5",
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// The suite's profile picture path (as in Flow); Radix falls back to initials
// when there's no image.
function pfpUrl(person) {
  if (!SUPABASE_URL || !person?.id) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/pfp/${person.id}/latest.jpg`;
}

export function UserAvatar({ person, size = "md", showPresence = false, className }) {
  if (!person) return null;
  const presence = PRESENCE[person.presence] || PRESENCE.offline;
  const url = pfpUrl(person);
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className={cn("ring-1 ring-border", SIZES[size])}>
        {url ? <AvatarImage src={url} alt={person.name} className="object-cover" /> : null}
        <AvatarFallback className="bg-surface-strong font-semibold uppercase text-foreground">
          {initials(person.name)}
        </AvatarFallback>
      </Avatar>
      {showPresence ? (
        <span
          className={cn("absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background", DOT_SIZES[size])}
          style={{ backgroundColor: presence.color }}
          title={presence.label}
        />
      ) : null}
    </div>
  );
}

// Overlapping avatars for channel members.
export function AvatarStack({ people = [], size = "sm", max = 4 }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((p) => (
          <div key={p.id} className="rounded-full ring-2 ring-background">
            <UserAvatar person={p} size={size} />
          </div>
        ))}
      </div>
      {extra > 0 ? <span className="ml-1.5 text-xs text-muted-foreground">+{extra}</span> : null}
    </div>
  );
}
