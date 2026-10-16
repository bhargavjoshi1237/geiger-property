import { timingSafeEqual } from "node:crypto";

// Scheduled-job contract (server-only). A job module exports
// { key, label, description, schedule, run: async ({ admin, now }) => result }
// where result = { processed, created, skipped, errors: [message] }. Jobs run
// across every project with the service-role client and must be idempotent
// (safe to re-run for the same day).

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
export function authorizeScheduler(authorization, secret = process.env.CRON_SECRET) {
  if (typeof secret !== "string" || !secret.length || typeof authorization !== "string") return false;
  const actual = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const emptyResult = () => ({ processed: 0, created: 0, skipped: 0, errors: [] });
