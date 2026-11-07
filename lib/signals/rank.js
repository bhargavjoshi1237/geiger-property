import { LIVE_SIGNAL_STATUSES } from "./constants";

// Ranking and change sets shared by the Today panel, the Briefing screen and the briefing job
// (isomorphic). Signals are camelCase view models or raw rows; both shapes are read.

const f = (s, camel, snake) => s?.[camel] ?? s?.[snake];
const grainOf = (s) => s?.metadata?.grain || s?.grain || "record";
const at = (v) => (v ? new Date(v).getTime() : 0);

// Top signals: live, in the viewer's areas, highest score first (oldest first on ties). With collapse,
// a detector that published a summary shows only the summary, not each record behind it.
export function rankSignals(signals, { areas = null, collapse = true, statuses = ["open", "acknowledged"], limit } = {}) {
  let rows = (signals || []).filter((s) => statuses.includes(s.status) && (!areas || areas.includes(s.area)));
  if (collapse) {
    const summarized = new Set(rows.filter((s) => grainOf(s) === "summary").map((s) => f(s, "detectorKey", "detector_key")));
    rows = rows.filter((s) => grainOf(s) === "summary" || !summarized.has(f(s, "detectorKey", "detector_key")));
  }
  rows.sort((a, b) => Number(b.score) - Number(a.score) || at(f(a, "firstSeenAt", "first_seen_at")) - at(f(b, "firstSeenAt", "first_seen_at")));
  return limit ? rows.slice(0, limit) : rows;
}

// What changed since a moment: new (first seen), worse (impact or urgency grew) and resolved.
export function changesSince(signals, since, { areas = null } = {}) {
  const t = at(since);
  const mine = (signals || []).filter((s) => !areas || areas.includes(s.area));
  const live = mine.filter((s) => LIVE_SIGNAL_STATUSES.includes(s.status));
  return {
    new: live.filter((s) => at(f(s, "firstSeenAt", "first_seen_at")) > t),
    worse: live.filter((s) => at(f(s, "worsenedAt", "worsened_at")) > t && at(f(s, "firstSeenAt", "first_seen_at")) <= t),
    resolved: mine.filter((s) => s.status === "resolved" && at(f(s, "resolvedAt", "resolved_at")) > t),
  };
}

// Dollars at stake across the collapsed top list (summaries stand in for their records, so nothing counts twice).
export const moneyAtStake = (signals, { areas = null } = {}) =>
  Math.round(rankSignals(signals, { areas }).reduce((sum, s) => sum + (Number(f(s, "impactAmount", "impact_amount")) || 0), 0) * 100) / 100;
