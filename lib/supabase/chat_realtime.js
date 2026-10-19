"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";

// Realtime plumbing shared by the chat data layer (lib/supabase/chat_*.js).
// The schema-scoped data client can't open channels, and the landing playground's
// in-memory sandbox has no realtime at all — so live features resolve their own
// client here and quietly no-op when there is no live backend.

export function realtimeClient() {
  if (isSandbox() || !isSupabaseConfigured()) return null;
  return createClient();
}

// Subscribe to postgres changes on one property.<table>. The handler gets the new
// row, the event type and the old row. Returns an unsubscribe function.
export function subscribeTable(name, { table, event = "*", filter }, handler) {
  const sb = realtimeClient();
  if (!sb) return () => {};
  try {
    const opts = { event, schema: "property", table };
    if (filter) opts.filter = filter;
    const channel = sb
      .channel(`${name}-${crypto.randomUUID()}`)
      .on("postgres_changes", opts, (payload) => handler?.(payload.new, payload.eventType, payload.old))
      .subscribe();
    return () => removeChannel(sb, channel);
  } catch (e) {
    console.error(`[chat.${name}.subscribe]`, e);
    return () => {};
  }
}

export function removeChannel(sb, channel) {
  try {
    sb.removeChannel(channel);
  } catch {
    /* already closed */
  }
}
