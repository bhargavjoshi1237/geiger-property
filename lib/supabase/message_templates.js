import { makeEntityData } from "./entity_factory";

// Data-access layer for Message Templates — reusable message bodies (owns `property.message_templates`).
export const messageTemplatesLayer = makeEntityData({
  table: "message_templates",
  tag: "messageTemplates",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "category", col: "category", type: "text" },
    { key: "channel", col: "channel", type: "text" },
    { key: "subject", col: "subject", type: "text" },
    { key: "body", col: "body", type: "text" },
    { key: "status", col: "status", type: "text", default: "Active" },
  ],
});

export const messageTemplatesData = messageTemplatesLayer.data;
