"use client";

import React from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@geiger/ui";
import { getPerson, usePeopleVersion } from "@/lib/chat/people_store";
import { UserAvatar } from "./user_avatar";

// Ringing modal for the callee. Dismissing declines.
export function IncomingCallDialog({ incoming, onAccept, onDecline }) {
  usePeopleVersion();
  if (!incoming) return null;
  const caller = getPerson(incoming.from);
  const name = caller.name !== "Unknown" ? caller.name : incoming.fromName || "Someone";
  const isVideo = incoming.kind === "video";
  const subtitle =
    incoming.type === "channel" && incoming.title
      ? `${isVideo ? "Video" : "Audio"} call · ${incoming.title}`
      : `Incoming ${isVideo ? "video" : "audio"} call`;

  return (
    <Dialog open onOpenChange={(open) => !open && onDecline?.()}>
      <DialogContent className="sm:max-w-xs" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <div className="relative mb-1">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <UserAvatar person={{ ...caller, name }} size="xl" />
          </div>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex items-center justify-center gap-8">
          <button type="button" onClick={onDecline} className="flex flex-col items-center gap-1.5" aria-label="Decline">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500">
              <PhoneOff className="h-5 w-5" />
            </span>
            <span className="text-xs text-text-secondary">Decline</span>
          </button>
          <button type="button" onClick={onAccept} className="flex flex-col items-center gap-1.5" aria-label="Accept">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-500">
              {isVideo ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            </span>
            <span className="text-xs text-text-secondary">Accept</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
