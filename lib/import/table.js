import { parseDelimited } from "./csv";
import { readXlsx } from "./xlsx_read";

// A picked file → its first table (CORE-46; PLAT-03 can adopt): CSV / TSV text or an .xlsx workbook's first worksheet, rows as cell arrays.

export const IMPORT_ACCEPT = ".csv,.tsv,.txt,.xlsx";
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

// "csv" | "tsv" | "xlsx" from a file name ("csv" when unknown).
export function fileFormat(name) {
  const ext = String(name || "").toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "tsv") return "tsv";
  return "csv";
}

const hasData = (s) => s.rows.some((r) => r.some((c) => String(c ?? "").trim() !== ""));

// { name, bytes?, text?, sheet? } → { format, sheet, sheets, rows, workbook? }; xlsx needs bytes, delimited text either.
// `sheet` picks a worksheet by name (PLAT-03), else the first with data; `workbook` keeps every sheet's rows for switching.
export async function readTable({ name = "", bytes, text, sheet } = {}) {
  const format = fileFormat(name);
  if (format === "xlsx") {
    const { sheets } = await readXlsx(bytes);
    const chosen = (sheet && sheets.find((s) => s.name === sheet)) || sheets.find(hasData) || sheets[0];
    if (!chosen) throw new Error("The workbook has no worksheets.");
    return { format, sheet: chosen.name, sheets: sheets.map((s) => s.name), rows: chosen.rows, workbook: sheets };
  }
  const body = text ?? new TextDecoder().decode(bytes);
  return { format, sheet: "", sheets: [], rows: parseDelimited(body, format === "tsv" ? { delimiter: "\t" } : {}) };
}

// A browser File → readTable.
export async function readTableFile(file, { sheet } = {}) {
  if (!file) throw new Error("Pick a file first.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("That file is over 10 MB — split it and import the parts.");
  const format = fileFormat(file.name);
  return format === "xlsx" ? readTable({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), sheet }) : readTable({ name: file.name, text: await file.text() });
}
