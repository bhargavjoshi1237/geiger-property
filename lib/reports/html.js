import { alignOf, cellText } from "./format";
import { rowsWithTotals } from "./csv";

// Standalone, print-friendly HTML for a computed report (scheduled-report
// archive). Pure string rendering; every value is escaped.

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const STYLE = `
body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:black;margin:32px;font-size:12px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px}
.meta{color:dimgray;margin:0 0 16px}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 8px}
.stat{border:1px solid gainsboro;border-radius:6px;padding:8px 12px;min-width:140px}
.stat b{display:block;font-size:15px}.stat span{color:dimgray}
table{width:100%;border-collapse:collapse;margin:0 0 8px}
th,td{border-bottom:1px solid gainsboro;padding:5px 6px;text-align:left;vertical-align:top}
th{background:whitesmoke;font-weight:600}
tr.total td{font-weight:700;border-top:2px solid black}
.r{text-align:right;font-variant-numeric:tabular-nums}
.muted{color:dimgray}
`;

function sectionHtml(s) {
  const rows = rowsWithTotals(s);
  const head = s.columns.map((c) => `<th class="${alignOf(c) === "right" ? "r" : ""}">${esc(c.header)}</th>`).join("");
  const body = rows.length
    ? rows
        .map((r) => {
          const total = r === s.totals;
          const cls = total ? ' class="total"' : "";
          const cells = s.columns
            .map((c, i) => {
              const text = total && i === 0 ? r.label || r[c.key] || "Totals" : total && (r[c.key] === undefined || r[c.key] === null || r[c.key] === "") ? "" : cellText(c, r);
              return `<td class="${alignOf(c) === "right" ? "r" : ""}">${esc(text)}</td>`;
            })
            .join("");
          return `<tr${cls}>${cells}</tr>`;
        })
        .join("")
    : `<tr><td class="muted" colspan="${s.columns.length}">${esc(s.emptyTitle || "No rows")}</td></tr>`;
  return `<h2>${esc(s.title)}</h2>${s.description ? `<p class="meta">${esc(s.description)}</p>` : ""}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function reportHtml({ title, subtitle, generatedAt, stats = [], sections = [] }) {
  const statHtml = stats.length
    ? `<div class="stats">${stats.map((s) => `<div class="stat"><span>${esc(s.label)}</span><b>${esc(s.value)}</b>${s.footer ? `<span>${esc(s.footer)}</span>` : ""}</div>`).join("")}</div>`
    : "";
  const body = sections.filter((s) => s.columns?.length).map(sectionHtml).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body><h1>${esc(title)}</h1><p class="meta">${esc([subtitle, generatedAt ? `Generated ${generatedAt}` : ""].filter(Boolean).join(" · "))}</p>${statHtml}${body}</body></html>`;
}
