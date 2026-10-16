// Shared lookups, formatters, date math and money math for the Reports area and
// the Overview dashboard. Plain data + pure functions (no JSX).
import {
  currency,
  formatDate,
  billedOf,
  collectedOf,
  balanceOf,
  RENT_STATUS_MAP,
} from "@/components/internal/screens/accounting/shared";

export { currency, formatDate, billedOf, collectedOf, balanceOf, RENT_STATUS_MAP };

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
  Occupied: { label: "Occupied", variant: "success", dotClass: "bg-emerald-400" },
  Vacant: { label: "Vacant", variant: "info", dotClass: "bg-sky-400" },
  Notice: { label: "Notice", variant: "warning", dotClass: "bg-amber-400" },
  "Make-ready": { label: "Make-ready", variant: "purple", dotClass: "bg-violet-300" },
  Down: { label: "Down", variant: "outline", dotClass: "bg-red-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
};

export const UNIT_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...Object.keys(UNIT_STATUS_MAP).map((k) => ({ value: k, label: k })),
];

export const OCCUPIED_STATUSES = ["Occupied", "Notice"];
export const ACTIVE_LEASE_STATUSES = ["Active", "Expiring soon"];

// --- Dates -------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

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

// Best-effort date from a free-text label ("July 2026 rent", "Payment · Jul 3").
function dateFromLabel(label, today) {
  const m = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s*(?:(\d{1,2})(?!\d)(?:st|nd|rd|th)?)?,?\s*(\d{4})?/i.exec(
    String(label || ""),
  );
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  const day = m[2] ? Number(m[2]) : 1;
  const year = m[3] ? Number(m[3]) : today.getFullYear();
  let d = new Date(year, month, day);
  // No year given and that lands in the future → it was last year.
  if (!m[3] && d > today) d = new Date(year - 1, month, day);
  return d;
}

// Date of a charge/payment row: explicit date keys, then its label, then a fallback.
export function itemDate(item, fallback, today = new Date()) {
  const explicit =
    toDate(item?.date) ||
    toDate(item?.period) ||
    toDate(item?.dueDate) ||
    toDate(item?.paidDate) ||
    toDate(item?.createdAt);
  return explicit || dateFromLabel(item?.label, today) || toDate(fallback) || null;
}

// --- Rent-account money math ---------------------------------------------------

const list = (v) => (Array.isArray(v) ? v : []);

// Dated charges/payments for an account. With no itemized charges the recurring
// rent is billed once on this month's due day (mirrors billedOf's fallback).
export function ledgerOf(account, today = new Date()) {
  const fallback = account?.createdAt;
  const charges = list(account?.metadata?.charges).map((c) => ({
    date: itemDate(c, fallback, today),
    amount: Number(c?.amount) || 0,
  }));
  if (!charges.length && Number(account?.rent) > 0) {
    const day = Math.min(Math.max(Number(account.dueDay) || 1, 1), 28);
    charges.push({
      date: new Date(today.getFullYear(), today.getMonth(), day),
      amount: Number(account.rent),
    });
  }
  const payments = list(account?.metadata?.payments).map((p) => ({
    date: itemDate(p, fallback, today),
    amount: Number(p?.amount) || 0,
  }));
  return { charges, payments };
}

export const AGING_BUCKETS = [
  { key: "b0", label: "0–30 days" },
  { key: "b31", label: "31–60 days" },
  { key: "b61", label: "61–90 days" },
  { key: "b91", label: "90+ days" },
];

// Aging for one account: payments retire the oldest charges first; what's left
// is bucketed by days since each charge.
export function agingOf(account, today = new Date()) {
  const { charges, payments } = ledgerOf(account, today);
  let credit = payments.reduce((s, p) => s + p.amount, 0);
  const out = { b0: 0, b31: 0, b61: 0, b91: 0, total: 0, oldestDays: 0 };
  const sorted = [...charges].sort(
    (a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0),
  );
  for (const c of sorted) {
    const applied = Math.min(credit, c.amount);
    credit -= applied;
    const open = c.amount - applied;
    if (open <= 0) continue;
    const days = c.date ? Math.max(0, daysBetween(c.date, today)) : 0;
    const key = days > 90 ? "b91" : days > 60 ? "b61" : days > 30 ? "b31" : "b0";
    out[key] += open;
    out.total += open;
    out.oldestDays = Math.max(out.oldestDays, days);
  }
  return out;
}

// Payments (or charges) on an account that fall inside a [start, end) range.
export const paymentsIn = (account, range, today = new Date()) =>
  ledgerOf(account, today).payments.filter((p) => inRange(p.date, range));

export const chargesIn = (account, range, today = new Date()) =>
  ledgerOf(account, today).charges.filter((c) => inRange(c.date, range));

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

// --- Ledger entries (income / expense) -------------------------------------------

// Income: rent payments on every account plus Income transactions (Void excluded).
export function incomeEntries({ accounts = [], transactions = [], unitsById = new Map() }, today = new Date()) {
  const rent = accounts.flatMap((a) =>
    ledgerOf(a, today).payments.map((p) => ({
      date: p.date,
      amount: p.amount,
      account: "Rent",
      source: "Rent payment",
      description: [a.tenantName, a.unit].filter(Boolean).join(" · ") || a.name || "Rent payment",
      propertyId: propertyIdOf(a, unitsById),
      propertyName: a.propertyName || "",
    })),
  );
  const other = transactions
    .filter((t) => t.txnType === "Income" && !isVoid(t))
    .map((t) => ({
      date: toDate(t.txnDate) || toDate(t.createdAt),
      amount: Number(t.amount) || 0,
      account: t.account || "Other income",
      source: "Transaction",
      description: t.name || t.payee || "Income",
      propertyId: t.propertyId || null,
      propertyName: t.propertyName || "",
    }));
  return [...rent, ...other];
}

// Expenses: Expense transactions plus bill payments not already posted as one.
export function expenseEntries({ transactions = [], bills = [] }) {
  const txns = transactions.filter((t) => t.txnType === "Expense" && !isVoid(t));
  const posted = new Set(txns.map((t) => t.id));
  const fromTxns = txns.map((t) => ({
    date: toDate(t.txnDate) || toDate(t.createdAt),
    amount: Number(t.amount) || 0,
    account: t.account || "Uncategorized expense",
    source: "Transaction",
    description: t.name || t.payee || "Expense",
    propertyId: t.propertyId || null,
    propertyName: t.propertyName || "",
  }));
  const fromBills = bills
    .filter((b) => !isVoid(b))
    .flatMap((b) =>
      list(b.metadata?.payments)
        .filter((p) => !(p.transactionId && posted.has(p.transactionId)))
        .map((p) => ({
          date: itemDate(p, b.billDate || b.createdAt),
          amount: Number(p.amount) || 0,
          account: b.account || "Uncategorized expense",
          source: "Bill payment",
          description: `Bill: ${b.name || b.vendorName || "Vendor bill"}`,
          propertyId: b.propertyId || null,
          propertyName: b.propertyName || "",
        })),
    );
  return [...fromTxns, ...fromBills];
}

// Open payable on a bill (amount − paid, never negative); 0 for Paid/Void/Draft.
export const billOpenAmount = (b) =>
  ["paid", "void", "draft"].includes(norm(b?.status))
    ? 0
    : Math.max(0, (Number(b?.amount) || 0) - (Number(b?.amountPaid) || 0));
