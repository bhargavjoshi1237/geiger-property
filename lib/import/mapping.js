// Column mapping for file imports (CORE-46; PLAT-03 can adopt): headers → template keys by name or alias, then rows → records keyed by
// template key, each with its spreadsheet row number. Columns: [{ key, label, aliases?, required? }].

// Header text for matching: lower-case, punctuation folded to single spaces ("Journal No." → "journal no").
export const normHeader = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// A cell as trimmed text; numbers keep their digits, and the CSV export's formula guard (a leading ' before = + - @) comes off.
export function cellText(v) {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(v) : String(v).trim();
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

const blank = (row) => !row || !row.some((c) => cellText(c) !== "");

// Index of the header row: the first non-blank row (-1 when the table is empty).
export const headerRowIndex = (rows) => (rows || []).findIndex((r) => !blank(r));

// Header cells → { [key]: columnIndex } for every column whose key, label or alias matches a header.
export function autoMap(headers, columns) {
  const names = (headers || []).map(normHeader);
  const out = {};
  const taken = new Set();
  const pick = (col, wanted) => {
    const i = names.findIndex((n, idx) => n && !taken.has(idx) && wanted.includes(n));
    if (i >= 0) {
      out[col.key] = i;
      taken.add(i);
    }
  };
  // Exact keys and labels first, so "memo" never lands on an alias of another column.
  for (const col of columns) pick(col, [normHeader(col.key), normHeader(col.label)]);
  for (const col of columns) if (out[col.key] === undefined) pick(col, (col.aliases || []).map(normHeader));
  return out;
}

// Required columns the mapping leaves out → their labels.
export const missingColumns = (mapping, columns) => columns.filter((c) => c.required && (mapping?.[c.key] === undefined || mapping[c.key] === null || mapping[c.key] === "")).map((c) => c.label);

// Table rows under a header row → [{ row, ...values }] for every non-blank body row; `row` is the 1-based spreadsheet row.
export function toRecords(rows, mapping, { headerIndex = headerRowIndex(rows) } = {}) {
  const out = [];
  const keys = Object.entries(mapping || {}).filter(([, i]) => Number.isInteger(i) && i >= 0);
  (rows || []).forEach((cells, i) => {
    if (i <= headerIndex || blank(cells)) return;
    const rec = { row: i + 1 };
    for (const [key, col] of keys) {
      const v = cells[col];
      rec[key] = typeof v === "number" ? v : cellText(v);
    }
    out.push(rec);
  });
  return out;
}
