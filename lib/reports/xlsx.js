import { cellValue } from "./format";
import { rowsWithTotals } from "./csv";

// Report sections as xlsx sheets: one sheet per exportable section, typed by column format.

const TYPE = { money: "money", money0: "money", number: "number", days: "number", percent: "percent", meter: "percent", date: "date", bool: "bool" };

function columnOf(col) {
  const value =
    col.format === "status" ? (r) => col.statusMap?.[cellValue(col, r)]?.label || cellValue(col, r) : (r) => cellValue(col, r);
  return { header: col.header, value, type: TYPE[col.format] };
}

export function sectionsSheets(sections) {
  return (sections || [])
    .filter((s) => s.columns?.length && s.kind !== "note")
    .map((s, i) => ({ name: s.title || `Section ${i + 1}`, columns: s.columns.map(columnOf), rows: rowsWithTotals(s) }));
}
