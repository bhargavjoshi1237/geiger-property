import { makeEntityData } from "./entity_factory";

// Data-access layer for per-recipient announcement delivery rows (owns
// `property.announcement_deliveries`; written by the server when an announcement goes out).
export const announcementDeliveriesLayer = makeEntityData({
  table: "announcement_deliveries",
  tag: "announcementDeliveries",
  order: { col: "sent_at", ascending: false },
  fields: [
    { key: "announcementId", col: "announcement_id", type: "uuid" },
    { key: "recipientKey", col: "recipient_key", type: "text" },
    { key: "recipientType", col: "recipient_type", type: "text" },
    { key: "recipientId", col: "recipient_id", type: "uuid" },
    { key: "recipientName", col: "recipient_name", type: "text" },
    { key: "address", col: "address", type: "text" },
    { key: "channel", col: "channel", type: "text" },
    { key: "status", col: "status", type: "text" },
    { key: "error", col: "error", type: "text" },
    { key: "sentAt", col: "sent_at", type: "date" },
  ],
});

export const listAnnouncementDeliveries = (announcementId) =>
  announcementDeliveriesLayer.list({ announcementId });
