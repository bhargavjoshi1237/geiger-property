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

// { name, bytes?, text? } → { format, sheet, sheets, rows }; xlsx needs bytes, delimited text either.
export async function readTable({ name = "", bytes, text } = {}) {
  const format = fileFormat(name);
  if (format === "xlsx") {
    const { sheets } = await readXlsx(bytes);
    const first = sheets.find((s) => s.rows.some((r) => r.some((c) => String(c ?? "").trim() !== ""))) || sheets[0];
    if (!first) throw new Error("The workbook has no worksheets.");
    return { format, sheet: first.name, sheets: sheets.map((s) => s.name), rows: first.rows };
  }
  const body = text ?? new TextDecoder().decode(bytes);
  return { format, sheet: "", sheets: [], rows: parseDelimited(body, format === "tsv" ? { delimiter: "\t" } : {}) };
}

// A browser File → readTable.
export async function readTableFile(file) {
  if (!file) throw new Error("Pick a file first.");
  if (file.size > MAX_IMPORT_BYTES) throw new Error("That file is over 10 MB — split it and import the parts.");
  const format = fileFormat(file.name);
  return format === "xlsx" ? readTable({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }) : readTable({ name: file.name, text: await file.text() });
}
