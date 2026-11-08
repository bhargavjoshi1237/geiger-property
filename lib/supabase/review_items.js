"use client";

import { createClient } from "./client";
import { isSupabaseConfigured } from "@/supabase/components/property-client";
import { makeEntityData } from "./entity_factory";
import { scopeQuery } from "./scope";

// Data-access layer for the review queue (owns reads of `property.review_items`; writes go through
// POST /api/orchestration/review so retries, approvals and audit run server-side).

// The queue shows only the active project's items; project-less job failures are operator-only (PLAT-01b).
export const reviewScope = (q) => scopeQuery(q);

export const reviewItemsLayer = makeEntityData({
  table: "review_items",
  tag: "reviewItems",
  order: { col: "last_raised_at", ascending: false },
  scope: reviewScope,
  fields: [
    { key: "dedupeKey", col: "dedupe_key", type: "text" },
    { key: "kind", col: "kind", type: "text", default: "exception" },
    { key: "sourceType", col: "source_type", type: "text" },
    { key: "sourceId", col: "source_id", type: "uuid" },
    { key: "recordType", col: "record_type", type: "text" },
    { key: "recordId", col: "record_id", type: "uuid" },
    { key: "recordLabel", col: "record_label", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "title", col: "title", type: "text" },
    { key: "reasonCode", col: "reason_code", type: "text" },
    { key: "reasonText", col: "reason_text", type: "text" },
    { key: "severity", col: "severity", type: "text", default: "soon" },
    { key: "amountAtStake", col: "amount_at_stake", type: "number" },
    { key: "status", col: "status", type: "text", default: "open" },
    { key: "assigneeId", col: "assignee_id", type: "uuid" },
    { key: "assigneeRole", col: "assignee_role", type: "text" },
    { key: "dueAt", col: "due_at", type: "date" },
    { key: "snoozedUntil", col: "snoozed_until", type: "date" },
    { key: "proposedAction", col: "proposed_action", type: "text" },
    { key: "resolution", col: "resolution", type: "text" },
    { key: "history", col: "history", type: "text" },
    { key: "occurrences", col: "occurrences", type: "number" },
    { key: "lastRaisedAt", col: "last_raised_at", type: "date" },
    { key: "resolvedAt", col: "resolved_at", type: "date" },
  ],
});

export const listReviewItems = () => reviewItemsLayer.list();

// Open + snoozed items on one record (record editor banner).
export const listOpenReviewsForRecord = async (recordType, recordId) => {
  if (!recordType || !recordId) return [];
  const rows = (await reviewItemsLayer.list({ recordType, recordId })) || [];
  return rows.filter((r) => r.status === "open" || r.status === "snoozed");
};

// Count of open items in the active project (sidebar badge); null when unavailable.
export async function countOpenReviewItems() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { count, error } = await reviewScope(
      createClient().from("review_items").select("id", { count: "exact", head: true }).eq("status", "open").is("deleted_at", null),
    );
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}
