"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { realtimeClient, removeChannel } from "@/lib/supabase/chat_realtime";

// "X is typing…" for one conversation (or thread), over Supabase broadcast.
// Senders throttle to one event every few seconds; receivers drop a typist who
// has gone quiet. No-op without a live realtime backend.

const SEND_EVERY_MS = 2500;
const EXPIRE_MS = 5000;

export function useTyping(scopeId, meId) {
  const [typing, setTyping] = useState({}); // profileId -> last seen ms
  const channelRef = useRef(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    const sb = realtimeClient();
    if (!scopeId || !meId || !sb) return undefined;
    const channel = sb.channel(`property-chat-typing-${scopeId}`, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload?.from || payload.from === meId) return;
        setTyping((prev) => ({ ...prev, [payload.from]: Date.now() }));
      })
      .on("broadcast", { event: "stopped" }, ({ payload }) => {
        if (!payload?.from) return;
        setTyping((prev) => {
          if (!(payload.from in prev)) return prev;
          const next = { ...prev };
          delete next[payload.from];
          return next;
        });
      })
      .subscribe();
    channelRef.current = channel;

    const sweep = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const live = Object.entries(prev).filter(([, at]) => now - at < EXPIRE_MS);
        return live.length === Object.keys(prev).length ? prev : Object.fromEntries(live);
      });
    }, 1500);

    return () => {
      clearInterval(sweep);
      channelRef.current = null;
      removeChannel(sb, channel);
    };
  }, [scopeId, meId]);

  // Call on every keystroke; throttled internally.
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (!channelRef.current || now - lastSentRef.current < SEND_EVERY_MS) return;
    lastSentRef.current = now;
    channelRef.current.send({ type: "broadcast", event: "typing", payload: { from: meId } });
  }, [meId]);

  // Call when a message is sent so the indicator clears at once for others.
  const notifyStopped = useCallback(() => {
    lastSentRef.current = 0;
    channelRef.current?.send({ type: "broadcast", event: "stopped", payload: { from: meId } });
  }, [meId]);

  return { typingIds: Object.keys(typing), notifyTyping, notifyStopped };
}
