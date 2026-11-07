import { makeEntityData } from "./entity_factory";

// Data-access layer for Automations — workflow definitions (owns `property.automations`): trigger_event =
// trigger key; metadata.trigger / conditionRules / steps hold the workflow; the server runner executes them.
export const automationsLayer = makeEntityData({
  table: "automations",
  tag: "automations",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "triggerEvent", col: "trigger_event", type: "text" },
    { key: "actionType", col: "action_type", type: "text" },
    { key: "enabled", col: "enabled", type: "bool" },
    { key: "runCount", col: "run_count", type: "number" },
    { key: "lastRunOn", col: "last_run_on", type: "date" },
    { key: "status", col: "status", type: "text", default: "Draft" },
    // suggest | approve | approve_over | auto (ORCH-05); metadata.autonomyConfig holds appliesTo / threshold.
    { key: "autonomy", col: "autonomy", type: "text", default: "auto" },
  ],
});

export const automationsData = automationsLayer.data;
