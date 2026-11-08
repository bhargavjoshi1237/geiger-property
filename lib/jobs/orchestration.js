import { runSignals } from "@/lib/signals/engine";
import { runBriefings } from "@/lib/signals/briefing";
import { runImpact } from "@/lib/orchestration/impact";
import { runHousekeeping } from "@/lib/orchestration/housekeeping";

// Orchestration jobs (lib/jobs/contract.js): the daily signals pass, the
// hourly briefing sender (each member gets theirs once a day at their send
// time), the nightly impact rollup and run/signal retention.
// Signals, impact and housekeeping only derive or tidy data, so "Run now" still works on a paused project (manualWhilePaused).

export const signalsJob = {
  key: "signals",
  label: "Signals",
  description: "Runs the rule detectors, upserts findings, resolves what's fixed and expires stale signals.",
  schedule: "50 10 * * *",
  manualWhilePaused: true,
  run: ({ admin, now, projectId }) => runSignals({ admin, now, projectId }),
};

export const briefingsJob = {
  key: "briefings",
  label: "Daily briefings",
  description: "Sends each member their role's briefing — in-app and by email — once a day at their send time.",
  schedule: "0 * * * *",
  intervalMinutes: 60,
  run: ({ admin, now, projectId }) => runBriefings({ admin, now, projectId }),
};

export const impactJob = {
  key: "impact",
  label: "Impact rollup",
  description: "Rolls automation runs, exceptions and collections into daily impact figures per workflow.",
  schedule: "30 2 * * *",
  manualWhilePaused: true,
  run: ({ admin, now, projectId }) => runImpact({ admin, now, projectId }),
};

export const housekeepingJob = {
  key: "orchestration-housekeeping",
  label: "Review & retention housekeeping",
  description: "Wakes snoozed review items, and clears skipped-run logs after 30 days, empty job runs after 14 days and resolved signals after 13 months.",
  schedule: "15 * * * *",
  intervalMinutes: 60,
  manualWhilePaused: true,
  run: ({ admin, now, projectId }) => runHousekeeping({ admin, now, projectId }),
  // The cross-project run also tidies project-less rows (operator job runs, snoozed project-less review items).
  projectless: ({ admin, now }) => runHousekeeping({ admin, now, projectless: true }),
};

export const ORCHESTRATION_JOBS = [signalsJob, briefingsJob, impactJob, housekeepingJob];
