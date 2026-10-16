import { FINANCIAL_REPORTS } from "./defs_financial";
import { OPERATIONS_REPORTS } from "./defs_operations";
import { formatIso, isoLocal, rangeLabel, resolveRange } from "./periods";

// The report catalog: every report definition, keyed for screens, saved
// schedules and the scheduled-reports job. A definition is
// { key, title (= sidebar title), description, sources, filters, views?,
//   compute(data, filters, ctx) → { stats, sections, empty?, subtitle? } }.

export const REPORTS = [...OPERATIONS_REPORTS, ...FINANCIAL_REPORTS];

export const getReport = (key) => REPORTS.find((r) => r.key === key) || null;
export const reportByTitle = (title) => REPORTS.find((r) => r.title === title) || null;

export const rangeFilterOf = (def) => def?.filters?.find((x) => x.type === "range") || null;

// Default filter values for a report (select filters start at "all" / first option).
export function defaultFilters(def, data = {}, today = new Date()) {
  const out = { ...resolveRange({ preset: rangeFilterOf(def)?.defaultPreset || "this_month" }, today), propertyId: "all" };
  if (def?.views?.length) out.view = def.views[0].value;
  for (const flt of def?.filters || []) {
    if (!flt.key) continue;
    const opts = flt.options?.(data) || [];
    out[flt.key] = flt.default === "first" ? opts[0]?.value || "" : flt.default || opts[0]?.value || "all";
  }
  return out;
}

// Stored filters (from a schedule) → full filters with the range re-resolved.
export function resolveFilters(def, stored = {}, data = {}, today = new Date()) {
  const base = defaultFilters(def, data, today);
  const merged = { ...base, ...stored };
  return { ...merged, ...resolveRange(stored.preset ? stored : { preset: base.preset }, today) };
}

// Run a definition → { stats, sections, empty, subtitle, title, periodLabel }.
export function runReport(def, data, filters, today = new Date()) {
  const result = def.compute(data, filters, { today: isoLocal(today) }) || {};
  const view = def.views?.find((v) => v.value === filters.view);
  return {
    stats: result.stats || [],
    sections: result.sections || [],
    empty: result.empty || null,
    title: view ? `${def.title} · ${view.label}` : def.title,
    subtitle: result.subtitle || "",
    periodLabel: rangeFilterOf(def)?.mode === "asOf" ? `As of ${formatIso(filters.to)}` : rangeLabel(filters),
  };
}
