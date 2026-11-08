// Shared lookups, formatters, date math and money math for the Reports area and
// the Overview dashboard. Plain data + pure functions (no JSX).
import { currency, formatDate, RENT_STATUS_MAP } from "@/components/internal/screens/accounting/shared";

export { currency, formatDate, RENT_STATUS_MAP };

// --- Formatters --------------------------------------------------------------

export const percent = (part, whole) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";

export const compactMoney = (n) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${v < 0 ? "-" : ""}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${v < 0 ? "-" : ""}$${(abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return currency(v);
};

// --- Status maps -------------------------------------------------------------

export const UNIT_STATUS_MAP = {
  Occupied: { label: "Occupied", variant: "success" },
  Vacant: { label: "Vacant", variant: "info" },
  Notice: { label: "Notice", variant: "warning" },
  "Make-ready": { label: "Make-ready", variant: "purple" },
  Down: { label: "Down", variant: "outline" },
  Draft: { label: "Draft", variant: "neutral" },
};

export const UNIT_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.keys(UNIT_STATUS_MAP).map((k) => ({ value: k, label: k })),
];

export const OCCUPIED_STATUSES = ["Occupied", "Notice"];
export const ACTIVE_LEASE_STATUSES = ["Active", "Expiring soon"];

// --- Dates -------------------------------------------------------------------

// Parse a date-ish value; bare "YYYY-MM-DD" is read as a local date (no UTC shift).
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

export const daysBetween = (a, b) =>
  Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

// Local YYYY-MM-DD (no UTC shift) — used for CSV cells.
export const isoDate = (d) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : "";

export const monthKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const monthLabel = (key, withYear = true) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    ...(withYear ? { year: "2-digit" } : {}),
  });
};

// Month keys ending at the current month (offset 0) — oldest first.
export function lastMonths(n, today = new Date()) {
  return Array.from({ length: n }, (_, i) => monthKey(addMonths(today, i - n + 1)));
}

// Month keys starting at the current month — soonest first.
export function nextMonths(n, today = new Date()) {
  return Array.from({ length: n }, (_, i) => monthKey(addMonths(today, i)));
}

export const inRange = (d, { start, end }) => Boolean(d) && d >= start && d < end;

export const PERIOD_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "ytd", label: "Year to date" },
  { value: "last_12", label: "Last 12 months" },
];

// [start, end) range for a PERIOD_OPTIONS value.
export function periodRange(value, today = new Date()) {
  const som = startOfMonth(today);
  switch (value) {
    case "last_month":
      return { start: addMonths(som, -1), end: som };
    case "ytd":
      return { start: new Date(today.getFullYear(), 0, 1), end: addMonths(som, 1) };
    case "last_12":
      return { start: addMonths(som, -11), end: addMonths(som, 1) };
    default:
      return { start: som, end: addMonths(som, 1) };
  }
}

export const monthRange = (key) => {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  return { start, end: addMonths(start, 1) };
};

export const sumBy = (rows, fn) => rows.reduce((s, r) => s + (Number(fn(r)) || 0), 0);

// --- Lookups -------------------------------------------------------------------

export const byId = (rows) => new Map((rows || []).map((r) => [r.id, r]));

export const norm = (s) => String(s || "").trim().toLowerCase();

// Resolve a row's property id: its own propertyId, else via its unit.
export const propertyIdOf = (row, unitsById) =>
  row?.propertyId || unitsById.get(row?.unitId)?.propertyId || null;

export const isVoid = (r) => norm(r?.status) === "void";

// Owner → linked properties with ownership %. Reads the Properties & Splits meta
// list (`splits` or `properties`); a missing % means 100.
export function ownerPropertiesOf(owner, properties) {
  const meta = owner?.metadata || {};
  const rows = [meta.splits, meta.properties, meta.propertySplits].find(
    (v) => Array.isArray(v) && v.length,
  );
  if (!rows) return [];
  const byName = new Map((properties || []).map((p) => [norm(p.name), p]));
  const ids = byId(properties);
  return rows
    .map((r) => {
      const name = r?.propertyName || r?.label || r?.name || "";
      const prop = ids.get(r?.propertyId) || byName.get(norm(name)) || null;
      const raw = [r?.percent, r?.pct, r?.ownership, r?.share, r?.value, r?.amount].find(
        (v) => v !== undefined && v !== "" && v !== null,
      );
      const pct = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : 100;
      return {
        key: r?.id || name,
        name: prop?.name || name || "Unnamed property",
        propertyId: prop?.id || r?.propertyId || null,
        pct: Math.min(pct, 100),
      };
    })
    .filter((r) => r.name);
}

// Open payable on a bill (amount − paid, never negative); 0 for Paid/Void/Draft.
export const billOpenAmount = (b) =>
  ["paid", "void", "draft"].includes(norm(b?.status))
    ? 0
    : Math.max(0, (Number(b?.amount) || 0) - (Number(b?.amountPaid) || 0));
