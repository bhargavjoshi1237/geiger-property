// Report date ranges (pure, client + server). A range is { preset, from, to }
// with inclusive local "YYYY-MM-DD" bounds; snapshot reports read `to` as "as of".

const pad = (n) => String(n).padStart(2, "0");

// Local YYYY-MM-DD (no UTC shift).
export const isoLocal = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "");

// "YYYY-MM-DD" (or ISO timestamp) → local Date; null when unset/invalid.
export function parseIso(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Date-only part of a date/timestamp value ("" when unset).
export const dayOf = (v) => {
  if (!v) return "";
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : isoLocal(parseIso(s));
};

export const daysBetweenIso = (a, b) => {
  const x = parseIso(a);
  const y = parseIso(b);
  return x && y ? Math.round((y - x) / 86400000) : null;
};

export const RANGE_PRESETS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "last_year", label: "Last year" },
  { value: "last_12", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

// Point-in-time presets for "as of" reports (from = to = the day).
export const AS_OF_PRESETS = [
  { value: "today", label: "Today" },
  { value: "end_last_month", label: "End of last month" },
  { value: "end_last_quarter", label: "End of last quarter" },
  { value: "end_last_year", label: "End of last year" },
  { value: "custom", label: "Custom date" },
];

const ymd = (y, m, d) => isoLocal(new Date(y, m, d));

// Inclusive { from, to } for a preset relative to `today`.
export function presetRange(preset, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const q = Math.floor(m / 3) * 3;
  const day = (iso) => ({ from: iso, to: iso });
  switch (preset) {
    case "today":
      return day(isoLocal(today));
    case "end_last_month":
      return day(ymd(y, m, 0));
    case "end_last_quarter":
      return day(ymd(y, q, 0));
    case "end_last_year":
      return day(ymd(y - 1, 11, 31));
    case "last_month":
      return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) };
    case "this_quarter":
      return { from: ymd(y, q, 1), to: ymd(y, q + 3, 0) };
    case "last_quarter":
      return { from: ymd(y, q - 3, 1), to: ymd(y, q, 0) };
    case "ytd":
      return { from: ymd(y, 0, 1), to: isoLocal(today) };
    case "last_year":
      return { from: ymd(y - 1, 0, 1), to: ymd(y - 1, 11, 31) };
    case "last_12":
      return { from: ymd(y, m - 11, 1), to: ymd(y, m + 1, 0) };
    default:
      return { from: ymd(y, m, 1), to: ymd(y, m + 1, 0) };
  }
}

// A full range from a stored { preset, from, to } (presets are re-evaluated so a
// saved "Last month" schedule always means the month before the run).
export function resolveRange(range, today = new Date()) {
  const preset = range?.preset || "this_month";
  if (preset === "custom" && range?.from && range?.to) {
    const [from, to] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
    return { preset, from, to };
  }
  return { preset: preset === "custom" ? "this_month" : preset, ...presetRange(preset, today) };
}

export const makeRange = (preset = "this_month", today = new Date()) => ({ preset, ...presetRange(preset, today) });

export const inIsoRange = (iso, { from, to } = {}) => {
  const d = dayOf(iso);
  return Boolean(d) && (!from || d >= from) && (!to || d <= to);
};

export function formatIso(iso, opts = { month: "short", day: "numeric", year: "numeric" }) {
  const d = parseIso(iso);
  return d ? d.toLocaleDateString("en-US", opts) : "—";
}

export function rangeLabel(range) {
  if (!range?.from || !range?.to) return "";
  const preset = RANGE_PRESETS.find((p) => p.value === range.preset && p.value !== "custom");
  const span = `${formatIso(range.from)} – ${formatIso(range.to)}`;
  return preset ? `${preset.label} · ${span}` : span;
}

// Month keys ("YYYY-MM") covering a range, oldest first (capped at 36).
export function monthsIn({ from, to }) {
  const a = parseIso(from);
  const b = parseIso(to);
  if (!a || !b) return [];
  const out = [];
  const d = new Date(a.getFullYear(), a.getMonth(), 1);
  while (d <= b && out.length < 36) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export const monthKeyOf = (iso) => dayOf(iso).slice(0, 7);

export function monthName(key, withYear = true) {
  const [y, m] = String(key).split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", withYear ? { month: "short", year: "numeric" } : { month: "short" });
}

// Day before an ISO date (for opening balances).
export function dayBefore(iso) {
  const d = parseIso(iso);
  if (!d) return "";
  d.setDate(d.getDate() - 1);
  return isoLocal(d);
}
