import { amount, fmtDate, iifText } from "./util";

// QuickBooks Desktop IIF: tab-delimited GENERAL JOURNAL transactions (TRNS line, SPL lines, ENDTRNS); debits are positive, credits negative.
export const IIF_HEADERS = [
  "!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO",
  "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO",
  "!ENDTRNS",
];

export function buildIif(journals, { dateFormat = "mdy" } = {}) {
  const out = [...IIF_HEADERS];
  for (const j of journals) {
    const date = fmtDate(j.date, dateFormat);
    j.lines.forEach((l, i) => {
      const net = Math.round(((Number(l.debit) || 0) - (Number(l.credit) || 0)) * 100) / 100;
      out.push([i === 0 ? "TRNS" : "SPL", "", "GENERAL JOURNAL", date, iifText(l.account), "", iifText(l.className), amount(net), iifText(j.ref), iifText(l.memo || j.memo)].join("\t"));
    });
    out.push("ENDTRNS");
  }
  return out.join("\r\n") + "\r\n";
}
