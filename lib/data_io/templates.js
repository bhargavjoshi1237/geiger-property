import { workbookBytes } from "@/lib/export/xlsx";
import { CSV_BOM, csvCell } from "@/lib/reports/csv";
import { importSpec } from "./import_spec";

// Downloadable import templates (PLAT-03): one column per import field (headers are the labels, so they map themselves),
// an example row, and in the workbook a Notes sheet saying what each column takes. Pure; PLAT-04's export can share it.

const TYPE_NOTE = {
  text: "Text",
  email: "Email address (several: separate with ; — the first is kept as the main one)",
  phone: "Phone number",
  integer: "Whole number",
  number: "Number",
  money: "Amount, e.g. 1234.50 or $1,234.50; (100.00) or -100 is negative",
  percent: "Percent, e.g. 8 or 8%",
  date: "Date, MM/DD/YYYY or YYYY-MM-DD",
  boolean: "Yes or No",
  enum: "One of the allowed values",
  reference: "Name of a record already in Geiger",
};

const lookupNote = (fld) => {
  if (!fld.lookup) return "";
  const by = { name: "name", address: "address", email: "email", label: "unit number", number: "number" };
  return `Matched by ${fld.lookup.by.map((b) => by[b] || b).join(" or ")}${fld.lookup.scope?.length ? " within the row's property" : ""}.`;
};

// Columns and notes for a spec (custom fields included when the caller passes them).
export function templateColumns(spec) {
  return spec.fields.map((fld) => ({
    key: fld.key,
    header: fld.label,
    example: fld.example ?? "",
    required: Boolean(fld.required),
    type: fld.type,
    note: [TYPE_NOTE[fld.type] || "Text", fld.enum?.length ? `Allowed: ${fld.enum.join(", ")}.` : "", lookupNote(fld), fld.help || ""].filter(Boolean).join(" "),
  }));
}

export const templateFileName = (entity, ext) => `geiger-${entity.replace(/_/g, "-")}-template.${ext}`;

// CSV text (with BOM) for an import entity: header row + example row.
export function importTemplateCsv(entity, { custom } = {}) {
  const cols = templateColumns(importSpec(entity, { custom }));
  return CSV_BOM + [cols.map((c) => csvCell(c.header)).join(","), cols.map((c) => csvCell(c.example)).join(",")].join("\r\n") + "\r\n";
}

// .xlsx bytes for an import entity: the template sheet and a Notes sheet.
export function importTemplateWorkbook(entity, { custom } = {}) {
  const spec = importSpec(entity, { custom });
  const cols = templateColumns(spec);
  const example = Object.fromEntries(cols.map((c) => [c.key, c.example]));
  return workbookBytes([
    { name: spec.label, columns: cols.map((c) => ({ header: c.header, key: c.key, type: "text" })), rows: [example] },
    {
      name: "Notes",
      columns: [
        { header: "Column", key: "header", width: 28 },
        { header: "Required", key: "required", width: 10 },
        { header: "What it takes", key: "note", width: 90 },
      ],
      rows: [{ header: spec.label, required: "", note: spec.description }, ...cols.map((c) => ({ header: c.header, required: c.required ? "Yes" : "", note: c.note }))],
    },
  ]);
}
