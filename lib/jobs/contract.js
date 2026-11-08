import { timingSafeEqual } from "node:crypto";

// Scheduled-job contract (server-only). A job module exports
// { key, label, description, schedule, run: async ({ admin, now }) => result }
// where result = { processed, created, skipped, errors: [message | projectError(projectId, message)] }. Jobs run
// across every project with the service-role client and must be idempotent
// (safe to re-run for the same day).
// A job in an optional vertical sets `module` (lib/modules.js): one-project runs skip while it's off; run gets `moduleOn(projectId, key = module)` to filter rows.

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
export function authorizeScheduler(authorization, secret = process.env.CRON_SECRET) {
  if (typeof secret !== "string" || !secret.length || typeof authorization !== "string") return false;
  const actual = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const emptyResult = () => ({ processed: 0, created: 0, skipped: 0, errors: [] });

// A failure in one project's records: its review item lands in that project's queue only (PLAT-01b).
export const projectError = (projectId, message) => (projectId ? { projectId, message: String(message) } : String(message));

export const errorMessage = (e) => (e && typeof e === "object" ? String(e.message ?? "") : String(e));
export const errorProject = (e) => (e && typeof e === "object" && e.projectId) || null;
