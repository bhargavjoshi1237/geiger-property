import { makeEntityData } from "./entity_factory";

// Data-access layer for Automations — stored trigger → action rules (owns `property.automations`).
export const automationsLayer = makeEntityData({
  table: "automations",
  tag: "automations",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "triggerEvent", col: "trigger_event", type: "text" },
    { key: "actionType", col: "action_type", type: "text" },
    { key: "enabled", col: "enabled", type: "bool" },
    { key: "status", col: "status", type: "text", default: "Draft" },
  ],
});

export const automationsData = automationsLayer.data;
