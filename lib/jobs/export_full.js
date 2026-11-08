import { processQueuedExports } from "@/lib/data_io/export_server";

// export-full (PLAT-04): builds the exports staff queue from Settings → Import & Export (the whole project as ZIP parts, or a large
// entity CSV) into private storage and sends the requester 7-day links. Started by /api/export only: no cron, not in Run now.
// Runs while scheduled jobs are paused (it posts nothing and only emails the person who asked).
export const exportFullJob = {
  key: "export-full",
  label: "Data export",
  description: "Builds a requested export: every table as CSV, import-ready lists, stored documents and a manifest, zipped into private storage.",
  manual: true,
  manualWhilePaused: true,
  run: ({ admin, now, projectId }) => processQueuedExports(admin, { projectId, now }),
};
