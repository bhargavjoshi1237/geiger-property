import { makeEntityData } from "./entity_factory";

// Data-access layer for the scheduled-job log (owns `property.job_runs`, written by lib/jobs/execute.js): the project's own runs; cron runs are project-less, operator-only (PLAT-01b).
export const jobRunsLayer = makeEntityData({
  table: "job_runs",
  tag: "jobRuns",
  order: { col: "started_at", ascending: false },
  fields: [
    { key: "jobKey", col: "job_key", type: "text" },
    { key: "triggerSource", col: "trigger_source", type: "text", default: "cron" },
    { key: "status", col: "status", type: "text", default: "running" },
    { key: "startedAt", col: "started_at", type: "date" },
    { key: "finishedAt", col: "finished_at", type: "date" },
    { key: "processed", col: "processed", type: "number" },
    { key: "created", col: "created", type: "number" },
    { key: "skipped", col: "skipped", type: "number" },
    { key: "errorCount", col: "error_count", type: "number" },
    { key: "errors", col: "errors", type: "text" },
  ],
});

export const listJobRuns = () => jobRunsLayer.list();
