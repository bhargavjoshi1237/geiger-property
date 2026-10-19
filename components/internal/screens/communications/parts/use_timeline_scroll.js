"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { ME } from "@/lib/chat/people_store";

const NEAR_BOTTOM_PX = 120;

// Scroll behaviour for a message timeline: open at the bottom, follow new
// messages only when I sent them or I'm already near the bottom, hold position
// while older pages prepend, and leave the view alone for edits and reactions.
export function useTimelineScroll(messages, { typingCount = 0, loadingOlder = false } = {}) {
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true);
  const firstIdRef = useRef(undefined);
  const lastIdRef = useRef(undefined);
  const pendingOlderRef = useRef(null); // scrollHeight before an older page loads

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  // Call right before requesting an older page.
  const beforeLoadOlder = useCallback(() => {
    if (scrollRef.current) pendingOlderRef.current = scrollRef.current.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const first = messages[0];
    const last = messages[messages.length - 1];
    const prevFirst = firstIdRef.current;
    const prevLast = lastIdRef.current;
    firstIdRef.current = first?.id;
    lastIdRef.current = last?.id;

    if (pendingOlderRef.current !== null && prevFirst && first?.id !== prevFirst) {
      el.scrollTop = el.scrollHeight - pendingOlderRef.current;
      pendingOlderRef.current = null;
      return;
    }
    if (last?.id !== prevLast && (prevLast === undefined || nearBottomRef.current || last?.authorId === ME.id)) {
      el.scrollTop = el.scrollHeight;
      nearBottomRef.current = true;
    }
  }, [messages]);

  // Keep the typing bubble in view when I'm following along.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && typingCount && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [typingCount]);

  // A load that failed or found nothing must not leave a stale anchor behind.
  useEffect(() => {
    if (!loadingOlder) pendingOlderRef.current = null;
  }, [loadingOlder]);

  return { scrollRef, onScroll, beforeLoadOlder };
}
