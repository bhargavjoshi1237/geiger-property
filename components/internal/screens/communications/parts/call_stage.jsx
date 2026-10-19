"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { ME, getPerson, usePeopleVersion } from "@/lib/chat/people_store";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./user_avatar";

function useElapsed(running) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
}

// One participant bound to a real MediaStream: <video> for video calls,
// otherwise their avatar plus a hidden <audio> so remote audio plays.
function MediaTile({ person, stream, showVideo, isSelf, big, statusLabel }) {
  const mediaRef = useRef(null);
  useEffect(() => {
    if (mediaRef.current && stream) mediaRef.current.srcObject = stream;
  }, [stream, showVideo]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-subtle",
        big ? "min-h-[260px]" : "min-h-[160px]",
      )}
    >
      {showVideo && stream ? (
        <video ref={mediaRef} autoPlay playsInline muted={isSelf} className="h-full w-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <UserAvatar person={person} size={big ? "xl" : "lg"} />
          {statusLabel ? <span className="text-xs text-text-secondary">{statusLabel}</span> : null}
          {!isSelf && stream ? <audio ref={mediaRef} autoPlay /> : null}
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
        {isSelf ? "You" : person.firstName}
      </span>
    </div>
  );
}

function ControlButton({ icon: Icon, label, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
        on
          ? "border-border-strong bg-surface-hover text-foreground hover:bg-surface-active"
          : "border-transparent bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

// Full-screen surface for a live call, driven by useCall().
export function CallStage({ call, status, remoteStreams, localStream, micOn, camOn, onToggleMic, onToggleCam, onHangup }) {
  usePeopleVersion();
  const isVideo = call?.kind === "video";
  const active = status === "active";
  const elapsed = useElapsed(active);
  const statusLabel = status === "calling" ? "Ringing…" : status === "connecting" ? "Connecting…" : active ? elapsed : "";

  const streamIds = Object.keys(remoteStreams || {});
  const shownIds = streamIds.length ? streamIds : call?.targetIds || [];
  const everyone = shownIds.length + 1;
  const big = everyone <= 2;
  const cols = everyone <= 2 ? "grid-cols-1 sm:grid-cols-2" : everyone <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-label={call?.title || "Call"}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        {active ? (
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> LIVE
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{call?.title || "Call"}</h2>
          <p className="text-[11px] text-text-secondary">
            {isVideo ? "Video call" : "Audio call"}
            {statusLabel ? ` · ${statusLabel}` : ""}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 scrollbar-subtle sm:p-4">
        <div className={cn("grid h-full gap-3", cols)}>
          {shownIds.map((id) => (
            <MediaTile
              key={id}
              person={getPerson(id)}
              stream={remoteStreams?.[id]}
              showVideo={isVideo}
              big={big}
              statusLabel={remoteStreams?.[id] ? "" : statusLabel}
            />
          ))}
          <MediaTile person={ME} stream={localStream} showVideo={isVideo && camOn} isSelf big={big} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-3">
        <ControlButton icon={micOn ? Mic : MicOff} label={micOn ? "Mute" : "Unmute"} on={micOn} onClick={onToggleMic} />
        {isVideo ? (
          <ControlButton icon={camOn ? Video : VideoOff} label={camOn ? "Stop video" : "Start video"} on={camOn} onClick={onToggleCam} />
        ) : null}
        <button
          type="button"
          onClick={onHangup}
          className="ml-1 flex h-11 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
        >
          <PhoneOff className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">{status === "calling" ? "Cancel" : "Leave"}</span>
        </button>
      </div>
    </div>
  );
}
