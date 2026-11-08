// Delimited text (CSV, TSV or semicolon) → rows of cells, keeping blank lines so row numbers match the file; generic, so PLAT-03's importer can adopt it (CORE-46).

const BOM = "﻿";
const DELIMITERS = [",", "\t", ";"];

// The delimiter the first non-blank line uses most outside quotes (comma when none).
export function detectDelimiter(text) {
  const src = String(text || "").replace(BOM, "");
  const line = src.split(/\r\n|\n|\r/).find((l) => l.trim()) || "";
  const counts = new Map(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch) + 1);
  }
  let best = ",";
  for (const d of DELIMITERS) if (counts.get(d) > counts.get(best)) best = d;
  return best;
}

// Text → rows of cells (strings, untrimmed); a quoted cell may hold delimiters, quotes ("") and line breaks.
export function parseDelimited(text, { delimiter } = {}) {
  const src = String(text || "").replace(BOM, "");
  const delim = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
