import { ME, getPerson } from "@/lib/chat/people_store";
import { dayLabel } from "./constants";

// View helpers for the chat UI that read the people store.

export function conversationTitle(conversation) {
  if (!conversation) return "";
  return conversation.type === "channel" ? `#${conversation.name}` : getPerson(conversation.participantId).name;
}

export function lastMessagePreview(conversation) {
  const last = conversation.messages?.[conversation.messages.length - 1];
  if (!last) return "";
  if (last.call) return last.call.status === "missed" ? "Missed call" : "Call ended";
  if (last.text) return last.text;
  return last.attachments?.length ? `Sent ${last.attachments.length > 1 ? `${last.attachments.length} files` : "a file"}` : "";
}

// "You: " for my last message, the author's first name in channels, nothing in a DM.
export function previewAuthor(conversation) {
  const last = conversation.messages?.[conversation.messages.length - 1];
  if (!last || last.call) return "";
  if (last.authorId === ME.id) return "You: ";
  return conversation.type === "channel" ? `${getPerson(last.authorId).firstName}: ` : "";
}

// A fetched page merged with what's already shown (realtime arrivals, optimistic
// sends), deduped by id and in time order — so a slow load never drops newer ones.
export function mergeTimeline(fetched = [], current = []) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of fetched) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// A reactions map with my reaction under `key` toggled (for optimistic updates).
export function toggleReactionIn(reactions, key) {
  const next = { ...(reactions || {}) };
  const ids = new Set(next[key] || []);
  if (ids.has(ME.id)) ids.delete(ME.id);
  else ids.add(ME.id);
  if (ids.size) next[key] = [...ids];
  else delete next[key];
  return next;
}

// Fold a timeline into day separators, call cards and runs of consecutive
// messages by one author (a run breaks after five quiet minutes).
export function groupTimeline(messages) {
  const items = [];
  let lastDay = null;
  for (const msg of messages) {
    const day = dayLabel(msg.createdAt);
    if (day && day !== lastDay) {
      items.push({ kind: "day", key: `day-${msg.id}`, label: day });
      lastDay = day;
    }
    if (msg.call) {
      items.push({ kind: "call", key: msg.id, message: msg });
      continue;
    }
    const prev = items[items.length - 1];
    const gap = prev?.kind === "group" ? new Date(msg.createdAt) - new Date(prev.items[prev.items.length - 1].createdAt) : Infinity;
    if (prev?.kind === "group" && prev.authorId === msg.authorId && gap < 5 * 60 * 1000) {
      prev.items.push(msg);
    } else {
      items.push({ kind: "group", key: `group-${msg.id}`, authorId: msg.authorId, items: [msg] });
    }
  }
  return items;
}

// Split message text into plain and @mention segments for the people it names.
export function mentionSegments(text, mentionIds = []) {
  if (!text || !mentionIds.length) return [{ text }];
  const names = mentionIds
    .map((id) => ({ id, name: id === ME.id ? ME.name : getPerson(id).name }))
    .filter((m) => m.name && m.name !== "Unknown")
    .sort((a, b) => b.name.length - a.name.length);
  if (!names.length) return [{ text }];
  const escaped = names.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(${escaped.join("|")})`, "g");
  const out = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    const person = names.find((m) => m.name === match[1]);
    out.push({ text: match[0], mentionId: person?.id, isMe: person?.id === ME.id });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
