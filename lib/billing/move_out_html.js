import { STYLE, esc, sectionHtml } from "@/lib/reports/html";
import { money } from "@/lib/reports/format";
import { formatIso } from "@/lib/reports/periods";
import { round2 } from "./periods";

// Final account documents (CORE-13), pure: the statement of deposit accounting (the disposition letter), the deposit section of the
// final statement, and the move_out_statement email fields — all from one letter model, so every surface lists the same figures.

const LETTER_STYLE = `${STYLE}
.letter{max-width:760px;margin:0 auto;font-size:13px;line-height:1.45}
.head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.to{margin:18px 0}
.result{border:1px solid gainsboro;border-radius:6px;padding:10px 12px;margin:16px 0}
.result b{font-size:16px}
.wording{white-space:pre-wrap;border-left:3px solid gainsboro;padding:4px 10px;margin:12px 0}
.no-print{margin:0 0 16px;padding:6px 14px;border:1px solid gainsboro;border-radius:6px;background:whitesmoke;cursor:pointer}
@media print{.no-print{display:none}body{margin:16px}}
`;

const sum = (rows) => round2((rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0));
const moneyCols = (label) => [
  { key: "label", header: label },
  { key: "amount", header: "Amount", format: "money" },
];

// What the resident gets back or owes, in words.
export function resultText(m) {
  if (m.refund > 0) return `Refund due to you: ${money(m.refund)}`;
  if (m.balanceOwed > 0) return `Balance you owe: ${money(m.balanceOwed)}`;
  return "Nothing is owed either way.";
}

// The letter's itemization as report sections (deposits, what the deposit paid, credits, move-out charges).
export function letterSections(m) {
  const deposits = (m.deposits || []).flatMap((d) => [
    { id: `${d.id}-held`, label: d.kind || "Security deposit", amount: d.held },
    ...(d.interest > 0 ? [{ id: `${d.id}-int`, label: `Interest on the ${String(d.kind || "deposit").toLowerCase()}`, amount: d.interest }] : []),
  ]);
  const sections = [
    { key: "deposits", title: "Deposits held", columns: moneyCols("Deposit"), rows: deposits, totals: { label: "Total available", amount: m.available }, emptyTitle: "No deposit was held." },
  ];
  if (m.creditsApplied?.length) {
    sections.push({ key: "credits", title: "Credits applied to your balance", description: "Prepayments and overpayments used first, before the deposit.", columns: moneyCols("Credit"), rows: m.creditsApplied, totals: { label: "Credits applied", amount: sum(m.creditsApplied) } });
  }
  sections.push({
    key: "charges",
    title: "Move-out charges",
    description: "Itemized deductions and charges added at move-out.",
    columns: [
      { key: "label", header: "Charge" },
      { key: "detail", header: "Details" },
      { key: "amount", header: "Amount", format: "money" },
    ],
    rows: (m.charges || []).map((c, i) => ({ id: c.id || `c${i}`, label: c.label, detail: [c.category, c.invoiceNumber ? `Invoice ${c.invoiceNumber}` : "", c.notes].filter(Boolean).join(" · "), amount: c.amount })),
    totals: { label: "Move-out charges", amount: sum(m.charges) },
    emptyTitle: "No move-out charges.",
  });
  sections.push({
    key: "applied",
    title: "What the deposit paid",
    description: "Open charges at move-out, oldest first, then the move-out charges.",
    columns: moneyCols("Charge"),
    rows: m.appliedTo || [],
    totals: { label: "Deposit applied", amount: m.applied },
    emptyTitle: "Nothing was owed, so none of the deposit was used.",
  });
  return sections;
}

// One statement of deposit accounting (no document shell).
export function letterBody(m) {
  const company = m.company?.name
    ? `<div><b>${esc(m.company.name)}</b>${m.company.address ? `<br><span class="muted">${esc(m.company.address)}</span>` : ""}${m.company.phone ? `<br><span class="muted">${esc(m.company.phone)}</span>` : ""}</div>`
    : "";
  const to = [esc((m.residents || []).join(", ") || "Resident"), m.forwarding?.address ? esc(m.forwarding.address).replace(/\n/g, "<br>") : `<span class="muted">No forwarding address on file</span>`].join("<br>");
  const refund =
    m.refund > 0
      ? `<p>${esc(money(m.refund))}${m.creditRefund > 0 ? ` (including your ${esc(money(m.creditRefund))} credit balance)` : ""} will be paid${m.refundMethod ? ` by ${esc(String(m.refundMethod).toLowerCase())}` : ""}${(m.payableTo || []).length ? `, payable to ${esc(m.payableTo.join(" & "))}` : ""}${m.returnDue ? `, by ${esc(formatIso(m.returnDue))}` : ""}.</p>`
      : m.balanceOwed > 0
        ? `<p>Please pay ${esc(money(m.balanceOwed))} or contact us to arrange a payment plan.</p>`
        : "";
  const wording = m.wording ? `<div class="wording">${esc(m.wording)}</div>` : "";
  const rule = m.rule?.citation || m.rule?.sourceUrl ? `<p class="muted">Basis: ${esc([m.rule.citation, m.rule.sourceUrl].filter(Boolean).join(" · "))}</p>` : "";
  return `<div class="letter">
<div class="head"><div><h1>${esc(m.title || "Statement of security deposit accounting")}</h1><p class="meta">${esc(formatIso(m.issuedOn))}${m.version > 1 ? ` · Revised (version ${m.version}) — replaces the earlier statement` : ""}</p></div>${company}</div>
<div class="to">${to}</div>
<p><b>Re:</b> ${esc([m.premises, m.propertyAddress].filter(Boolean).join(" · ") || "Your tenancy")} · moved out ${esc(formatIso(m.moveOut))}</p>
<p>This statement accounts for your security deposit after your tenancy ended. It lists what we held, the charges at move-out and what the deposit paid.</p>
${letterSections(m).map(sectionHtml).join("")}
<div class="result"><b>${esc(resultText(m))}</b>${refund}</div>
${wording}
${rule}
<p class="muted">Your final statement, with every charge and payment from move-in to move-out, is enclosed. If you have questions about any charge, contact us${m.company?.email ? ` at ${esc(m.company.email)}` : ""}${m.company?.phone ? ` or ${esc(m.company.phone)}` : ""}.</p>
</div>`;
}

const page = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${LETTER_STYLE}</style></head><body><button class="no-print" onclick="window.print()">Print</button>${body}</body></html>`;

// The disposition letter as a standalone page.
export const letterHtml = (m) => page(`Deposit accounting · ${m.premises || "Final account"}`, letterBody(m));

// The final statement's deposit section (appended to the CORE-12 statement body).
export function depositSectionHtml(m) {
  const rows = [
    { id: "available", label: "Deposits and interest held", amount: m.available },
    { id: "applied", label: "Applied to your balance", amount: -m.applied },
    ...(m.creditRefund > 0 ? [{ id: "credit", label: "Credit balance refunded", amount: m.creditRefund }] : []),
  ];
  const section = { key: "deposit", title: "Security deposit accounting", description: resultText(m), columns: moneyCols("Line"), rows, totals: { label: m.refund > 0 ? "Refund due to you" : "Refund", amount: m.refund } };
  return sectionHtml(section);
}

// Fields for the geiger-dash template property.move_out_statement.
export function finalAccountEmailData(m, recipient = {}) {
  return {
    recipientName: String(recipient.name || m.residents?.[0] || "").split(" ")[0] || "there",
    premises: m.premises || "",
    moveOutDate: formatIso(m.moveOut),
    depositHeld: money(m.available),
    charges: money(sum(m.charges)),
    applied: money(m.applied),
    refund: m.refund > 0 ? money(m.refund) : "",
    balanceOwed: m.balanceOwed > 0 ? money(m.balanceOwed) : "",
    refundMethod: m.refund > 0 ? m.refundMethod || "" : "",
    result: resultText(m),
    items: (m.charges || []).map((c) => ({ label: c.label, amount: money(c.amount) })),
    revised: m.version > 1,
    companyName: m.company?.name || "",
    companyEmail: m.company?.email || "",
    companyPhone: m.company?.phone || "",
  };
}
