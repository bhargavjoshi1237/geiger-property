import { makeEntityData } from "./entity_factory";

// Data-access layer for scheduled reports: saved report definitions (owns
// `property.report_schedules`) and the runs the scheduled_reports job sent
// (owns `property.report_runs`, written server-side; read-only here).

export const REPORT_FREQUENCIES = ["daily", "weekly", "monthly"];

export const reportSchedulesLayer = makeEntityData({
  table: "report_schedules",
  tag: "reportSchedules",
  fields: [
    { key: "name", col: "name", type: "text" },
    { key: "reportKey", col: "report_key", type: "text" },
    { key: "filters", col: "filters", type: "json", default: {} },
    { key: "recipients", col: "recipients", type: "json", default: [] },
    { key: "frequency", col: "frequency", type: "text", default: "monthly" },
    { key: "dayOfWeek", col: "day_of_week", type: "number", default: 1 },
    { key: "dayOfMonth", col: "day_of_month", type: "number", default: 1 },
    { key: "status", col: "status", type: "text", default: "Active" },
    { key: "lastRunAt", col: "last_run_at", type: "date" },
    { key: "lastStatus", col: "last_status", type: "text" },
  ],
});

export const reportRunsLayer = makeEntityData({
  table: "report_runs",
  tag: "reportRuns",
  fields: [
    { key: "scheduleId", col: "schedule_id", type: "uuid" },
    { key: "reportKey", col: "report_key", type: "text" },
    { key: "periodKey", col: "period_key", type: "text" },
    { key: "status", col: "status", type: "text" },
    { key: "recipients", col: "recipients", type: "json", default: [] },
    { key: "sentCount", col: "sent_count", type: "number" },
    { key: "rowCount", col: "row_count", type: "number" },
    { key: "summary", col: "summary", type: "json", default: [] },
    { key: "csv", col: "csv", type: "text" },
    { key: "html", col: "html", type: "text" },
    { key: "error", col: "error", type: "text" },
  ],
});

export const listReportSchedules = (reportKey) =>
  reportKey ? reportSchedulesLayer.list({ reportKey }) : reportSchedulesLayer.list();
export const createReportSchedule = (input) => reportSchedulesLayer.create(input);
export const updateReportSchedule = (id, patch) => reportSchedulesLayer.update(id, patch);
export const softDeleteReportSchedule = (id) => reportSchedulesLayer.softDelete(id);
export const listReportRuns = (scheduleId) =>
  scheduleId ? reportRunsLayer.list({ scheduleId }) : reportRunsLayer.list();
