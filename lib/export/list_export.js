import { csvCell, CSV_BOM, csvSlug } from "@/lib/reports/csv";

// Pure list-export logic: columns for a config, CSV text, file names. The xlsx writer is loaded on demand.

// Export columns as { header, value(row), type? }: config.exportColumns, else config.columns via exportValue / row[key].
export function exportColumns(config) {
  if (config?.exportColumns?.length) return config.exportColumns.map(normalizeColumn);
  return (config?.columns || []).filter((c) => c.header && c.key !== "actions").map(normalizeColumn);
}

// `permission` (optional) drops the column for viewers without that key (CORE-07: ledger balances).
function normalizeColumn(c) {
  const value = c.exportValue || c.value || ((r) => r?.[c.key]);
  return { header: c.header, value, type: c.exportType || c.type, ...(c.permission ? { permission: c.permission } : {}) };
}

// Plain value for CSV: money/percent as numbers, dates as YYYY-MM-DD.
function csvValue(col, row) {
  const v = col.value(row);
  if (v === null || v === undefined) return "";
  if (col.type === "date" || v instanceof Date) return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  if (col.type === "money") return Math.round((Number(v) || 0) * 100) / 100;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return v;
}

// CSV text (no BOM) for one sheet { columns, rows }.
export function sheetCsv({ columns, rows }) {
  const cols = columns.map(normalizeColumn);
  return [cols.map((c) => csvCell(c.header)).join(","), ...(rows || []).map((r) => cols.map((c) => csvCell(csvValue(c, r))).join(","))].join("\r\n");
}

// CSV text (no BOM) for rows under a config's export columns.
export const listCsv = (config, rows) => sheetCsv(listSheet(config, rows));

// One xlsx sheet for a list.
export function listSheet(config, rows, name) {
  return { name: name || config?.plural || config?.title || "Export", columns: exportColumns(config), rows: rows || [] };
}

export const exportFileName = (name, ext, date = new Date()) => `${csvSlug(name)}-${date.toISOString().slice(0, 10)}.${ext}`;

export { CSV_BOM };
