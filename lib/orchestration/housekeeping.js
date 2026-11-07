import { emptyResult } from "@/lib/jobs/contract";

// Review and retention housekeeping (server-only, idempotent): reopen snoozed
// review items whose snooze has passed, re-drive runs left "running" by an
// interrupted worker, soft-delete skipped-run explanations
// after 30 days and resolved or expired signals after 13 months (ORCH open
// decision 8). Soft delete only, per the migration conventions.

const DAY = 86400000;
export const SKIPPED_RUN_RETENTION_DAYS = 30;
export const RESOLVED_SIGNAL_RETENTION_DAYS = 396;
export const STALE_RUN_MINUTES = 15;

const scope = (q, projectId) => (projectId ? q.eq("project_id", projectId) : q);

export async function runHousekeeping({ admin, now = new Date(), projectId = null } = {}) {
  const result = emptyResult();
  if (!admin) return { ...result, errors: ["Service role not configured"] };
  const nowIso = now.toISOString();

  try {
    const { data, error } = await scope(
      admin
        .from("review_items")
        .update({ status: "open", snoozed_until: null })
        .eq("status", "snoozed")
        .lte("snoozed_until", nowIso)
        .is("deleted_at", null),
      projectId,
    ).select("id");
    if (error) throw new Error(`review_items: ${error.message}`);
    result.processed += data?.length || 0;
  } catch (e) {
    result.errors.push(e.message);
  }

  try {
    const stale = new Date(now.getTime() - STALE_RUN_MINUTES * 60000).toISOString();
    const { data, error } = await scope(
      admin
        .from("automation_runs")
        .update({ status: "retrying", next_retry_at: nowIso, error: "The run stopped part-way (the worker was interrupted) — resuming from the same step" })
        .eq("status", "running")
        .lt("updated_at", stale)
        .is("deleted_at", null),
      projectId,
    ).select("id");
    if (error) throw new Error(`stale runs: ${error.message}`);
    result.created += data?.length || 0;
  } catch (e) {
    result.errors.push(e.message);
  }

  try {
    const cutoff = new Date(now.getTime() - SKIPPED_RUN_RETENTION_DAYS * DAY).toISOString();
    const { data, error } = await scope(
      admin.from("automation_runs").update({ deleted_at: nowIso }).eq("status", "skipped").lt("started_at", cutoff).is("deleted_at", null),
      projectId,
    ).select("id");
    if (error) throw new Error(`automation_runs: ${error.message}`);
    result.skipped += data?.length || 0;
  } catch (e) {
    result.errors.push(e.message);
  }

  try {
    const cutoff = new Date(now.getTime() - RESOLVED_SIGNAL_RETENTION_DAYS * DAY).toISOString();
    const { data, error } = await scope(
      admin
        .from("signals")
        .update({ deleted_at: nowIso })
        .in("status", ["resolved", "expired"])
        .lt("last_seen_at", cutoff)
        .is("deleted_at", null),
      projectId,
    ).select("id");
    if (error) throw new Error(`signals: ${error.message}`);
    result.skipped += data?.length || 0;
  } catch (e) {
    result.errors.push(e.message);
  }

  return result;
}
