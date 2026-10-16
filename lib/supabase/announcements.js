import { makeEntityData } from "./entity_factory";

// Data-access layer for Announcements — broadcasts to tenants, owners or vendors (owns `property.announcements`).
// Delivery runs server-side (/api/messages/announce, scheduled-announcements job); stats land in metadata.delivery.
export const announcementsLayer = makeEntityData({
  table: "announcements",
  tag: "announcements",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "audience", col: "audience", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "propertyName", col: "property_name", type: "text" },
    { key: "buildingId", col: "building_id", type: "uuid" },
    { key: "buildingName", col: "building_name", type: "text" },
    { key: "channel", col: "channel", type: "text" },
    { key: "scheduledFor", col: "scheduled_for", type: "date" },
    { key: "body", col: "body", type: "text" },
    { key: "status", col: "status", type: "text", default: "Draft" },
    { key: "sentAt", col: "sent_at", type: "date" },
  ],
});

export const announcementsData = announcementsLayer.data;
