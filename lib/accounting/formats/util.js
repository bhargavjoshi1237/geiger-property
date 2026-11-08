import { CSV_BOM, csvCell } from "@/lib/reports/csv";

// Shared helpers for the accounting-export formatters.

export const DATE_FORMATS = [
  { value: "mdy", label: "MM/DD/YYYY" },
  { value: "dmy", label: "DD/MM/YYYY" },
  { value: "ymd", label: "YYYY-MM-DD" },
];

// "YYYY-MM-DD" → the import file's date style.
export function fmtDate(iso, style = "mdy") {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  if (style === "ymd") return `${y}-${m}-${d}`;
  return style === "dmy" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

// Fixed two-decimal amount, "" when zero and blanks are wanted.
export const amount = (n, blankZero = false) => (blankZero && !n ? "" : (Math.round((Number(n) || 0) * 100) / 100).toFixed(2));

// A number cell is written raw so a minus sign is not read as a formula and neutralized.
export const num = (s) => ({ raw: s });

// One CSV line; text cells get the formula-injection guard from the report CSV writer.
export const csvLine = (cells) => cells.map((c) => (c && typeof c === "object" ? c.raw : csvCell(c))).join(",");

// Header + rows as a UTF-8 CSV file (BOM, CRLF).
export const csvFile = (header, rows) => CSV_BOM + [csvLine(header), ...rows.map(csvLine)].join("\r\n") + "\r\n";

// IIF is tab-delimited with no quoting: tabs and line breaks in text become spaces.
export const iifText = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ").trim();
