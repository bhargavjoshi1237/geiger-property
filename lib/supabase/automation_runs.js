import { makeEntityData } from "./entity_factory";

// Data-access layer for automation run history (owns `property.automation_runs`
// and reads `property.automation_events`); rows are written by the server runner.
export const automationRunsLayer = makeEntityData({
  table: "automation_runs",
  tag: "automationRuns",
  order: { col: "started_at", ascending: false },
  fields: [
    { key: "automationId", col: "automation_id", type: "uuid" },
    { key: "automationName", col: "automation_name", type: "text" },
    { key: "dedupeKey", col: "dedupe_key", type: "text" },
    { key: "eventId", col: "event_id", type: "uuid" },
    { key: "eventType", col: "event_type", type: "text" },
    { key: "recordType", col: "record_type", type: "text" },
    { key: "recordId", col: "record_id", type: "uuid" },
    { key: "recordLabel", col: "record_label", type: "text" },
    { key: "status", col: "status", type: "text", default: "pending" },
    { key: "currentStep", col: "current_step", type: "number" },
    { key: "resumeAt", col: "resume_at", type: "date" },
    { key: "steps", col: "steps", type: "text" },
    { key: "log", col: "log", type: "text" },
    { key: "error", col: "error", type: "text" },
    { key: "startedAt", col: "started_at", type: "date" },
    { key: "finishedAt", col: "finished_at", type: "date" },
  ],
});

export const listAutomationRuns = (automationId) =>
  automationId ? automationRunsLayer.list({ automationId }) : automationRunsLayer.list();

// Cancel a pending / waiting run so no further steps execute.
export const cancelAutomationRun = (id) =>
  automationRunsLayer.update(id, { status: "cancelled", finishedAt: new Date().toISOString() });

export const automationEventsLayer = makeEntityData({
  table: "automation_events",
  tag: "automationEvents",
  fields: [
    { key: "eventType", col: "event_type", type: "text" },
    { key: "sourceTable", col: "source_table", type: "text" },
    { key: "recordId", col: "record_id", type: "uuid" },
    { key: "status", col: "status", type: "text", default: "pending" },
    { key: "processedAt", col: "processed_at", type: "date" },
    { key: "error", col: "error", type: "text" },
  ],
});
