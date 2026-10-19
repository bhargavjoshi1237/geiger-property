"use client";

import { realtimeClient, removeChannel } from "./chat_realtime";

// WebRTC signaling over Supabase broadcast (ephemeral, no DB writes). Two kinds
// of channel, both namespaced to this product so they never cross with Flow's:
//   • a per-person RING channel carrying invite / cancel / decline / accept / busy,
//     so a callee is alerted without having the conversation open;
//   • a per-conversation CALL channel carrying the mesh negotiation
//     (join / offer / answer / ice / leave) between everyone in the call.

const ringChannel = (profileId) => `property-chat-ring-${profileId}`;
const callChannel = (conversationId) => `property-chat-call-${conversationId}`;

// Public STUN always; TURN only when configured (needed behind strict NATs).
export function iceServers() {
  const servers = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}

// True when live calls can work here (a realtime backend and WebRTC support).
export function callsSupported() {
  return Boolean(realtimeClient()) && typeof window !== "undefined" && "RTCPeerConnection" in window;
}

// Listen on my ring channel. Returns an unsubscribe function.
export function subscribeRing(profileId, handlers = {}) {
  const sb = realtimeClient();
  if (!profileId || !sb) return () => {};
  try {
    const channel = sb.channel(ringChannel(profileId), { config: { broadcast: { self: false } } });
    for (const event of ["invite", "cancel", "decline", "accept", "busy"]) {
      const key = `on${event[0].toUpperCase()}${event.slice(1)}`;
      channel.on("broadcast", { event }, ({ payload }) => handlers[key]?.(payload));
    }
    channel.subscribe();
    return () => removeChannel(sb, channel);
  } catch (e) {
    console.error("[chat_call_signaling.subscribeRing]", e);
    return () => {};
  }
}

// Join someone's ring channel, send one event, and fully leave again.
function sendRing(sb, id, event, payload) {
  return new Promise((resolve) => {
    const channel = sb.channel(ringChannel(id));
    let finished = false;
    const done = async () => {
      if (finished) return;
      finished = true;
      try {
        await sb.removeChannel(channel);
      } catch {
        /* already closed */
      }
      resolve();
    };
    const timeout = setTimeout(done, 5000);
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      clearTimeout(timeout);
      channel.send({ type: "broadcast", event, payload }).finally(done);
    });
  });
}

// realtime-js hands back the live channel for a topic that's still open, so two
// rings to one person must not overlap (a cancel right after an invite would be
// lost). Each person's rings run one after another.
const ringQueues = new Map();

// Fire one ring event at several people.
export async function ring(profileIds = [], event, payload) {
  const sb = realtimeClient();
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  if (!sb || !ids.length) return;
  await Promise.all(
    ids.map((id) => {
      const next = (ringQueues.get(id) || Promise.resolve()).then(() => sendRing(sb, id, event, payload));
      ringQueues.set(id, next);
      next.then(() => {
        if (ringQueues.get(id) === next) ringQueues.delete(id);
      });
      return next;
    }),
  );
}

// Join a conversation's call channel. Returns { send, leave } or null.
export function joinCall(conversationId, handlers = {}) {
  const sb = realtimeClient();
  if (!conversationId || !sb) return null;
  try {
    const channel = sb.channel(callChannel(conversationId), { config: { broadcast: { self: false } } });
    for (const event of ["join", "offer", "answer", "ice", "leave"]) {
      const key = `on${event[0].toUpperCase()}${event.slice(1)}`;
      channel.on("broadcast", { event }, ({ payload }) => handlers[key]?.(payload));
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") handlers.onReady?.();
    });
    return {
      send: (event, payload) => channel.send({ type: "broadcast", event, payload }),
      leave: () => removeChannel(sb, channel),
    };
  } catch (e) {
    console.error("[chat_call_signaling.joinCall]", e);
    return null;
  }
}
