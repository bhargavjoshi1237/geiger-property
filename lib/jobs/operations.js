import {
  expiringDocumentsJob,
  leaseRemindersJob,
  rentRemindersJob,
  scheduledAnnouncementsJob,
} from "@/lib/messaging/reminder_jobs";
import { runAutomations } from "@/lib/automations/runner";
import { preventiveWorkOrdersJob } from "./preventive_work_orders";

// Operational scheduled jobs (reminders, preventive work orders, expiries,
// automations, scheduled messages). Each entry follows lib/jobs/contract.js;
// `projectId` (optional) narrows a staff "Run now" to one project.

export const automationsJob = {
  key: "automations",
  label: "Automation runner",
  description: "Turns record events into workflow runs, fires timed triggers, and resumes waiting steps.",
  schedule: "0 * * * *",
  intervalMinutes: 60,
  run: ({ admin, now, projectId }) => runAutomations({ admin, now, projectId }),
};

export const OPERATIONS_JOBS = [
  preventiveWorkOrdersJob,
  scheduledAnnouncementsJob,
  leaseRemindersJob,
  rentRemindersJob,
  expiringDocumentsJob,
  automationsJob,
];
