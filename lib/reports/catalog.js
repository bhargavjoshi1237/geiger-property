import { NAV_TREE } from "@/lib/workspace/nav_tree";
import { FINANCIAL_REPORTS } from "./defs_financial";
import { OPERATIONS_REPORTS } from "./defs_operations";
import { formatIso, isoLocal, rangeLabel, resolveRange } from "./periods";
import { EMPTY_PORTFOLIO, hasPropertyFilter, isPortfolioScope, resolvePropertyScope, scopeLabel } from "./scope";

// The report catalog: every report definition, keyed for screens, saved
// schedules and the scheduled-reports job. A definition is
// { key, title (= sidebar title, if it has one), description, category, keywords, sources,
//   sourceParams?(filters, properties) → { [sourceKey]: params }, filters, views?,
//   compute(data, filters, ctx) → { stats, sections, empty?, subtitle?, periodLabel? } }.
// Every report opens from the Report Library; the original fifteen and Trust Reconciliation (INTL-05) also keep a sidebar entry (CORE-41).
// The property filter (filters.propertyId) is "all", a property id or "portfolio:<id>" (lib/reports/scope.js, CORE-43).

export const REPORTS = [...OPERATIONS_REPORTS, ...FINANCIAL_REPORTS];

export const getReport = (key) => REPORTS.find((r) => r.key === key) || null;

// The sources a report screen or scheduled run loads: the definition's, plus portfolios when it offers the property / portfolio filter.
export const reportSources = (def) => (hasPropertyFilter(def) ? [...new Set([...(def?.sources || []), "portfolios"])] : def?.sources || []);
export const reportByTitle = (title) => REPORTS.find((r) => r.title === title) || null;

export const LIBRARY_TITLE = "Report Library";

// The per-user settings key holding a member's favorite report keys (an array), read and written through lib/supabase/settings.js.
export const favoritesKey = (userId) => `report_favorites:${userId}`;

// Library sections, in display order; a definition's `category` is one of these.
export const REPORT_CATEGORIES = ["Financial", "Receivables", "Payables", "Owners & trust", "Banking", "Leasing & occupancy", "Maintenance", "Compliance", "Tax", "Custom"];

const NAV_TITLES = new Set(NAV_TREE.flatMap((item) => [item.title, ...(item.subItems || []).map((s) => s.title)]));

// The page whose view permission opens a report: its own sidebar entry, else the Report Library (library-only reports).
export const reportViewTitle = (def) => (def?.title && NAV_TITLES.has(def.title) ? def.title : LIBRARY_TITLE);

// Reports a viewer may open, given the rbac context's canView(title).
export const viewableReports = (canView, reports = REPORTS) => reports.filter((r) => canView(reportViewTitle(r)));

// Title, description, category and keyword search: every word of the query must match somewhere.
export function searchReports(reports, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return reports;
  return reports.filter((r) => {
    const text = [r.title, r.description, r.category, ...(r.keywords || [])].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

// Reports grouped by category in library order (uncategorized ones under Custom; empty groups dropped).
export const reportsByCategory = (reports) =>
  REPORT_CATEGORIES.map((category) => ({ category, reports: reports.filter((r) => (REPORT_CATEGORIES.includes(r.category) ? r.category : "Custom") === category) })).filter((g) => g.reports.length);

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

// Run a definition → { stats, sections, empty, subtitle, title, periodLabel }. A scoped report's subtitle names its property or portfolio;
// a portfolio without member properties is an empty report, never every property.
export function runReport(def, data, filters, today = new Date()) {
  const scoped = hasPropertyFilter(def);
  const noMembers = scoped && isPortfolioScope(filters.propertyId) && !resolvePropertyScope(filters, data?.properties).length;
  const result = noMembers ? { empty: EMPTY_PORTFOLIO } : def.compute(data, filters, { today: isoLocal(today) }) || {};
  const view = def.views?.find((v) => v.value === filters.view);
  return {
    stats: result.stats || [],
    sections: result.sections || [],
    empty: result.empty || null,
    title: view ? `${def.title} · ${view.label}` : def.title,
    subtitle: [result.subtitle, scoped ? scopeLabel(filters, data) : ""].filter(Boolean).join(" · "),
    periodLabel: result.periodLabel || (rangeFilterOf(def)?.mode === "asOf" ? `As of ${formatIso(filters.to)}` : rangeLabel(filters)),
  };
}
