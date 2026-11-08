import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";

import { detectDelimiter, parseDelimited } from "./csv";
import { columnIndex, readXlsx, serialToIso } from "./xlsx_read";
import { autoMap, cellText, headerRowIndex, missingColumns, normHeader, toRecords } from "./mapping";
import { fileFormat, readTable } from "./table";
import { crc32, workbookBytes } from "@/lib/export/xlsx";

test("parseDelimited reads quotes, doubled quotes, line breaks in cells, CRLF and a BOM", () => {
  const rows = parseDelimited('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", 'say "hi"', "two\nlines"], [""], ["1", "2", "3"]]);
});

test("detectDelimiter picks tab, semicolon or comma from the first line, ignoring quoted cells", () => {
  assert.equal(detectDelimiter("a\tb\tc\n1\t2\t3"), "\t");
  assert.equal(detectDelimiter("a;b;c"), ";");
  assert.equal(detectDelimiter('"x;y;z",b,c'), ",");
  assert.deepEqual(parseDelimited("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
});

test("autoMap matches keys, labels and aliases; an exact key beats another column's alias", () => {
  const cols = [
    { key: "entry_ref", label: "Entry ref", aliases: ["journal no"] },
    { key: "memo", label: "Memo", aliases: ["notes"] },
    { key: "line_memo", label: "Line memo", aliases: ["description", "memo"] },
    { key: "debit", label: "Debit", aliases: ["debits"], required: true },
  ];
  assert.deepEqual(autoMap(["Journal No.", "Memo", "Description", "Debits"], cols), { entry_ref: 0, memo: 1, line_memo: 2, debit: 3 });
  assert.deepEqual(missingColumns({ memo: 1 }, cols), ["Debit"]);
  assert.equal(normHeader("  GL_Account-Number "), "gl account number");
});

test("toRecords keeps spreadsheet row numbers across blank rows and strips the CSV formula guard", () => {
  const rows = [[], ["ref", "amount", "memo"], ["A", "10", "'=SUM(1)"], [""], ["B", 5, "'-x"]];
  assert.equal(headerRowIndex(rows), 1);
  const recs = toRecords(rows, { entry_ref: 0, debit: 1, memo: 2 });
  assert.deepEqual(recs, [
    { row: 3, entry_ref: "A", debit: "10", memo: "=SUM(1)" },
    { row: 5, entry_ref: "B", debit: 5, memo: "-x" },
  ]);
  assert.equal(cellText("'hello"), "'hello");
});

test("readXlsx reads the app's own export: text, numbers and dates back as ISO strings", async () => {
  const bytes = workbookBytes([
    {
      name: "Journal",
      columns: [
        { header: "entry_ref", key: "ref", type: "text" },
        { header: "date", key: "date", type: "date" },
        { header: "account_number", key: "acct", type: "text" },
        { header: "debit", key: "dr", type: "money" },
        { header: "memo", key: "memo", type: "text" },
      ],
      rows: [
        { ref: "JE-1", date: "2026-10-31", acct: "5100", dr: 420.5, memo: "Water & <sewer>" },
        { ref: "JE-1", date: "2026-10-31", acct: "1000", dr: null, memo: "=not a formula" },
      ],
    },
  ]);
  const { sheets } = await readXlsx(bytes);
  assert.equal(sheets[0].name, "Journal");
  assert.deepEqual(sheets[0].rows, [
    ["entry_ref", "date", "account_number", "debit", "memo"],
    ["JE-1", "2026-10-31", "5100", 420.5, "Water & <sewer>"],
    ["JE-1", "2026-10-31", "1000", "", "=not a formula"],
  ]);
});

// A minimal Excel-style workbook: deflated parts, shared strings, a date style and a sparse row.
function excelStyleWorkbook() {
  const files = {
    "[Content_Types].xml": '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets><sheet name="GL Export" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Journal No.</t></si><si><t>Date</t></si><si><r><t>Ac</t></r><r><t>count</t></r></si><si><t xml:space="preserve">Rent &amp; fees</t></si></sst>',
    "xl/styles.xml": '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="170" formatCode="mm/dd/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="170"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml":
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row><row r="3"><c r="A3"><v>1001</v></c><c r="B3" s="1"><v>46326</v></c><c r="C3" s="2"><v>46327</v></c><c r="D3" t="s"><v>3</v></c><c r="E3" t="b"><v>1</v></c><c r="F3"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>',
  };
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text);
    const data = new Uint8Array(deflateRawSync(raw));
    const nm = enc.encode(name);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(8, 8, true);
    lh.setUint32(14, crc32(raw), true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, nm.length, true);
    locals.push(new Uint8Array(lh.buffer), nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(10, 8, true);
    ch.setUint32(16, crc32(raw), true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, raw.length, true);
    ch.setUint16(28, nm.length, true);
    ch.setUint32(42, offset, true);
    centrals.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const size = centrals.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

test("readXlsx inflates Excel's deflated parts and reads shared strings, rich text, date styles, booleans and formulas", async () => {
  const { sheets } = await readXlsx(excelStyleWorkbook());
  assert.equal(sheets[0].name, "GL Export");
  assert.deepEqual(sheets[0].rows, [["Journal No.", "Date", "", "Account"], [], [1001, "2026-10-31", "2026-11-01", "Rent & fees", "TRUE", 2]]);
});

test("serialToIso and columnIndex", () => {
  assert.equal(serialToIso(46326), "2026-10-31");
  assert.equal(serialToIso(1, true), "1904-01-02");
  assert.equal(columnIndex("A1"), 0);
  assert.equal(columnIndex("AB12"), 27);
});

test("readTable: csv by default, xlsx by extension; a non-workbook is refused", async () => {
  assert.equal(fileFormat("jan.XLSX"), "xlsx");
  assert.equal(fileFormat("export.tsv"), "tsv");
  assert.equal(fileFormat("export"), "csv");
  const t = await readTable({ name: "a.csv", text: "x,y\n1,2" });
  assert.deepEqual(t, { format: "csv", sheet: "", sheets: [], rows: [["x", "y"], ["1", "2"]] });
  await assert.rejects(readTable({ name: "a.xlsx", bytes: new TextEncoder().encode("not a zip") }), /isn't an Excel workbook/);
});
