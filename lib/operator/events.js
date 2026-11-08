import "server-only";

// Operator-only store (PLAT-01h): what belongs to no project, so no member may see it — inbound mail that names no thread or project
// address, and scheduler failures outside any project. property.operator_events is closed to clients (service role only); /operator
// lists it, with the scheduler's own failed runs, for PROPERTY_OPERATOR_EMAILS.

const TABLE = "operator_events";
export const OPERATOR_KINDS = { inbound_unattributed: "Unattributed inbound mail", job_failure: "Scheduler failure" };
const PROBLEM_RUNS = ["failed", "partial", "abandoned", "skipped_locked"];

// Record one event, or bump the open one with the same dedupe key → its id, or null. Never throws.
export async function recordOperatorEvent(admin, { kind, source = "", summary, detail = {}, dedupeKey = null, now = new Date() }) {
  if (!admin || !OPERATOR_KINDS[kind] || !summary) return null;
  const at = now.toISOString();
  const bump = async () => {
    const { data } = await admin.from(TABLE).select("id, occurrences").eq("dedupe_key", dedupeKey).is("resolved_at", null).is("deleted_at", null).limit(1);
    const open = data?.[0];
    if (!open) return null;
    await admin.from(TABLE).update({ occurrences: (open.occurrences || 1) + 1, last_seen_at: at, summary, detail }).eq("id", open.id);
    return open.id;
  };
  try {
    if (dedupeKey) {
      const id = await bump();
      if (id) return id;
    }
    const row = { kind, source: String(source).slice(0, 200), summary: String(summary).slice(0, 500), detail, dedupe_key: dedupeKey, first_seen_at: at, last_seen_at: at };
    const { data, error } = await admin.from(TABLE).insert(row).select("id").single();
    if (!error) return data?.id ?? null;
    // A concurrent writer opened the same event first.
    if (error.code === "23505" && dedupeKey) return await bump();
    console.error("[operator.record]", error.message);
    return null;
  } catch (e) {
    console.error("[operator.record]", e);
    return null;
  }
}

// Close the open events of one kind and source (a clean scheduler run) → how many. Never throws.
export async function resolveOperatorEvents(admin, { kind, source, now = new Date() }) {
  if (!admin) return 0;
  try {
    const { data } = await admin
      .from(TABLE)
      .update({ resolved_at: now.toISOString() })
      .eq("kind", kind)
      .eq("source", source)
      .is("resolved_at", null)
      .is("deleted_at", null)
      .select("id");
    return data?.length || 0;
  } catch (e) {
    console.error("[operator.resolve]", e);
    return 0;
  }
}

// Newest first: open events, then resolved ones from the last two weeks.
export async function listOperatorEvents(admin, { limit = 200, now = new Date() } = {}) {
  const since = new Date(now.getTime() - 14 * 86400000).toISOString();
  const { data, error } = await admin
    .from(TABLE)
    .select("id, kind, source, summary, detail, occurrences, first_seen_at, last_seen_at, resolved_at")
    .is("deleted_at", null)
    .or(`resolved_at.is.null,resolved_at.gte.${since}`)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`operator_events: ${error.message}`);
  return (data || []).map((r) => ({
    id: r.id,
    kind: r.kind,
    kindLabel: OPERATOR_KINDS[r.kind] || r.kind,
    source: r.source,
    summary: r.summary,
    detail: r.detail || {},
    occurrences: r.occurrences || 1,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    resolvedAt: r.resolved_at,
  }));
}

// The scheduler's own cross-project runs (project-less job_runs rows) that went wrong in the last two weeks.
export async function listOperatorRuns(admin, { limit = 50, now = new Date() } = {}) {
  const since = new Date(now.getTime() - 14 * 86400000).toISOString();
  const { data, error } = await admin
    .from("job_runs")
    .select("id, job_key, trigger_source, status, started_at, finished_at, error_count, errors")
    .is("project_id", null)
    .in("status", PROBLEM_RUNS)
    .gte("started_at", since)
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`job_runs: ${error.message}`);
  return (data || []).map((r) => ({
    id: r.id,
    jobKey: r.job_key,
    trigger: r.trigger_source,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    errorCount: r.error_count || 0,
    errors: Array.isArray(r.errors) ? r.errors.slice(0, 5) : [],
  }));
}
