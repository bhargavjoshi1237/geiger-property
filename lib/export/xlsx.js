// Dependency-free xlsx writer: typed cells only (never formulas), stored zip.

import { redactSensitive } from "@/lib/screening/sensitive";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_ROWS = 1048576;
const MAX_COLS = 16384;

// Style ids in cellXfs below.
const S = { text: 0, header: 1, date: 2, money: 3, percent: 4, number: 5 };

const enc = new TextEncoder();
const esc = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// 0 -> A, 25 -> Z, 26 -> AA, 16383 -> XFD.
export function colName(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Excel date serial (1900 system) for a Date or an ISO "YYYY-MM-DD..." string; null when unparseable.
export function dateSerial(v) {
  let y, m, d;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    [y, m, d] = [v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()];
  } else {
    const hit = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (!hit) return null;
    [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  }
  const ms = Date.UTC(y, m - 1, d);
  if (new Date(ms).getUTCMonth() !== m - 1) return null;
  return Math.round(ms / 86400000) + 25569;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:$|T)/;

// One cell as { t, v, s } or null when blank; `type` forces a column type, else it is inferred from the value.
export function toCell(value, type) {
  if (value === null || value === undefined || value === "") return null;
  const num = (n, s) => (Number.isFinite(n) ? { t: "n", v: n, s } : null);
  switch (type) {
    case "money":
      return num(Number(value), S.money);
    case "percent":
      return num(Number(value), S.percent);
    case "number":
      return num(Number(value), S.number);
    case "date": {
      const n = dateSerial(value);
      return n === null ? { t: "s", v: String(value), s: S.text } : { t: "n", v: n, s: S.date };
    }
    case "bool":
      return { t: "s", v: value ? "Yes" : "No", s: S.text };
    case "text":
      return { t: "s", v: String(value), s: S.text };
    default:
  }
  if (typeof value === "number") return num(value, S.number);
  if (typeof value === "boolean") return { t: "s", v: value ? "Yes" : "No", s: S.text };
  if (value instanceof Date) return toCell(value, "date");
  if (typeof value === "string" && ISO_DATE.test(value)) return toCell(value, "date");
  return { t: "s", v: String(value), s: S.text };
}

// Excel sheet names: max 31 chars, none of []:*?/\, unique case-insensitively.
export function sheetNames(names) {
  const used = new Set();
  return names.map((raw, i) => {
    const base =
      String(raw || "")
        .replace(/[[\]:*?/\\]/g, " ")
        .replace(/^'+|'+$/g, "")
        .trim()
        .slice(0, 31) || `Sheet ${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const tail = ` (${n})`;
      name = base.slice(0, 31 - tail.length) + tail;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function colWidth(col, rows, getter) {
  if (col.width) return col.width;
  let w = String(col.header ?? "").length + 2;
  for (const r of rows.slice(0, 200)) {
    const v = getter(r);
    if (v !== null && v !== undefined) w = Math.max(w, String(v instanceof Date ? "2000-01-01" : v).length + 1);
  }
  return Math.min(Math.max(w, 8), 60);
}

function sheetXml({ columns, rows }) {
  const cols = columns.slice(0, MAX_COLS);
  const data = rows.slice(0, MAX_ROWS - 1);
  const getters = cols.map((c) => (c.value ? c.value : (r) => r?.[c.key]));
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
  const last = `${colName(Math.max(cols.length, 1) - 1)}${data.length + 1}`;
  out.push(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/>`);
  out.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
  if (cols.length) {
    out.push("<cols>" + cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${colWidth(c, data, getters[i])}" customWidth="1"/>`).join("") + "</cols>");
  }
  out.push("<sheetData>");
  out.push(
    '<row r="1">' +
      cols.map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="${S.header}"><is><t xml:space="preserve">${esc(c.header ?? "")}</t></is></c>`).join("") +
      "</row>",
  );
  data.forEach((row, ri) => {
    const r = ri + 2;
    let cells = "";
    cols.forEach((c, ci) => {
      const cell = toCell(getters[ci](row), c.type);
      if (!cell) return;
      const ref = `${colName(ci)}${r}`;
      cells +=
        cell.t === "n"
          ? `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`
          : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
    });
    out.push(`<row r="${r}">${cells}</row>`);
  });
  out.push("</sheetData>");
  if (cols.length) out.push(`<autoFilter ref="A1:${colName(cols.length - 1)}${data.length + 1}"/>`);
  out.push("</worksheet>");
  return out.join("");
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="0.00%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

let crcTable;
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Stored (uncompressed) zip of [{ name, data }]; returns a Uint8Array.
export function zipStore(files) {
  const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(12, DOS_DATE, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    locals.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(14, DOS_DATE, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    centrals.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
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

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Workbook bytes for [{ name, columns: [{ header, key?, value?(row), type?, width? }], rows }].
export function workbookBytes(sheets) {
  const given = sheets && sheets.length ? sheets : [{ name: "Sheet 1" }];
  // Rows pass the screening deny-list first (RISK-02).
  const list = given.map((s) => ({ ...s, columns: s.columns || [], rows: (s.rows || []).map(redactSensitive) }));
  const names = sheetNames(list.map((s) => s.name));
  const files = [
    {
      name: "[Content_Types].xml",
      data:
        `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        "</Types>",
    },
    {
      name: "_rels/.rels",
      data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>` +
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets></workbook>",
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${list.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zipStore(files);
}

// Workbook as a Blob for a browser download.
export function buildWorkbook(sheets) {
  return new Blob([workbookBytes(sheets)], { type: XLSX_MIME });
}
