"use client";

import React from "react";
import { Phone, PhoneMissed, Video } from "lucide-react";
import { ME } from "@/lib/chat/people_store";
import { cn } from "@/lib/utils";
import { clockTime, durationLabel } from "../constants";

// Inline "a call happened" card in the timeline, with a call-back button.
export function CallEventCard({ message, onCallBack }) {
  const call = message.call || {};
  const missed = call.status === "missed";
  const isVideo = call.kind === "video";
  const Icon = missed ? PhoneMissed : isVideo ? Video : Phone;
  const label = missed ? (isVideo ? "Missed video call" : "Missed call") : isVideo ? "Video call ended" : "Call ended";
  const detail = missed ? "No answer" : durationLabel(call.durationSecs);
  const mine = call.initiatorId === ME.id;

  return (
    <div className={cn("flex px-3 md:px-6", mine ? "justify-end" : "justify-start")}>
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-surface-card px-4 py-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
            missed ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400" : "border-border-strong bg-surface-active text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          <p className="truncate text-xs text-text-secondary">
            {detail} · {clockTime(message.createdAt)}
          </p>
        </div>
        {onCallBack ? (
          <button
            type="button"
            onClick={() => onCallBack(call.kind || "audio")}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            {isVideo ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
            Call back
          </button>
        ) : null}
      </div>
    </div>
  );
}
