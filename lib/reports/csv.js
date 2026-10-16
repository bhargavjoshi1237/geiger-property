import { cellCsv } from "./format";

// Pure CSV rendering for report sections (client downloads + scheduled emails).

function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Neutralize spreadsheet formula injection for text cells.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_BOM = "﻿"; // so Excel reads the file as UTF-8

// One table: header line + rows.
export function tableCsv(columns, rows) {
  return [
    columns.map((c) => csvCell(c.header)).join(","),
    ...(rows || []).map((r) => columns.map((c) => csvCell(cellCsv(c, r))).join(",")),
  ].join("\r\n");
}

// Every exportable section, each under a title line, separated by a blank line.
export function sectionsCsv(sections) {
  const list = (sections || []).filter((s) => s.columns?.length && s.kind !== "note");
  if (list.length === 1) return tableCsv(list[0].columns, rowsWithTotals(list[0]));
  return list.map((s) => [csvCell(s.title), tableCsv(s.columns, rowsWithTotals(s))].join("\r\n")).join("\r\n\r\n");
}

export const rowsWithTotals = (s) => (s.totals ? [...(s.rows || []), s.totals] : s.rows || []);

export const csvSlug = (name) =>
  String(name || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "report";
