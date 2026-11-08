import { PDFArray, PDFDocument, PDFRawStream, StandardFonts, decodePDFRawStream, rgb } from "pdf-lib";

import { LABELS } from "./compose_rules";
import { fieldsFor } from "./anchors";

// Lease PDF renderer (LEAS-08) on pdf-lib: US Letter, Helvetica (WinAnsi covers English, Spanish and French; other characters are
// transliterated or replaced and counted), numbered sections, addenda on new pages, a signature block per signer with provider
// anchors drawn in white on each line, and "Page N of M" footers. Pure: no I/O; returns bytes plus page count and anchor positions.

const PAGE = { width: 612, height: 792 };
const MARGIN = { top: 64, bottom: 72, left: 64, right: 64 };
const WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const SIZE = { body: 10, heading: 10.5, title: 14, addendum: 13, sub: 8.5, caption: 8, footer: 8, anchor: 10 };
const LINE = { body: 14, heading: 15, title: 19, addendum: 17, sub: 12 };
const GAP = { para: 6, headingBefore: 9, headingAfter: 3, signerBlock: 64 };
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.78, 0.78, 0.8);
const WHITE = rgb(1, 1, 1);

// Characters Helvetica can't encode: common symbols mapped to ASCII, accents stripped (Vietnamese), anything else "?".
const SUBSTITUTE = {
  "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "≠": "!=", "−": "-", "‐": "-", "‑": "-",
  "′": "'", "″": '"', "✓": "x", "✔": "x", " ": " ", " ": " ", "​": "", "﻿": "",
  "đ": "d", "Đ": "D", "ł": "l", "Ł": "L",
};

function makeCleaner(font) {
  const supported = new Set(font.getCharacterSet());
  let replaced = 0;
  const clean = (text) => {
    let out = "";
    for (const ch of String(text ?? "")) {
      const cp = ch.codePointAt(0);
      if (cp === 10 || supported.has(cp)) {
        out += ch;
        continue;
      }
      replaced += 1;
      if (ch in SUBSTITUTE) {
        out += SUBSTITUTE[ch];
        continue;
      }
      const base = ch.normalize("NFD").replace(/[̀-̛ͯ]/g, "");
      out += base && [...base].every((c) => supported.has(c.codePointAt(0))) ? base : "?";
    }
    return out;
  };
  return { clean, replacedCount: () => replaced };
}

// Words and whitespace of styled runs → [{ text, font, space }].
function tokenize(runs, fonts) {
  const out = [];
  for (const r of runs) {
    for (const part of String(r.text || "").split(/(\s+)/)) {
      if (part) out.push({ text: /^\s+$/.test(part) ? " " : part, font: r.bold ? fonts.bold : fonts.regular, space: /^\s+$/.test(part) });
    }
  }
  return out;
}

// Greedy wrap within `width`; continuation lines start `hang` in. Overlong words break by character.
function wrap(tokens, width, size, hang = 0) {
  const lines = [];
  let line = [];
  let used = 0;
  let avail = width;
  const w = (t) => t.font.widthOfTextAtSize(t.text, size);
  const flush = () => {
    while (line.length && line[line.length - 1].space) line.pop();
    lines.push({ tokens: line, indent: lines.length ? hang : 0 });
    line = [];
    used = 0;
    avail = width - hang;
  };
  for (const tok of tokens) {
    const tw = w(tok);
    if (tok.space) {
      if (line.length) {
        line.push(tok);
        used += tw;
      }
      continue;
    }
    if (used + tw <= avail) {
      line.push(tok);
      used += tw;
      continue;
    }
    if (line.length) flush();
    if (tw <= avail) {
      line.push(tok);
      used = tw;
      continue;
    }
    let chunk = "";
    for (const ch of tok.text) {
      if (chunk && tok.font.widthOfTextAtSize(chunk + ch, size) > avail) {
        line.push({ ...tok, text: chunk });
        flush();
        chunk = ch;
      } else chunk += ch;
    }
    if (chunk) {
      line.push({ ...tok, text: chunk });
      used = tok.font.widthOfTextAtSize(chunk, size);
    }
  }
  if (line.length || !lines.length) flush();
  return lines;
}

// Consecutive tokens in one font → drawable segments.
function segments(tokens) {
  const out = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.font === t.font) last.text += t.text;
    else out.push({ text: t.text, font: t.font });
  }
  return out;
}

class Writer {
  constructor(doc, fonts, clean) {
    this.doc = doc;
    this.fonts = fonts;
    this.clean = clean;
    this.page = null;
    this.y = 0;
    this.fresh = true;
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN.top;
    this.fresh = true;
  }

  ensure(height) {
    if (!this.page || this.y - height < MARGIN.bottom) this.newPage();
  }

  get pageNumber() {
    return this.doc.getPageCount();
  }

  // Styled runs wrapped to the content width; `align: "center"` centres each line.
  lines(runs, { size, lineHeight, color = INK, marker = "", align = "left", x = MARGIN.left, width = WIDTH }) {
    const cleaned = runs.map((r) => ({ ...r, text: this.clean(r.text) }));
    const hang = marker ? this.fonts.regular.widthOfTextAtSize(`${this.clean(marker)} `, size) : 0;
    for (const l of wrap(tokenize(cleaned, this.fonts), width, size, hang)) {
      this.ensure(lineHeight);
      const segs = segments(l.tokens);
      const total = segs.reduce((s, g) => s + g.font.widthOfTextAtSize(g.text, size), 0);
      let cx = align === "center" ? x + (width - total) / 2 : x + l.indent;
      const baseline = this.y - size;
      for (const g of segs) {
        this.page.drawText(g.text, { x: cx, y: baseline, size, font: g.font, color });
        cx += g.font.widthOfTextAtSize(g.text, size);
      }
      this.y -= lineHeight;
      this.fresh = false;
    }
  }

  gap(h) {
    if (!this.fresh) this.y -= h;
  }
}

function drawBlocks(wr, blocks) {
  for (const b of blocks) {
    if (b.type === "title") {
      wr.ensure(LINE.title * 2);
      wr.lines(b.lines[0].runs, { size: SIZE.title, lineHeight: LINE.title, align: "center" });
      wr.y -= 8;
      continue;
    }
    if (b.type === "heading") {
      wr.gap(GAP.headingBefore);
      wr.ensure(LINE.heading + LINE.body * 2);
      wr.lines(b.lines[0].runs, { size: SIZE.heading, lineHeight: LINE.heading });
      wr.y -= GAP.headingAfter;
      continue;
    }
    for (const l of b.lines) wr.lines(l.runs, { size: SIZE.body, lineHeight: LINE.body, marker: l.marker });
    wr.y -= GAP.para;
  }
}

// One signature block per signer: role, signature line (with its anchor) and date line, kept on one page.
function drawSignatures(wr, section, signers, labels, anchorFor, anchors) {
  if (!signers.length) return;
  wr.gap(GAP.headingBefore + 4);
  wr.ensure(LINE.heading + GAP.signerBlock);
  wr.lines([{ text: labels.signatures, bold: true }], { size: SIZE.heading, lineHeight: LINE.heading });
  wr.y -= 6;
  const sigLine = { x: MARGIN.left, width: 260 };
  const dateLine = { x: MARGIN.left + 290, width: 150 };
  for (const signer of signers) {
    wr.ensure(GAP.signerBlock);
    const top = wr.y;
    const role = labels.roles[signer.role] || labels.roles.tenant;
    wr.page.drawText(wr.clean(role), { x: MARGIN.left, y: top - SIZE.caption, size: SIZE.caption, font: wr.fonts.bold, color: MUTED });
    const lineY = top - 34;
    const [sigField, dateField] = fieldsFor(section.id === "body" ? "lease" : `add${section.number}`, signer);
    for (const [field, box] of [[sigField, sigLine], [dateField, dateLine]]) {
      wr.page.drawLine({ start: { x: box.x, y: lineY }, end: { x: box.x + box.width, y: lineY }, thickness: 0.6, color: INK });
      const text = wr.clean(anchorFor(signer, field) || "");
      let size = 0;
      if (text) {
        size = Math.max(3, Math.min(SIZE.anchor, (box.width - 4) / wr.fonts.regular.widthOfTextAtSize(text, 1)));
        wr.page.drawText(text, { x: box.x + 2, y: lineY + 3, size, font: wr.fonts.regular, color: WHITE });
      }
      anchors.push({
        signer: signer.index,
        role: signer.role,
        name: signer.name,
        email: signer.email || "",
        field: field.type,
        id: field.id,
        section: section.id,
        page: wr.pageNumber,
        x: Math.round(box.x * 100) / 100,
        y: Math.round(lineY * 100) / 100,
        width: box.width,
        height: 22,
        text,
        size: Math.round(size * 100) / 100,
      });
    }
    const caption = wr.clean(`${labels.signature} — ${signer.name}`);
    wr.page.drawText(caption, { x: sigLine.x, y: lineY - 11, size: SIZE.caption, font: wr.fonts.regular, color: MUTED });
    wr.page.drawText(wr.clean(labels.date), { x: dateLine.x, y: lineY - 11, size: SIZE.caption, font: wr.fonts.regular, color: MUTED });
    wr.y = top - GAP.signerBlock;
    wr.fresh = false;
  }
}

function drawFooters(doc, fonts, clean, footer, labels) {
  const pages = doc.getPages();
  const fitted = (text, max) => {
    let t = clean(text);
    while (t && fonts.regular.widthOfTextAtSize(t, SIZE.footer) > max) t = `${t.slice(0, -2)}…`;
    return t;
  };
  pages.forEach((page, i) => {
    const y = MARGIN.bottom - 36;
    page.drawLine({ start: { x: MARGIN.left, y: y + 12 }, end: { x: PAGE.width - MARGIN.right, y: y + 12 }, thickness: 0.4, color: RULE });
    const left = fitted(footer, WIDTH * 0.6);
    if (left) page.drawText(left, { x: MARGIN.left, y, size: SIZE.footer, font: fonts.regular, color: MUTED });
    const right = clean(labels.page(i + 1, pages.length));
    page.drawText(right, { x: PAGE.width - MARGIN.right - fonts.regular.widthOfTextAtSize(right, SIZE.footer), y, size: SIZE.footer, font: fonts.regular, color: MUTED });
  });
}

// renderPdf({ title, sections, signers, footer, anchorFor, labels, subject }) → { buffer, pages, anchors, replaced }.
// sections: compose_rules composeDocument's; a section with `sign` gets the signature blocks after its text.
export async function renderPdf({ title = "Lease agreement", sections = [], signers = [], footer = "", anchorFor = () => "", labels = LABELS.en, subject = "" } = {}) {
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const { clean, replacedCount } = makeCleaner(fonts.regular);
  doc.setTitle(clean(title));
  if (subject) doc.setSubject(clean(subject));
  doc.setCreator("Geiger Property");
  doc.setProducer("Geiger Property");

  const wr = new Writer(doc, fonts, clean);
  const anchors = [];
  for (const section of sections) {
    if (!wr.page || section.newPage) wr.newPage();
    if (section.title) {
      wr.lines([{ text: section.title, bold: true }], { size: SIZE.addendum, lineHeight: LINE.addendum });
      if (section.subtitle) wr.lines([{ text: section.subtitle }], { size: SIZE.sub, lineHeight: LINE.sub, color: MUTED });
      wr.y -= 10;
    }
    drawBlocks(wr, section.blocks || []);
    if (section.sign) drawSignatures(wr, section, signers, labels, anchorFor, anchors);
  }
  if (!wr.page) wr.newPage();
  drawFooters(doc, fonts, clean, footer, labels);

  const bytes = await doc.save({ useObjectStreams: false });
  return { buffer: Buffer.from(bytes), pages: doc.getPageCount(), anchors, replaced: replacedCount() };
}

// --- Reading a rendered PDF back (tests, e2e checks, LEAS-09 anchor checks) ------------------------------------------------

let winAnsi = null;
async function winAnsiDecoder() {
  if (winAnsi) return winAnsi;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const map = new Map();
  for (const cp of font.getCharacterSet()) {
    const hex = font.encodeText(String.fromCodePoint(cp)).asString().replace(/[<>]/g, "");
    if (hex.length === 2 && !map.has(hex.toUpperCase())) map.set(hex.toUpperCase(), String.fromCodePoint(cp));
  }
  winAnsi = map;
  return map;
}

const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

// Text of each page of a PDF this renderer wrote, top to bottom (pieces on one baseline joined) → { pages, text: [string] }.
export async function extractPdfText(bytes) {
  const doc = await PDFDocument.load(bytes);
  const decode = await winAnsiDecoder();
  const text = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
    const rows = new Map();
    for (const s of streams) {
      if (!s) continue;
      const raw = s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents();
      const src = latin1(raw);
      let y = 0;
      for (const m of src.matchAll(/([-\d.]+) ([-\d.]+) Tm|<([0-9A-Fa-f]*)>\s*Tj/g)) {
        if (m[2] !== undefined && m[3] === undefined) {
          y = Math.round(Number(m[2]));
          continue;
        }
        const piece = (m[3].toUpperCase().match(/../g) || []).map((h) => decode.get(h) ?? "").join("");
        const row = rows.get(y);
        rows.set(y, row === undefined ? piece : /\s$/.test(row) || /^\s/.test(piece) ? row + piece : `${row} ${piece}`);
      }
    }
    text.push([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, t]) => t).join("\n"));
  }
  return { pages: doc.getPageCount(), text };
}
