import { indexAccounts } from "@/lib/ledger/postings";
import { emptyColumns, emptyTotals } from "./aggregates";

// Report source parameters (CORE-41, pure): a definition's sourceParams(filters, properties) → { [sourceKey]: params }, and the stable key the
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

// A definition's per-source params for these filters ({} when it takes none). `properties` resolves a portfolio scope to its current
// members (CORE-43, resolvePropertyScope in ./scope); a single property or "all" needs none.
export function sourceParamsOf(def, filters = {}, properties = null) {
  const out = def?.sourceParams?.(filters, properties) || {};
  return out && typeof out === "object" ? out : {};
}

// A source a definition doesn't need for these filters (CORE-44): its params are SKIP and the loaders return its empty shape unfetched.
export const SKIP = Object.freeze({ skip: true });
export const isSkipped = (params) => Boolean(params && params.skip === true);

// What a source resolves to when skipped or when it can't load ({ error } on the ledger shapes so a report can say so).
export function emptySource(key, params, error) {
  const message = error ? error.message || String(error) : "";
  const err = message ? { error: message } : {};
  const skipped = isSkipped(params);
  if (key === "ledgerTotals") return { ...emptyTotals(skipped ? {} : params), ...err };
  if (key === "ledgerColumns") return { ...emptyColumns(skipped ? {} : params), ...err };
  if (key === "ledger") return { lines: [], accounts: indexAccounts([]), ...(params && !skipped ? { any: false, ...err } : {}) };
  if (key === "budgets" && params && !skipped) return { params: {}, budgets: [], lines: [], ...err };
  return [];
}
