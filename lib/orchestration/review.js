import { logActivity } from "@/lib/messaging/threads";
import { describeReason } from "./reasons";
import { recordOwnerType } from "./records";

// Review queue writes (server-only, admin client). raiseReview is an
// idempotent upsert keyed by (project, dedupe_key): a repeat failure bumps
// occurrences on the open item instead of adding one, and a resolved item that
// recurs is reopened. resolveRaised closes an open item when its cause clears
// (a retried run completed, a signal resolved). Actions on items live in
// review_actions.js; every write is audited by property.audit_row().

const nowIso = () => new Date().toISOString();

export function normalizeReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id || null,
    dedupeKey: row.dedupe_key,
    kind: row.kind,
    sourceType: row.source_type,
    sourceId: row.source_id || null,
    recordType: row.record_type || null,
    recordId: row.record_id || null,
    recordLabel: row.record_label || "",
    propertyId: row.property_id || null,
    title: row.title || "",
    reasonCode: row.reason_code,
    reasonText: row.reason_text || "",
    severity: row.severity,
    amountAtStake: row.amount_at_stake === null || row.amount_at_stake === undefined ? null : Number(row.amount_at_stake),
    status: row.status,
    assigneeId: row.assignee_id || null,
    assigneeRole: row.assignee_role || null,
    dueAt: row.due_at || null,
    snoozedUntil: row.snoozed_until || null,
    proposedAction: row.proposed_action || null,
    resolution: row.resolution || null,
    history: Array.isArray(row.history) ? row.history : [],
    occurrences: Number(row.occurrences) || 1,
    lastRaisedAt: row.last_raised_at,
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
    metadata: row.metadata || {},
  };
}

const byKey = (admin, projectId, dedupeKey) => {
  const q = admin.from("review_items").select("*").eq("dedupe_key", dedupeKey).is("deleted_at", null);
  return projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
};

// Append an entry to the record's activity timeline (best effort).
export async function logReviewActivity(admin, item, summary, actor = null) {
  const ownerType = recordOwnerType(item.recordType ?? item.record_type);
  const ownerId = item.recordId ?? item.record_id;
  if (!ownerType || !ownerId) return;
  await logActivity(admin, {
    projectId: item.projectId ?? item.project_id ?? null,
    ownerType,
    ownerId,
    verb: "review",
    summary,
    actorId: actor?.id || null,
    actorName: actor?.name || "Review queue",
    metadata: { reviewItemId: item.id },
  });
}

// Upsert one review item. `item` is camelCase; reasonText defaults to the
// catalogue sentence for reasonCode + context. Returns { item, created, reopened } or null.
export async function raiseReview(admin, item) {
  if (!admin || !item?.dedupeKey) return null;
  try {
    const projectId = item.projectId || null;
    const reason = describeReason(item.reasonCode || "unexpected_error", item.context || {});
    const at = nowIso();
    const fields = {
      kind: item.kind || "exception",
      source_type: item.sourceType || "automation_run",
      source_id: item.sourceId || null,
      record_type: item.recordType || null,
      record_id: item.recordId || null,
      record_label: item.recordLabel || null,
      property_id: item.propertyId || null,
      title: item.title || reason.title,
      reason_code: reason.code,
      reason_text: item.reasonText || reason.text,
      severity: item.severity || reason.severity || "soon",
      amount_at_stake: item.amountAtStake ?? null,
      due_at: item.dueAt || null,
      proposed_action: item.proposedAction ?? null,
      metadata: { ...(item.metadata || {}), ...(item.details ? { details: String(item.details).slice(0, 4000) } : {}) },
    };

    const { data: existing } = await byKey(admin, projectId, item.dedupeKey).maybeSingle();
    if (!existing) {
      const { data, error } = await admin
        .from("review_items")
        .insert({
          project_id: projectId,
          dedupe_key: item.dedupeKey,
          ...fields,
          assignee_id: item.assigneeId || null,
          assignee_role: item.assigneeRole || null,
          status: "open",
          history: [{ at, action: "raised", note: item.historyNote || fields.reason_text }],
          last_raised_at: at,
        })
        .select("*")
        .single();
      if (error) {
        // A concurrent raise won the insert; fall through to the update path.
        if (!/duplicate key/i.test(error.message)) throw new Error(error.message);
        return raiseReview(admin, item);
      }
      const created = normalizeReview(data);
      await logReviewActivity(admin, created, `Needs review: ${created.title}`);
      return { item: created, created: true, reopened: false };
    }

    const closed = existing.status === "resolved" || existing.status === "dismissed";
    const patch = {
      ...fields,
      occurrences: (Number(existing.occurrences) || 1) + 1,
      last_raised_at: at,
      ...(closed
        ? {
            status: "open",
            resolution: null,
            resolved_at: null,
            history: [...(existing.history || []), { at, action: "reopened", note: fields.reason_text }],
          }
        : {}),
    };
    const { data, error } = await admin.from("review_items").update(patch).eq("id", existing.id).select("*").single();
    if (error) throw new Error(error.message);
    return { item: normalizeReview(data), created: false, reopened: closed };
  } catch (e) {
    console.error("[review.raise]", e?.message || e);
    return null;
  }
}

// Close an item by id with a resolution entry (resolved | dismissed).
export async function closeReview(admin, row, { status = "resolved", action, note = "", actor = null, extra = {} } = {}) {
  const at = nowIso();
  const by = actor?.name || actor?.email || "Automation";
  const resolution = { action, note, by, byId: actor?.id || null, at, ...extra };
  const { data, error } = await admin
    .from("review_items")
    .update({
      status,
      resolution,
      resolved_at: at,
      snoozed_until: null,
      history: [...(row.history || []), { at, action, note, by }],
    })
    .eq("id", row.id)
    .in("status", ["open", "snoozed"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeReview(data);
}

// Resolve the open item for a dedupe key, if any (its cause cleared on its own).
export async function resolveRaised(admin, { projectId = null, dedupeKey, action = "cleared", note = "", actor = null }) {
  if (!admin || !dedupeKey) return null;
  try {
    const { data } = await byKey(admin, projectId, dedupeKey).in("status", ["open", "snoozed"]).maybeSingle();
    if (!data) return null;
    const closed = await closeReview(admin, data, { action, note, actor });
    if (closed) await logReviewActivity(admin, closed, `Review resolved: ${closed.title}${note ? ` — ${note}` : ""}`, actor);
    return closed;
  } catch (e) {
    console.error("[review.resolveRaised]", e?.message || e);
    return null;
  }
}
