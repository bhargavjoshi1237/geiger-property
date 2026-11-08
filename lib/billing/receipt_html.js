import { STYLE, esc } from "@/lib/reports/html";
import { money } from "@/lib/reports/format";
import { formatIso } from "@/lib/reports/periods";
import { round2 } from "./periods";

// Pure receipt presentation (CORE-11): the print-friendly page (report styles) and the rent_receipt email fields, both from receiptData().

const RECEIPT_STYLE = `${STYLE}
.receipt{max-width:720px;margin:0 auto}
.head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.void{display:inline-block;border:2px solid firebrick;color:firebrick;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px}
.facts td:first-child{color:dimgray;width:160px}
.sign{display:flex;gap:32px;margin-top:32px}.sign div{flex:1;border-top:1px solid black;padding-top:4px;color:dimgray}
.no-print{margin:0 0 16px;padding:6px 14px;border:1px solid gainsboro;border-radius:6px;background:whitesmoke;cursor:pointer}
@media print{.no-print{display:none}body{margin:16px}}
`;

const row = (label, value) => (value ? `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>` : "");

// The balance line: what's still owed, or the credit left on account.
export function balanceText(balance) {
  if (balance === null || balance === undefined) return "";
  const b = round2(balance);
  return b < 0 ? `${money(-b)} credit on account` : money(b);
}

// One receipt as a standalone HTML page (print button hidden when printing).
export function receiptHtml(r, { printButton = true } = {}) {
  const title = `Receipt ${r.receiptNo}`;
  const allocations = (r.allocations || [])
    .map((a) => `<tr><td>${esc(a.label)}</td><td>${esc(formatIso(a.date))}</td><td class="r">${esc(money(a.amount))}</td></tr>`)
    .join("");
  const credit = r.unapplied > 0 ? `<tr><td>Credit on account</td><td class="muted">Applied to future charges</td><td class="r">${esc(money(r.unapplied))}</td></tr>` : "";
  const applied = allocations || credit ? `${allocations}${credit}` : `<tr><td class="muted" colspan="3">Nothing applied yet</td></tr>`;
  const place = [r.property?.name, r.unit?.label ? `Unit ${r.unit.label}` : ""].filter(Boolean).join(" · ");
  const company = r.company?.name ? `<div><b>${esc(r.company.name)}</b>${r.company.address ? `<br><span class="muted">${esc(r.company.address)}</span>` : ""}${r.company.phone ? `<br><span class="muted">${esc(r.company.phone)}</span>` : ""}</div>` : "";
  const law = r.requirement?.required && r.requirement.citation ? `<p class="muted">Written receipt issued under ${esc(r.requirement.citation)}.</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${RECEIPT_STYLE}</style></head><body><div class="receipt">
${printButton ? `<button class="no-print" onclick="window.print()">Print</button>` : ""}
<div class="head"><div><h1>Payment receipt${r.status === "void" ? `<span class="void">VOID</span>` : ""}</h1><p class="meta">${esc(r.receiptNo)} · ${esc(formatIso(r.date))}</p></div>${company}</div>
<div class="stats"><div class="stat"><span>Amount paid</span><b>${esc(money(r.amount))}</b></div><div class="stat"><span>Method</span><b>${esc(r.method || "—")}</b>${r.reference ? `<span>Ref ${esc(r.reference)}</span>` : ""}</div><div class="stat"><span>Balance after this payment</span><b>${esc(balanceText(r.balanceAfter) || "—")}</b></div></div>
<h2>Received from</h2><table class="facts"><tbody>${row("Payer", r.payer?.name)}${r.payer?.kind === "housing_authority" ? row("On behalf of", r.payer.tenantName) : ""}${row("Premises", place)}${row("Address", r.property?.address)}${row("Lease", r.lease?.name)}${row("Memo", r.memo)}${row("Received by", r.receivedBy)}</tbody></table>
<h2>Applied to</h2><table><thead><tr><th>Charge</th><th>Charge date</th><th class="r">Amount</th></tr></thead><tbody>${applied}<tr class="total"><td colspan="2">Total</td><td class="r">${esc(money(r.amount))}</td></tr></tbody></table>
${r.online ? "" : `<div class="sign"><div>Signature</div><div>Title</div></div>`}
${law}</div></body></html>`;
}

// Fields for the geiger-dash template property.rent_receipt (same names the online receipt always sent, plus receiptNo).
export function receiptEmailData(r, { appUrl = "" } = {}) {
  const balance = round2(r.balanceAfter ?? r.balanceNow ?? 0);
  return {
    recipientName: String(r.payer?.name || "").split(" ")[0] || "there",
    amount: money(r.amount),
    paidOn: formatIso(r.date),
    method: [r.method, r.reference ? `#${r.reference}` : ""].filter(Boolean).join(" "),
    reference: r.receiptNo,
    receiptNo: r.receiptNo,
    balance: money(Math.max(0, balance)),
    credit: balance < 0 ? money(-balance) : "",
    appliedTo: (r.allocations || []).map((a) => `${a.label}: ${money(a.amount)}`).join("; "),
    propertyName: r.property?.name || "",
    unitLabel: r.unit?.label || "",
    ctaUrl: appUrl,
  };
}
