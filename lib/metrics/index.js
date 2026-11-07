import { money, money0 } from "@/lib/reports/format";
import { METRICS, getMetric, metricSources } from "./catalog";
import { resolveParams } from "./helpers";

// Metric API (pure, client + server). compute() returns the number; sourceRecords() the record
// links behind it ({ type, id, label, amount?, note? }, RECORD_LINKS types) so any figure drills down.

export { METRICS, getMetric, metricSources };
export { resolveParams };

// → { key, label, unit, value, display, count, breakdown? } (value null when there's nothing to measure).
export function computeMetric(key, src, params = {}, now = new Date()) {
  const m = getMetric(key);
  if (!m) return null;
  const p = resolveParams(params, now);
  const rows = m.rows(src || {}, p);
  const value = m.value(rows, src || {}, p);
  return {
    key,
    label: m.label,
    unit: m.unit,
    value,
    display: formatMetricValue(m.unit, value),
    count: rows.length,
    ...(m.breakdown ? { breakdown: m.breakdown(rows) } : {}),
  };
}

export function computeMetrics(keys, src, params = {}, now = new Date()) {
  return Object.fromEntries(keys.map((k) => [k, computeMetric(k, src, params, now)]));
}

export function sourceRecords(key, src, params = {}, now = new Date()) {
  const m = getMetric(key);
  if (!m) return [];
  const p = resolveParams(params, now);
  return m
    .rows(src || {}, p)
    .map((r) => m.record(r))
    .filter((r) => r?.id);
}

export function formatMetricValue(unit, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (unit) {
    case "money":
      return Math.abs(value) >= 100000 ? money0(value) : money(value);
    case "percent":
      return `${(value * 100).toFixed(Math.abs(value) < 0.1 && value !== 0 ? 1 : 0)}%`;
    case "days":
      return `${Number(value).toFixed(value % 1 ? 1 : 0)}d`;
    default:
      return Number(value).toLocaleString("en-US");
  }
}
