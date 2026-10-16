import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { makeEntityData } from "./entity_factory";

// Data-access layer for the two-way Inbox (owns `property.message_threads` and
// `property.thread_messages`). Outbound email/SMS goes through /api/messages/send;
// this layer reads threads, logs manual inbound replies / notes, and updates status.

export const threadsLayer = makeEntityData({
  table: "message_threads",
  tag: "threads",
  order: { col: "last_message_at", ascending: false },
  fields: [
    { key: "subject", col: "subject", type: "text" },
    { key: "channel", col: "channel", type: "text", default: "email" },
    { key: "status", col: "status", type: "text", default: "Open" },
    { key: "partyType", col: "party_type", type: "text" },
    { key: "partyId", col: "party_id", type: "uuid" },
    { key: "partyName", col: "party_name", type: "text" },
    { key: "partyEmail", col: "party_email", type: "text" },
    { key: "partyPhone", col: "party_phone", type: "text" },
    { key: "leaseId", col: "lease_id", type: "uuid" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "unitId", col: "unit_id", type: "uuid" },
    { key: "assignedTo", col: "assigned_to", type: "uuid" },
    { key: "lastMessageAt", col: "last_message_at", type: "date" },
    { key: "lastMessagePreview", col: "last_message_preview", type: "text" },
    { key: "lastDirection", col: "last_direction", type: "text" },
    { key: "unreadCount", col: "unread_count", type: "number" },
    { key: "messageCount", col: "message_count", type: "number" },
  ],
});

export const threadMessagesLayer = makeEntityData({
  table: "thread_messages",
  tag: "threadMessages",
  order: { col: "sent_at", ascending: true },
  fields: [
    { key: "threadId", col: "thread_id", type: "uuid" },
    { key: "direction", col: "direction", type: "text", default: "outbound" },
    { key: "channel", col: "channel", type: "text", default: "email" },
    { key: "fromName", col: "from_name", type: "text" },
    { key: "fromAddress", col: "from_address", type: "text" },
    { key: "toAddress", col: "to_address", type: "text" },
    { key: "subject", col: "subject", type: "text" },
    { key: "body", col: "body", type: "text" },
    { key: "deliveryStatus", col: "delivery_status", type: "text", default: "logged" },
    { key: "deliveryError", col: "delivery_error", type: "text" },
    { key: "providerId", col: "provider_id", type: "text" },
    { key: "templateId", col: "template_id", type: "uuid" },
    { key: "sentAt", col: "sent_at", type: "date" },
  ],
});

export const listThreads = () => threadsLayer.list();
export const listThreadMessages = (threadId) => threadMessagesLayer.list({ threadId });
export const updateThread = (id, patch) => threadsLayer.update(id, patch);
export const markThreadRead = (id) => threadsLayer.update(id, { unreadCount: 0 });

// Threads for one party (tenant / owner / vendor detail tabs).
export const listThreadsForParty = (partyType, partyId) => threadsLayer.list({ partyType, partyId });

// Log a message by hand (an inbound reply received elsewhere, or an internal
// note) and roll the thread summary forward. Returns the new message or null.
export async function logThreadMessage(thread, { direction = "inbound", channel, body, subject, fromName, fromAddress }) {
  if (!thread?.id || !String(body || "").trim() || !isSupabaseConfigured()) return null;
  const sentAt = new Date().toISOString();
  const message = await threadMessagesLayer.create({
    id: crypto.randomUUID(),
    threadId: thread.id,
    direction,
    channel: channel || thread.channel || "email",
    body,
    subject: subject || thread.subject || "",
    fromName: fromName || "",
    fromAddress: fromAddress || "",
    deliveryStatus: direction === "inbound" ? "received" : "logged",
    sentAt,
  });
  if (!message) return null;
  try {
    const sb = createClient();
    await sb
      .from("message_threads")
      .update({
        last_message_at: sentAt,
        last_message_preview: String(body).replace(/\s+/g, " ").trim().slice(0, 160),
        last_direction: direction,
        message_count: Number(thread.messageCount || 0) + 1,
        ...(direction === "inbound" ? { status: "Open" } : {}),
      })
      .eq("id", thread.id);
  } catch (e) {
    console.error("[threads.logMessage]", e);
  }
  return message;
}

export const threadsData = threadsLayer.data;
