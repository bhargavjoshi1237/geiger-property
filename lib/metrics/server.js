import { loadServerSources } from "@/lib/reports/sources_server";
import { computeMetrics as computeFrom, metricSources, sourceRecords } from "./index";

// Server metrics (service-role admin client): load the sources the metrics need for one project
// and compute them. Used by the signals engine, the impact rollup and owner digests.
//   computeMetrics(admin, projectId, ["delinquent_balance", …], { now, params, cache, withRecords })
//   → { [key]: { key, label, unit, value, display, count, breakdown?, records? } }
export async function computeMetrics(admin, projectId, keys, { now = new Date(), params = {}, cache = new Map(), withRecords = false } = {}) {
  const src = await loadServerSources(admin, projectId, metricSources(keys), cache);
  const out = computeFrom(keys, src, params, now);
  if (withRecords) for (const k of keys) if (out[k]) out[k].records = sourceRecords(k, src, params, now);
  return out;
}
