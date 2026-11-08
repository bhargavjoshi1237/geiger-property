import { amount, csvFile, fmtDate, num } from "./util";

// Xero "Import manual journals" CSV: lines sharing a Narration form one journal; Amount is positive for a debit and negative for a credit.
export const XERO_HEADER = ["*Narration", "*Date", "Description", "*AccountCode", "TaxRate", "*Amount", "TrackingName1", "TrackingOption1"];

export function buildXeroCsv(journals, { dateFormat = "dmy", trackingName = "Property" } = {}) {
  const rows = [];
  for (const j of journals) {
    const narration = `${j.ref} ${j.memo}`.trim();
    for (const l of j.lines) {
      const net = Math.round(((Number(l.debit) || 0) - (Number(l.credit) || 0)) * 100) / 100;
      rows.push([narration, fmtDate(j.date, dateFormat), l.memo || j.memo, l.account, "", num(amount(net)), l.className ? trackingName : "", l.className || ""]);
    }
  }
  return csvFile(XERO_HEADER, rows);
}
