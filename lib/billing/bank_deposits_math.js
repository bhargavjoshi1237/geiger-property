import { round2 } from "./periods";

// Pure bank-deposit helpers (CORE-16): keys, labels, slip totals and the reconciliation grouping; safe in the browser.

export const bankDepositKey = (depositId) => `bankdep:${depositId}`;
export const DEPOSIT_SOURCES = ["manual", "stripe_payout", "lockbox"];
export const MAX_DEPOSIT_ITEMS = 500;
// Slip section for cash (currency and coin); every other paper method is listed as a check.
export const CASH_METHODS = ["Cash"];

const shortDate = (iso) => {
  const d = new Date(`${String(iso || "").slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

// "Slip 1042", else "Deposit · Nov 9, 2026".
export function depositLabel({ slipNumber, depositDate } = {}) {
  if (slipNumber) return `Slip ${slipNumber}`;
  return ["Deposit", shortDate(depositDate)].filter(Boolean).join(" · ");
}

// What a deposit slip totals: cash, checks (everything else), count and total.
export function slipTotals(items = []) {
  let cash = 0;
  let checks = 0;
  for (const i of items) {
    if (CASH_METHODS.includes(i.method)) cash += Number(i.amount) || 0;
    else checks += Number(i.amount) || 0;
  }
  return { cash: round2(cash), checks: round2(checks), count: items.length, total: round2(cash + checks) };
}

// A deposit can't be dated before a payment it holds → the problem in words, else "".
export function depositDateProblem(date, items = []) {
  if (!date) return "Pick the deposit date.";
  const latest = items.reduce((m, i) => (String(i.date || "") > m ? String(i.date) : m), "");
  return latest && date < latest ? `The deposit date is before a payment it holds (${shortDate(latest)}).` : "";
}

// Bank-statement rows for reconciliation: a deposit's lines on one side become one row (its total), everything else stays one row per line.
export function groupReconLines(lines = [], amountOf = (l) => (Number(l.debit) || 0) - (Number(l.credit) || 0)) {
  const rows = [];
  const byKey = new Map();
  for (const l of lines) {
    const side = (Number(l.debit) || 0) > 0 ? "dr" : "cr";
    const key = l.bankDepositId ? `dep:${l.bankDepositId}:${l.entryId}:${side}` : l.id;
    let row = byKey.get(key);
    if (!row) {
      row = { id: key, bankDepositId: l.bankDepositId || "", entryId: l.entryId, date: l.date, entry: l.entry || null, memo: l.entry?.memo || l.memo || "", lineIds: [], lines: [], amount: 0 };
      byKey.set(key, row);
      rows.push(row);
    }
    row.lineIds.push(l.id);
    row.lines.push(l);
    row.amount = round2(row.amount + amountOf(l));
  }
  for (const r of rows) r.items = r.bankDepositId ? Number(r.entry?.metadata?.itemCount) || 0 : 0;
  return rows;
}
