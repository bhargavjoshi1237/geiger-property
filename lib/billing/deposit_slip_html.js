import { STYLE, esc } from "@/lib/reports/html";
import { money } from "@/lib/reports/format";
import { formatIso } from "@/lib/reports/periods";

// Pure deposit slip page (CORE-16) from depositSlip(): bank, date, slip number, each check or cash item and the totals; report styles, print-friendly.

const SLIP_STYLE = `${STYLE}
.slip{max-width:820px;margin:0 auto}
.head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.void{display:inline-block;border:2px solid firebrick;color:firebrick;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px}
.facts td:first-child{color:dimgray;width:160px}
.sign{display:flex;gap:32px;margin-top:32px}.sign div{flex:1;border-top:1px solid black;padding-top:4px;color:dimgray}
.no-print{margin:0 0 16px;padding:6px 14px;border:1px solid gainsboro;border-radius:6px;background:whitesmoke;cursor:pointer}
@media print{.no-print{display:none}body{margin:16px}}
`;

const row = (label, value) => (value ? `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>` : "");
const maskLast4 = (v) => (v ? `•••• ${String(v).slice(-4)}` : "");

// One deposit slip as a standalone HTML page (print button hidden when printing).
export function depositSlipHtml(s, { printButton = true } = {}) {
  const title = `Deposit slip · ${s.label}`;
  const items = (s.items || [])
    .map(
      (i, n) =>
        `<tr><td>${n + 1}</td><td>${esc(formatIso(i.date))}</td><td>${esc(i.payerName || "—")}</td><td>${esc([i.propertyName, i.unitLabel ? `Unit ${i.unitLabel}` : ""].filter(Boolean).join(" · "))}</td><td>${esc(i.method || "")}</td><td>${esc(i.reference || "")}</td><td>${esc(i.receiptNo || "")}</td><td class="r">${esc(money(i.amount))}</td></tr>`,
    )
    .join("");
  const body = items || `<tr><td class="muted" colspan="8">No items</td></tr>`;
  const company = s.company?.name ? `<div><b>${esc(s.company.name)}</b>${s.company.address ? `<br><span class="muted">${esc(s.company.address)}</span>` : ""}${s.company.phone ? `<br><span class="muted">${esc(s.company.phone)}</span>` : ""}</div>` : "";
  const bank = [s.bank?.name, s.bank?.bankName, maskLast4(s.bank?.last4)].filter(Boolean).join(" · ");
  const voided = s.status === "Void" ? `<p class="muted">Voided${s.voidedAt ? ` ${esc(formatIso(String(s.voidedAt).slice(0, 10)))}` : ""}${s.voidedBy ? ` by ${esc(s.voidedBy)}` : ""}${s.voidReason ? ` · ${esc(s.voidReason)}` : ""}. Its payments went back to Undeposited Funds.</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${SLIP_STYLE}</style></head><body><div class="slip">
${printButton ? `<button class="no-print" onclick="window.print()">Print</button>` : ""}
<div class="head"><div><h1>Deposit slip${s.status === "Void" ? `<span class="void">VOID</span>` : ""}</h1><p class="meta">${esc(s.label)} · ${esc(formatIso(s.date))}</p></div>${company}</div>
<div class="stats"><div class="stat"><span>Deposit total</span><b>${esc(money(s.totals?.total ?? s.total))}</b></div><div class="stat"><span>Checks &amp; money orders</span><b>${esc(money(s.totals?.checks || 0))}</b></div><div class="stat"><span>Cash</span><b>${esc(money(s.totals?.cash || 0))}</b></div><div class="stat"><span>Items</span><b>${esc(String(s.totals?.count ?? s.itemCount ?? 0))}</b></div></div>
<h2>Deposit to</h2><table class="facts"><tbody>${row("Account", bank)}${row("Account type", s.bank?.accountType)}${row("Slip number", s.slipNumber)}${row("Memo", s.memo)}${row("Prepared by", s.postedBy)}</tbody></table>
<h2>Items</h2><table><thead><tr><th>#</th><th>Received</th><th>From</th><th>Premises</th><th>Method</th><th>Check / ref #</th><th>Receipt</th><th class="r">Amount</th></tr></thead><tbody>${body}<tr class="total"><td colspan="7">Total</td><td class="r">${esc(money(s.totals?.total ?? s.total))}</td></tr></tbody></table>
${voided}<div class="sign"><div>Deposited by</div><div>Date</div></div></div></body></html>`;
}
