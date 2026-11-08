import { jsonError, requireStaff } from "@/lib/auth/staff";
import { billingError } from "@/lib/billing/http";
import { buildStatement } from "@/lib/billing/statements";
import { statementHtml } from "@/lib/billing/statement_html";

// GET ?projectId=&period=YYYY-MM — one lease's resident statement (CORE-12) as a printable page (default: last month); &format=json
// wraps it as { html, statement } for the preview dialog. Ledger figures need accounting access, plus printing or sending statements.

export async function GET(request, { params }) {
  const { leaseId } = await params;
  const q = request.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const auth = await requireStaff(request, projectId, { permission: "property.accounting.view", anyOf: ["property.report.export", "property.rent.manage"], denied: "Your role can't see resident statements." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so statements can't load.");
  try {
    const statement = await buildStatement(auth.admin, leaseId, { projectId, period: q.get("period") || "", origin: request.nextUrl.origin });
    const html = statementHtml(statement);
    if (q.get("format") === "json") return Response.json({ ok: true, html, statement });
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return billingError(e, "Couldn't build the statement.");
  }
}
