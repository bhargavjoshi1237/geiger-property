import { cellText, guessHeaderRow } from "@/lib/import/mapping";

// File rows (from lib/import's CSV / XLSX reader) → the import's records (PLAT-03): unique headers and { rowNo, raw } per body
// row, raw keyed by header text. A row with one filled cell is a group label (reports group units under each property),
// carried on later rows as raw.__group; total rows are dropped. rowNo is the 1-based spreadsheet row.

const TOTAL_ROW = /^(grand\s+)?totals?\b|^total for\b|^summary\b/i;
const looksLikeValue = (c) => /^[-+$(]?[\d,.]+%?\)?$/.test(c) || /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(c);

// Header cells made unique ("Phone", "Phone (2)") and never blank ("Column 4").
export function uniqueHeaders(cells) {
  const seen = new Map();
  return (cells || []).map((c, i) => {
    const base = cellText(c) || `Column ${i + 1}`;
    const n = (seen.get(base.toLowerCase()) || 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export function tableRecords(rows, headerIndex = guessHeaderRow(rows)) {
  const headers = uniqueHeaders(rows?.[headerIndex] || []);
  const records = [];
  let group = "";
  (rows || []).forEach((cells, i) => {
    if (i <= headerIndex) return;
    const texts = (cells || []).map(cellText);
    const filled = texts.filter((c) => c !== "");
    if (!filled.length || TOTAL_ROW.test(filled[0])) return;
    if (filled.length === 1 && headers.length >= 3 && !looksLikeValue(filled[0])) {
      group = filled[0].replace(/^[-=>\s]+/, "").trim();
      return;
    }
    const raw = {};
    headers.forEach((h, j) => {
      raw[h] = texts[j] ?? "";
    });
    if (group) raw.__group = group;
    records.push({ rowNo: i + 1, raw });
  });
  return { headers, records };
}
