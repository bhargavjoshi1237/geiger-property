import { STYLE, esc, sectionHtml } from "@/lib/reports/html";
import { money } from "@/lib/reports/format";
import { formatIso } from "@/lib/reports/periods";
import { round2 } from "./periods";
import { closingText, statementPeriodLabel, statementSections, statementStats } from "./statement_math";

// Pure resident statement presentation (CORE-12): the print-friendly page (report styles and section tables), a print batch with one
// statement per page, and the resident_statement email fields, all from buildStatement().

const STATEMENT_STYLE = `${STYLE}
.statement{max-width:820px;margin:0 auto}
.head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.facts td:first-child{color:dimgray;width:160px}
.pay{border:1px solid gainsboro;border-radius:6px;padding:10px 12px;margin:16px 0 0}
.page{page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}
.no-print{margin:0 0 16px;padding:6px 14px;border:1px solid gainsboro;border-radius:6px;background:whitesmoke;cursor:pointer}
@media print{.no-print{display:none}body{margin:16px}}
`;

const row = (label, value) => (value ? `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>` : "");
const place = (st) => [st.property?.name, st.unit?.label ? `Unit ${st.unit.label}` : ""].filter(Boolean).join(" · ");

// How to pay: the resident portal, else the office.
function payHtml(st) {
  const office = [st.company?.phone, st.company?.email].filter(Boolean).join(" · ");
  const portal = st.portalUrl ? `Pay online and see every statement in the resident portal: <a href="${esc(st.portalUrl)}">${esc(st.portalUrl)}</a>.` : "Pay online and see every statement in the resident portal.";
  return `<div class="pay"><b>How to pay</b><p class="meta" style="margin:4px 0 0">${portal}${office ? ` Questions? Contact the office: ${esc(office)}.` : ""}</p></div>`;
}

// One statement's body (no document shell); a final statement (CORE-13) passes title, extraHtml (its deposit accounting) and final.
export function statementBody(st) {
  const company = st.company?.name
    ? `<div><b>${esc(st.company.name)}</b>${st.company.address ? `<br><span class="muted">${esc(st.company.address)}</span>` : ""}${st.company.phone ? `<br><span class="muted">${esc(st.company.phone)}</span>` : ""}</div>`
    : "";
  // The summary table carries opening, charges and payments; the tiles repeat only what to pay.
  const stats = statementStats(st)
    .slice(3)
    .map((s) => `<div class="stat"><span>${esc(s.label)}</span><b>${esc(s.value)}</b>${s.footer ? `<span>${esc(s.footer)}</span>` : ""}</div>`)
    .join("");
  const deposits = st.depositsHeld > 0 ? `<p class="muted">Security deposits held: ${esc(money(st.depositsHeld))}. Held separately; not part of your balance.</p>` : "";
  const sections = statementSections(st).map(sectionHtml).join("");
  return `<div class="statement">
<div class="head"><div><h1>${esc(st.title || "Resident statement")}</h1><p class="meta">${esc(statementPeriodLabel(st))} · Issued ${esc(formatIso(st.generatedOn))}</p></div>${company}</div>
<table class="facts"><tbody>${row("Resident", (st.resident?.names || []).join(", ") || st.resident?.name)}${row("Premises", place(st))}${row("Address", st.property?.address)}${row("Lease", st.lease?.name)}${row("Balance", closingText(st))}</tbody></table>
<div class="stats">${stats}</div>
${sections}
${deposits}
${st.extraHtml || ""}
${st.final && !(st.amountDue > 0) ? "" : payHtml(st)}
</div>`;
}

const page = (title, body, printButton) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STATEMENT_STYLE}</style></head><body>${printButton ? `<button class="no-print" onclick="window.print()">Print</button>` : ""}${body}</body></html>`;

// One statement as a standalone HTML page (print button hidden when printing).
export function statementHtml(st, { printButton = true } = {}) {
  return page(`Statement · ${statementPeriodLabel(st)}`, statementBody(st), printButton);
}

// A print batch: every statement on its own page.
export function statementsBatchHtml(list, { title = "Statements", printButton = true } = {}) {
  const body = (list || []).map((st) => `<div class="page">${statementBody(st)}</div>`).join("");
  return page(title, body || `<p class="muted">No statements to print.</p>`, printButton);
}

// Fields for the geiger-dash template property.resident_statement.
export function statementEmailData(st, recipient = {}) {
  return {
    recipientName: String(recipient.name || st.resident?.name || "").split(" ")[0] || "there",
    period: statementPeriodLabel(st),
    periodStart: formatIso(st.from),
    periodEnd: formatIso(st.to),
    opening: money(st.opening),
    charges: money(st.charges),
    payments: money(round2(st.payments + st.credits)),
    closing: money(st.closing),
    amountDue: money(st.amountDue),
    dueDate: st.amountDue > 0 && st.dueDate ? formatIso(st.dueDate) : "",
    credit: st.credit > 0 ? money(st.credit) : "",
    propertyName: st.property?.name || "",
    unitLabel: st.unit?.label || "",
    companyName: st.company?.name || "",
    portalUrl: st.portalUrl || "",
    ctaUrl: st.portalUrl || "",
  };
}
