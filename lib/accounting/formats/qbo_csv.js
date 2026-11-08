import { amount, csvFile, fmtDate, num } from "./util";

// QuickBooks Online "Import journal entries" CSV: one row per line, rows sharing a JournalNo form one entry.
export const QBO_HEADER = ["*JournalNo", "*JournalDate", "*AccountName", "Debits", "Credits", "Description", "Name", "Currency", "Location", "Class"];

export function buildQboCsv(journals, { dateFormat = "mdy" } = {}) {
  const rows = [];
  for (const j of journals) {
    for (const l of j.lines) {
      rows.push([j.ref, fmtDate(j.date, dateFormat), l.account, num(amount(l.debit, true)), num(amount(l.credit, true)), l.memo || j.memo, "", "", "", l.className || ""]);
    }
  }
  return csvFile(QBO_HEADER, rows);
}
