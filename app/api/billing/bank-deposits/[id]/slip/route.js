import { navPermissionKey } from "@/lib/rbac";
import { billingAccess, billingError } from "@/lib/billing/http";
import { depositSlip } from "@/lib/billing/bank_deposits";
import { depositSlipHtml } from "@/lib/billing/deposit_slip_html";

// GET ?projectId= — a bank deposit's printable slip (CORE-16) as HTML; &format=json wraps it as { html, slip } for the browser helper.

export async function GET(request, { params }) {
  const { id } = await params;
  const q = request.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.post", navPermissionKey("Accounting")], "Your role can't see bank deposits.");
  if (gate.response) return gate.response;
  try {
    const slip = await depositSlip(gate.admin, projectId, id);
    const html = depositSlipHtml(slip);
    if (q.get("format") === "json") return Response.json({ ok: true, html, slip });
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return billingError(e, "Couldn't load the deposit slip.");
  }
}
