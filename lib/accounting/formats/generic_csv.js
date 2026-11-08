import { amount, csvFile, fmtDate, num } from "./util";

// Plain journal CSV for any other tool or spreadsheet: one row per line.
export const GENERIC_HEADER = ["Date", "Reference", "Memo", "Account Number", "Account Name", "Mapped Account", "Debit", "Credit", "Class"];

export function buildGenericCsv(journals, { dateFormat = "ymd" } = {}) {
  const rows = [];
  for (const j of journals) {
    for (const l of j.lines) {
      rows.push([fmtDate(j.date, dateFormat), j.ref, l.memo || j.memo, l.number, l.name, l.account, num(amount(l.debit, true)), num(amount(l.credit, true)), l.className || ""]);
    }
  }
  return csvFile(GENERIC_HEADER, rows);
}
