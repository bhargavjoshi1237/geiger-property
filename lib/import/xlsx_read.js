// Dependency-free .xlsx reader (CORE-46; PLAT-03 can adopt): each worksheet's cells as strings and numbers, date-formatted numbers as "YYYY-MM-DD".
// Inflates with DecompressionStream("deflate-raw"), so it runs in the browser and in Node 18+.

const td = new TextDecoder();
const utf8 = (bytes) => td.decode(bytes);

// Built-in number formats that render dates (ECMA-376 18.8.30).
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
export function decodeXml(s) {
  return String(s || "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const attrsOf = (tag) => {
  const out = {};
  for (const m of String(tag).matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1].replace(/^\w+:/, (p) => (p === "r:" ? "r:" : ""))] = decodeXml(m[2]);
  return out;
};

// Text of every <t> run inside a string item (phonetic runs dropped).
const runText = (xml) =>
  [...String(xml).replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "").matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t\b[^>]*\/>/g)]
    .map((m) => decodeXml(m[1] || ""))
    .join("");

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Zip central directory → (name) => Promise<text | null>.
function unzip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This isn't an Excel workbook (.xlsx).");
  const entries = new Map();
  let p = dv.getUint32(eocd + 16, true);
  const count = dv.getUint16(eocd + 10, true);
  for (let n = 0; n < count && p + 46 <= u8.length; n += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(p + 28, true);
    const name = utf8(u8.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), local: dv.getUint32(p + 42, true) });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return async (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
    const data = u8.subarray(start, start + e.size);
    if (e.method === 0) return utf8(data);
    if (e.method === 8) return utf8(await inflateRaw(data));
    throw new Error("This workbook uses a compression the importer can't read — save it again from Excel.");
  };
}

// "B12" → column index 1 (0-based).
export function columnIndex(ref) {
  const letters = String(ref || "").match(/^[A-Z]+/i)?.[0].toUpperCase() || "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// An Excel date serial → "YYYY-MM-DD" (1900 system, or 1904 when the workbook says so).
export function serialToIso(serial, date1904 = false) {
  const n = Math.floor(Number(serial));
  if (!Number.isFinite(n)) return "";
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(base + n * 86400000).toISOString().slice(0, 10);
}

// Does a custom number format render a date (d / m / y tokens outside quotes and brackets)?
const isDateCode = (code) => /[dmy]/i.test(String(code || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "")) && !/^general$/i.test(code);

function dateStyles(stylesXml) {
  const custom = new Map();
  for (const m of String(stylesXml || "").matchAll(/<(?:\w+:)?numFmt\b([^>]*)\/?>/g)) {
    const a = attrsOf(m[1]);
    custom.set(Number(a.numFmtId), a.formatCode || "");
  }
  const xfs = String(stylesXml || "").match(/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/)?.[1] || "";
  return [...xfs.matchAll(/<(?:\w+:)?xf\b([^>]*?)\/?>/g)].map((m) => {
    const id = Number(attrsOf(m[1]).numFmtId || 0);
    return DATE_FORMATS.has(id) || (custom.has(id) && isDateCode(custom.get(id)));
  });
}

function sheetRows(xml, shared, isDate, date1904) {
  const rows = [];
  for (const rm of String(xml).matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const ra = attrsOf(rm[1]);
    const index = ra.r ? Number(ra.r) - 1 : rows.length;
    const cells = [];
    let next = 0;
    for (const cm of String(rm[2] || "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const a = attrsOf(cm[1]);
      const col = a.r ? columnIndex(a.r) : next;
      next = col + 1;
      const body = cm[2] || "";
      const raw = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
      let value = "";
      if (a.t === "s") value = shared[Number(raw)] ?? "";
      else if (a.t === "inlineStr") value = runText(body.match(/<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/)?.[1] || "");
      else if (a.t === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (a.t === "str" || a.t === "e") value = decodeXml(raw ?? "");
      else if (raw !== undefined && raw !== "") {
        const n = Number(raw);
        value = Number.isFinite(n) ? (isDate[Number(a.s || 0)] ? serialToIso(n, date1904) : n) : decodeXml(raw);
      }
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    while (rows.length < index) rows.push([]);
    rows[index] = cells;
  }
  return rows;
}

// Workbook bytes → { sheets: [{ name, rows }] } in workbook order (rows indexed by sheet row, blank rows as []).
export async function readXlsx(bytes) {
  const read = unzip(bytes);
  const workbook = await read("xl/workbook.xml");
  if (!workbook) throw new Error("This isn't an Excel workbook (.xlsx).");
  const rels = (await read("xl/_rels/workbook.xml.rels")) || "";
  const targets = new Map([...rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)].map((m) => attrsOf(m[1])).map((a) => [a.Id, a.Target]));
  const sharedXml = (await read("xl/sharedStrings.xml")) || "";
  const shared = [...sharedXml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => runText(m[1]));
  const isDate = dateStyles(await read("xl/styles.xml"));
  const date1904 = /<(?:\w+:)?workbookPr\b[^>]*date1904\s*=\s*"(1|true)"/i.test(workbook);
  const sheets = [];
  for (const m of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    const a = attrsOf(m[1]);
    const target = targets.get(a["r:id"]) || "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = await read(path);
    if (xml !== null) sheets.push({ name: a.name || `Sheet ${sheets.length + 1}`, rows: sheetRows(xml, shared, isDate, date1904) });
  }
  return { sheets };
}
