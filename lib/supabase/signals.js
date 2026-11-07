"use client";

import { makeEntityData } from "./entity_factory";
import { getUser } from "./user";

// Data-access layer for signals (owns `property.signals`; rows are written by the signals job,
// lib/signals/engine.js). The browser only reads them and acknowledges / marks them actioned.
export const signalsLayer = makeEntityData({
  table: "signals",
  tag: "signals",
  order: { col: "score", ascending: false },
  fields: [
    { key: "detectorKey", col: "detector_key", type: "text" },
    { key: "dedupeKey", col: "dedupe_key", type: "text" },
    { key: "category", col: "category", type: "text", default: "risk" },
    { key: "area", col: "area", type: "text", default: "collections" },
    { key: "audienceRoles", col: "audience_roles", type: "text" },
    { key: "urgency", col: "urgency", type: "text", default: "soon" },
    { key: "title", col: "title", type: "text" },
    { key: "why", col: "why", type: "text" },
    { key: "propertyId", col: "property_id", type: "uuid" },
    { key: "recordRefs", col: "record_refs", type: "text" },
    { key: "suggestedActions", col: "suggested_actions", type: "text" },
    { key: "impactAmount", col: "impact_amount", type: "text" },
    { key: "impactUnits", col: "impact_units", type: "text" },
    { key: "previousImpactAmount", col: "previous_impact_amount", type: "text" },
    { key: "score", col: "score", type: "number" },
    { key: "confidence", col: "confidence", type: "text", default: "certain" },
    { key: "completeness", col: "completeness", type: "number", default: 1 },
    { key: "completenessNote", col: "completeness_note", type: "text" },
    { key: "status", col: "status", type: "text", default: "open" },
    { key: "firstSeenAt", col: "first_seen_at", type: "date" },
    { key: "lastSeenAt", col: "last_seen_at", type: "date" },
    { key: "worsenedAt", col: "worsened_at", type: "date" },
    { key: "resolvedAt", col: "resolved_at", type: "date" },
    { key: "acknowledgedAt", col: "acknowledged_at", type: "date" },
    { key: "acknowledgedBy", col: "acknowledged_by", type: "uuid" },
    { key: "actionedAt", col: "actioned_at", type: "date" },
  ],
});

const list = (v) => (Array.isArray(v) ? v : []);
const amount = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

// View model: arrays and money as their real types.
export const normalizeSignal = (s) =>
  s
    ? {
        ...s,
        recordRefs: list(s.recordRefs),
        suggestedActions: list(s.suggestedActions),
        audienceRoles: list(s.audienceRoles),
        impactAmount: amount(s.impactAmount),
        previousImpactAmount: amount(s.previousImpactAmount),
        grain: s.metadata?.grain || "record",
      }
    : null;

export async function listSignals() {
  const rows = await signalsLayer.list();
  return rows ? rows.map(normalizeSignal) : null;
}

export async function acknowledgeSignal(id) {
  const user = await getUser();
  const row = await signalsLayer.update(id, { status: "acknowledged", acknowledgedAt: new Date().toISOString(), acknowledgedBy: user?.id || "" });
  return normalizeSignal(row);
}

export async function reopenSignal(id) {
  return normalizeSignal(await signalsLayer.update(id, { status: "open", acknowledgedAt: "", acknowledgedBy: "" }));
}
