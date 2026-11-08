import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";

import { colName, crc32, dateSerial, sheetNames, toCell, workbookBytes } from "./xlsx.js";
import { exportColumns, listCsv, sheetCsv } from "./list_export.js";
import { sectionsSheets } from "../reports/xlsx.js";

// Minimal zip reader (stored or deflated) so tests inspect the real bytes.
function unzip(bytes) {
  const buf = Buffer.from(bytes);
  const eocd = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocd), 0x06054b50);
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(crc32(data), crc, `crc ${name}`);
    files[name] = data.toString("utf8");
    at += 46 + nameLen;
  }
  return files;
}

const book = (sheets) => unzip(workbookBytes(sheets));

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("colName handles wide sheets", () => {
  assert.equal(colName(0), "A");
  assert.equal(colName(25), "Z");
  assert.equal(colName(26), "AA");
  assert.equal(colName(701), "ZZ");
  assert.equal(colName(702), "AAA");
  assert.equal(colName(16383), "XFD");
});

test("dateSerial gives Excel serials and rejects bad dates", () => {
  assert.equal(dateSerial("1900-03-01"), 61);
  assert.equal(dateSerial("2026-01-01"), 46023);
  assert.equal(dateSerial("2026-01-01T23:59:00Z"), 46023);
  assert.equal(dateSerial(new Date(Date.UTC(2026, 0, 2))), 46024);
  assert.equal(dateSerial("2026-02-30"), null);
  assert.equal(dateSerial("nope"), null);
});

test("toCell types numbers, dates, money and text", () => {
  assert.deepEqual(toCell(12.5), { t: "n", v: 12.5, s: 5 });
  assert.deepEqual(toCell("2026-01-01"), { t: "n", v: 46023, s: 2 });
  assert.deepEqual(toCell("1200.5", "money"), { t: "n", v: 1200.5, s: 3 });
  assert.deepEqual(toCell(0.25, "percent"), { t: "n", v: 0.25, s: 4 });
  assert.equal(toCell("12", "text").t, "s");
  assert.equal(toCell(true).v, "Yes");
  assert.equal(toCell(null), null);
  assert.equal(toCell(""), null);
  assert.equal(toCell("abc", "money"), null);
  assert.equal(toCell(NaN), null);
  assert.equal(toCell("not a date", "date").t, "s");
});

test("workbook has the package parts and typed cells", () => {
  const f = book([
    {
      name: "Bills",
      columns: [
        { header: "Bill", key: "name" },
        { header: "Due", key: "due", type: "date" },
        { header: "Amount", key: "amount", type: "money" },
      ],
      rows: [{ name: "Water", due: "2026-03-15", amount: 120.5 }],
    },
  ]);
  for (const n of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) assert.ok(f[n], n);
  const sheet = f["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">Water<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="B2" s="2"><v>\d+<\/v><\/c>/);
  assert.match(sheet, /<c r="C2" s="3"><v>120.5<\/v><\/c>/);
  assert.ok(!sheet.includes("<f>"));
});

test("a cell starting with = is stored as text, never a formula", () => {
  const rows = [{ n: '=HYPERLINK("x")' }, { n: "+1+1" }, { n: "@SUM(A1)" }];
  const sheet = book([{ name: "S", columns: [{ header: "Note", key: "n" }], rows }])["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\)<\/t>/);
  assert.ok(!sheet.includes("<f>") && !sheet.includes("<f "));
  assert.equal((sheet.match(/t="inlineStr"/g) || []).length, 4);
});

test("XML special and control characters are escaped or dropped", () => {
  const sheet = book([{ name: "S", columns: [{ header: "A&B", key: "n" }], rows: [{ n: "<b>\u0001x" }] }])["xl/worksheets/sheet1.xml"];
  assert.ok(sheet.includes("A&amp;B"));
  assert.ok(sheet.includes("&lt;b&gt;x"));
});

test("wide sheet writes column letters past Z and a full autofilter", () => {
  const columns = Array.from({ length: 30 }, (_, i) => ({ header: `C${i}`, key: `k${i}`, type: "number" }));
  const row = Object.fromEntries(columns.map((c, i) => [c.key, i]));
  const sheet = book([{ name: "Wide", columns, rows: [row] }])["xl/worksheets/sheet1.xml"];
  assert.ok(sheet.includes('<c r="AD2" s="5"><v>29</v></c>'));
  assert.ok(sheet.includes('<autoFilter ref="A1:AD2"/>'));
  assert.ok(sheet.includes('<dimension ref="A1:AD2"/>'));
});

test("sheet names are cleaned, trimmed to 31 and made unique", () => {
  const n = sheetNames(["Income / Expense: Q1?", "x".repeat(40), "x".repeat(40), "Dup", "dup", ""]);
  assert.equal(n[0], "Income   Expense  Q1");
  assert.equal(n[1].length, 31);
  assert.equal(n[2].length <= 31, true);
  assert.notEqual(n[1], n[2]);
  assert.equal(new Set(n.map((x) => x.toLowerCase())).size, n.length);
  assert.ok(n[5]);
});

test("one sheet per section for a multi-sheet workbook", () => {
  const f = book([
    { name: "Income", columns: [{ header: "A", key: "a" }], rows: [{ a: 1 }] },
    { name: "Expenses", columns: [{ header: "A", key: "a" }], rows: [{ a: 2 }] },
  ]);
  assert.match(f["xl/workbook.xml"], /name="Income" sheetId="1"/);
  assert.match(f["xl/workbook.xml"], /name="Expenses" sheetId="2"/);
  assert.ok(f["xl/worksheets/sheet2.xml"]);
});

test("empty workbook and empty rows still produce valid parts", () => {
  assert.ok(book([])["xl/worksheets/sheet1.xml"]);
  assert.ok(book([{ name: "E", columns: [{ header: "A", key: "a" }], rows: [] }])["xl/worksheets/sheet1.xml"].includes('<dimension ref="A1:A1"/>'));
});

test("exportColumns prefers config.exportColumns, then columns, skipping actions", () => {
  const rowCols = [{ key: "name", header: "Name", render: () => null }, { key: "actions", header: "" }, { key: "n", header: "N", exportValue: (r) => r.n * 2 }];
  const cols = exportColumns({ columns: rowCols });
  assert.deepEqual(cols.map((c) => c.header), ["Name", "N"]);
  assert.equal(cols[1].value({ n: 2 }), 4);
  assert.equal(cols[0].value({ name: "x" }), "x");
  assert.deepEqual(exportColumns({ columns: rowCols, exportColumns: [{ header: "Only", key: "o" }] }).map((c) => c.header), ["Only"]);
});

test("list CSV keeps dates ISO, money numeric and guards formulas", () => {
  const config = { exportColumns: [{ header: "Name", key: "name" }, { header: "Due", key: "due", type: "date" }, { header: "Amt", key: "amt", type: "money" }] };
  const csv = listCsv(config, [{ name: "=cmd", due: "2026-03-15T10:00:00Z", amt: 12.345 }]);
  assert.equal(csv, "Name,Due,Amt\r\n'=cmd,2026-03-15,12.35");
  assert.equal(sheetCsv({ columns: config.exportColumns, rows: [] }), "Name,Due,Amt");
});

test("report sections become typed sheets with totals and status labels", () => {
  const sheets = sectionsSheets([
    {
      title: "Income",
      columns: [
        { key: "acct", header: "Account" },
        { key: "amt", header: "Amount", format: "money" },
        { key: "st", header: "Status", format: "status", statusMap: { ok: { label: "Fine" } } },
      ],
      rows: [{ acct: "Rent", amt: 100, st: "ok" }],
      totals: { acct: "Total", amt: 100 },
    },
    { title: "Note", kind: "note", columns: [{ key: "a", header: "A" }], rows: [] },
    { title: "Expenses", columns: [{ key: "amt", header: "Amount", format: "money" }], rows: [{ amt: 5 }] },
  ]);
  assert.deepEqual(sheets.map((s) => s.name), ["Income", "Expenses"]);
  assert.equal(sheets[0].rows.length, 2);
  const f = book(sheets);
  assert.match(f["xl/worksheets/sheet1.xml"], /Fine/);
  assert.match(f["xl/worksheets/sheet1.xml"], /<c r="B3" s="3"><v>100<\/v><\/c>/);
});
