// Accounting-export settings (key `accounting_export`) and the export history, pure.

export const SETTING_KEY = "accounting_export";

export const EXPORT_DEFAULTS = { profile: "ledger", format: "qbo_csv", accountMap: {}, classBy: "none", granularity: "entry", dateFormat: "", history: [] };

export const MAX_HISTORY = 50;

const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

// Stored value → a complete, safe config.
export function normalizeConfig(stored) {
  const s = stored && typeof stored === "object" ? stored : {};
  const map = s.accountMap && typeof s.accountMap === "object" && !Array.isArray(s.accountMap) ? s.accountMap : {};
  return {
    profile: pick(s.profile, ["ledger", "company"], EXPORT_DEFAULTS.profile),
    format: pick(s.format, ["qbo_csv", "xero_csv", "iif", "csv"], EXPORT_DEFAULTS.format),
    accountMap: Object.fromEntries(Object.entries(map).filter(([, v]) => String(v ?? "").trim())),
    classBy: pick(s.classBy, ["property", "none"], EXPORT_DEFAULTS.classBy),
    granularity: pick(s.granularity, ["entry", "day"], EXPORT_DEFAULTS.granularity),
    dateFormat: pick(s.dateFormat, ["mdy", "dmy", "ymd"], ""),
    history: Array.isArray(s.history) ? s.history.filter((h) => h && h.from && h.to) : [],
  };
}

// Earlier exports whose range intersects [from, to] (same set of books only).
export function overlappingExports(history, { from, to, profile } = {}) {
  if (!from || !to) return [];
  return (history || []).filter((h) => (!profile || !h.profile || h.profile === profile) && h.from <= to && h.to >= from);
}

// History with one more export recorded, newest first.
export const withHistory = (history, item) => [item, ...(history || [])].slice(0, MAX_HISTORY);
