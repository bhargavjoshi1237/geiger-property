// Shared lookups, formatters, and status maps for the Accounting area. Plain
// data (no JSX) so every accounting screen imports the same config.

export const currency = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Ledger-precision money (cents) for individual entries.
export const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

// Date-only ISO strings parse as local dates (not UTC midnight) so they don't shift a day.
export const formatDate = (v) =>
  v
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00` : v).toLocaleDateString("en-US", {
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
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-neutral-500" },
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
  const charges = Array.isArray(row?.metadata?.charges) ? row.metadata.charges : [];
  // Charges posted by Recurring Charges sit on top of rent, never replace it.
  const extras = sumAmounts(charges.filter((c) => c?.source === "recurring"));
  const rentCharged = sumAmounts(charges.filter((c) => c?.source !== "recurring"));
  // Fall back to the recurring rent when no rent charges have been itemized yet.
  return (rentCharged || Number(row?.rent) || 0) + extras;
};

export const collectedOf = (row) => sumAmounts(row?.metadata?.payments);

// Ledger receivable wins when the row was joined with one (Rent Collection rowsLoader).
export const balanceOf = (row) =>
  typeof row?.ledgerBalance === "number" ? row.ledgerBalance : billedOf(row) - collectedOf(row);

// --- Shared helpers for the ledger screens -----------------------------------

// Plain [{ value, label }] select options from a list of labels.
export const optionsOf = (labels) => labels.map((v) => ({ value: v, label: v }));

// Local YYYY-MM-DD for today (date columns compare as ISO strings).
export const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Same calendar month as today (ISO date string in).
export const isThisMonth = (v) => Boolean(v) && String(v).slice(0, 7) === todayISO().slice(0, 7);

// Add whole months to an ISO date, clamping to the month's last day.
export const addMonthsISO = (v, months) => {
  if (!v) return "";
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, last));
  const p = (n) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}`;
};

// --- Transactions -------------------------------------------------------------

export const TXN_TYPES = ["Income", "Expense", "Transfer"];

export const TXN_STATUS_MAP = {
  Pending: { label: "Pending", variant: "warning", dotClass: "bg-amber-400" },
  Cleared: { label: "Cleared", variant: "success", dotClass: "bg-emerald-400" },
  Reconciled: { label: "Reconciled", variant: "info", dotClass: "bg-sky-400" },
  Void: { label: "Void", variant: "neutral", dotClass: "bg-text-tertiary" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
};

// Signed ledger amount: income +, expense −, transfers neutral (0 to net).
export const signedAmount = (t) => {
  const n = Number(t?.amount) || 0;
  if (t?.txnType === "Income") return n;
  if (t?.txnType === "Expense") return -n;
  return 0;
};

// --- Recurring charges --------------------------------------------------------

export const CHARGE_FREQUENCIES = ["Monthly", "Quarterly", "Annually", "One-time"];

export const RECURRING_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
  Ended: { label: "Ended", variant: "neutral", dotClass: "bg-text-tertiary" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
};

// Normalise a charge to its monthly equivalent (one-time charges don't recur).
export const monthlyEquivalent = (amount, frequency) => {
  const n = Number(amount) || 0;
  if (frequency === "Quarterly") return n / 3;
  if (frequency === "Annually") return n / 12;
  if (frequency === "One-time") return 0;
  return n;
};

// Months to advance a charge's next date by (0 = one-time, no next date).
export const FREQUENCY_MONTHS = { Monthly: 1, Quarterly: 3, Annually: 12, "One-time": 0 };

// --- Bills & payables ---------------------------------------------------------

export const BILL_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
  Open: { label: "Open", variant: "info", dotClass: "bg-sky-400" },
  "Partially paid": { label: "Partially paid", variant: "warning", dotClass: "bg-amber-400" },
  Paid: { label: "Paid", variant: "success", dotClass: "bg-emerald-400" },
  Void: { label: "Void", variant: "outline", dotClass: "bg-text-tertiary" },
};

// Approval workflow for bills above the approval limit.
export const APPROVAL_STATUS_MAP = {
  "Not required": { label: "Not required", variant: "neutral", dotClass: "bg-text-tertiary" },
  Pending: { label: "Pending approval", variant: "warning", dotClass: "bg-amber-400" },
  Approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  Rejected: { label: "Rejected", variant: "danger", dotClass: "bg-red-400" },
};

// Payable once approved (or when approval isn't required).
export const isBillApproved = (b) => !b?.approvalStatus || b.approvalStatus === "Not required" || b.approvalStatus === "Approved";

// AP aging bucket by days past due.
export const AGING_BUCKETS = ["Current", "1–30", "31–60", "61–90", "90+"];

export function agingBucket(b) {
  if (!b?.dueDate) return "Current";
  const days = Math.floor((new Date(`${todayISO()}T00:00:00`) - new Date(`${b.dueDate}T00:00:00`)) / 86400000);
  if (days <= 0) return "Current";
  if (days <= 30) return "1–30";
  if (days <= 60) return "31–60";
  if (days <= 90) return "61–90";
  return "90+";
}

export const billBalance = (b) => Math.max(0, (Number(b?.amount) || 0) - (Number(b?.amountPaid) || 0));

export const isBillOverdue = (b) =>
  Boolean(b?.dueDate) && b.dueDate < todayISO() && !["Paid", "Void", "Draft"].includes(b.status);

// --- Chart of accounts --------------------------------------------------------

export const GL_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"];

export const GL_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Inactive: { label: "Inactive", variant: "neutral", dotClass: "bg-text-tertiary" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
};

export const GL_TYPE_MAP = {
  Asset: { label: "Asset", variant: "info" },
  Liability: { label: "Liability", variant: "warning" },
  Equity: { label: "Equity", variant: "purple" },
  Income: { label: "Income", variant: "success" },
  Expense: { label: "Expense", variant: "danger" },
};

// Sub-ledger role of an account; drives balances (AR, AP, trust cash, deposits…).
export const GL_SUBTYPES = [
  { value: "cash", label: "Cash / bank" },
  { value: "receivable", label: "Accounts receivable" },
  { value: "fixed_asset", label: "Fixed asset" },
  { value: "other_asset", label: "Other asset" },
  { value: "payable", label: "Accounts payable" },
  { value: "deposits", label: "Deposits held" },
  { value: "prepaid", label: "Prepaid / credits" },
  { value: "other_liability", label: "Other liability" },
  { value: "equity", label: "Equity" },
  { value: "contribution", label: "Owner contributions" },
  { value: "distribution", label: "Owner distributions" },
  { value: "income", label: "Income" },
  { value: "contra_income", label: "Contra income" },
  { value: "expense", label: "Expense" },
];

export const GL_SUBTYPE_LABEL = Object.fromEntries(GL_SUBTYPES.map((s) => [s.value, s.label]));

// --- Budgets ------------------------------------------------------------------

export const BUDGET_STATUS_MAP = {
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
  Approved: { label: "Approved", variant: "success", dotClass: "bg-emerald-400" },
  Archived: { label: "Archived", variant: "outline", dotClass: "bg-text-tertiary" },
};

// --- Bank accounts ------------------------------------------------------------

export const BANK_TYPES = ["Operating", "Trust", "Security deposit", "Reserve"];

export const BANK_STATUS_MAP = {
  Active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  Closed: { label: "Closed", variant: "neutral", dotClass: "bg-text-tertiary" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-tertiary" },
};

// "•••• 1234" mask for an account's last four digits.
export const maskLast4 = (v) => (v ? `•••• ${String(v).slice(-4)}` : "—");
