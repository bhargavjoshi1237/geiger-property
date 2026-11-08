// Report source parameters (CORE-41, pure): a definition's sourceParams(filters) → { [sourceKey]: params }, and the stable key the
// browser and the scheduled job use to decide whether a loaded source can be reused.

// Stable JSON for a params object (sorted keys; undefined dropped) — "" when there are none.
export function paramsKey(params) {
  if (params === undefined || params === null) return "";
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v)
          .filter((k) => v[k] !== undefined)
          .sort()
          .map((k) => [k, norm(v[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(params));
}

// The property scope of report filters → property ids, or null for every property (CORE-43 adds portfolios here).
export const propertyScope = (filters = {}) => (filters.propertyId && filters.propertyId !== "all" ? [filters.propertyId] : null);

// A definition's per-source params for these filters ({} when it takes none).
export function sourceParamsOf(def, filters = {}) {
  const out = def?.sourceParams?.(filters) || {};
  return out && typeof out === "object" ? out : {};
}
