import { billingAccess, billingError } from "@/lib/billing/http";
import { receiptData } from "@/lib/billing/receipts";
import { receiptHtml } from "@/lib/billing/receipt_html";

// GET ?projectId= — a payment's printable receipt (CORE-11) as HTML; &format=json wraps it as { html, receipt } for the browser helper.

export async function GET(request, { params }) {
  const { entryId } = await params;
  const q = request.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.post", "property.accounting.view"], "Your role can't see receipts.");
  if (gate.response) return gate.response;
  try {
    const receipt = await receiptData(gate.admin, entryId, { projectId });
    const html = receiptHtml(receipt);
    if (q.get("format") === "json") return Response.json({ ok: true, html, receipt });
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return billingError(e, "Couldn't load the receipt.");
  }
}
