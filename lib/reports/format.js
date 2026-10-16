import { formatIso } from "./periods";

// Pure cell formatting shared by report screens, CSV, print and email output.
// A column is { key, header, format?, value?(row), statusMap?, align? }.

export const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export const money0 = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);

export const pctOf = (part, whole) => (whole > 0 ? part / whole : 0);
export const pctLabel = (ratio, digits = 0) => `${((Number(ratio) || 0) * 100).toFixed(digits)}%`;

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const NUMERIC = new Set(["money", "money0", "number", "percent", "days", "meter"]);

export const isNumericColumn = (col) => NUMERIC.has(col?.format);
export const alignOf = (col) => col?.align || (isNumericColumn(col) ? "right" : "left");

export const cellValue = (col, row) => (col.value ? col.value(row) : row?.[col.key]);

// Display text (print / email / screen fallback).
export function cellText(col, row) {
  const v = cellValue(col, row);
  if (v === null || v === undefined || v === "") return col.format === "money" || col.format === "money0" ? money(0) : "—";
  switch (col.format) {
    case "money":
      return money(v);
    case "money0":
      return money0(v);
    case "number":
      return Number(v).toLocaleString("en-US");
    case "percent":
    case "meter":
      return pctLabel(v, col.digits ?? 0);
    case "days":
      return `${Number(v)}d`;
    case "date":
      return formatIso(v);
    case "status":
      return col.statusMap?.[v]?.label || String(v);
    case "bool":
      return v ? "Yes" : "No";
    default:
      return String(v);
  }
}

// Raw CSV value: numbers stay numeric (2dp for money), dates ISO.
export function cellCsv(col, row) {
  const v = cellValue(col, row);
  if (v === null || v === undefined) return "";
  switch (col.format) {
    case "money":
    case "money0":
      return round2(v).toFixed(2);
    case "percent":
    case "meter":
      return round2((Number(v) || 0) * 100);
    case "date":
      return String(v).slice(0, 10);
    case "status":
      return col.statusMap?.[v]?.label || String(v);
    case "bool":
      return v ? "Yes" : "No";
    default:
      return v;
  }
}
