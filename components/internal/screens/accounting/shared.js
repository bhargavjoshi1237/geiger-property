// Shared lookups, formatters, and status maps for the Accounting area. Plain
// data (no JSX) so every accounting screen imports the same config.

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

export const formatDate = (v) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

// Build FilterDropdown options ([{ all }, …statuses]) from a status map.
export const filterOptions = (map, allLabel = "All statuses") => [
  { value: "all", label: allLabel },
  ...Object.keys(map).map((k) => ({ value: k, label: map[k].label || k })),
];

export const RENT_STATUS_MAP = {
  Current: { label: "Current", variant: "success", dotClass: "bg-emerald-400" },
  Due: { label: "Due", variant: "info", dotClass: "bg-sky-400" },
  Partial: { label: "Partial", variant: "warning", dotClass: "bg-amber-400" },
  Overdue: { label: "Overdue", variant: "danger", dotClass: "bg-red-400" },
  "In collections": { label: "In collections", variant: "danger", dotClass: "bg-red-500" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

// Ordinal suffix for a day-of-month (1st, 2nd, 3rd…). "—" when unset.
export const ordinalDay = (d) => {
  const n = Number(d);
  if (!n) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// Live-derived money for a rent account. Charges and payments are metadata
// lists of { amount } rows; billed − collected = the outstanding balance.
const sumAmounts = (list) =>
  Array.isArray(list)
    ? list.reduce((s, r) => s + (Number(r?.amount) || 0), 0)
    : 0;

export const billedOf = (row) => {
  const charged = sumAmounts(row?.metadata?.charges);
  // Fall back to the recurring rent when no charges have been itemized yet.
  return charged || Number(row?.rent) || 0;
};

export const collectedOf = (row) => sumAmounts(row?.metadata?.payments);

export const balanceOf = (row) => billedOf(row) - collectedOf(row);
