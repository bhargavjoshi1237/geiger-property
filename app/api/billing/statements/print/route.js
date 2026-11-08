import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { billingError } from "@/lib/billing/http";
import { MAX_LEASES, buildStatements } from "@/lib/billing/statements";
import { statementsBatchHtml } from "@/lib/billing/statement_html";

// POST — a print batch of resident statements (CORE-12), one per page: body { projectId, leaseIds, period? } → { html, count }. Nothing is sent or posted.

export async function POST(request) {
  const body = await readJson(request);
  const auth = await requireStaff(request, body.projectId, { permission: ["property.report.export", "property.accounting.view"], denied: "Your role can't print resident statements." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so statements can't load.");
  try {
    const leaseIds = Array.isArray(body.leaseIds) ? [...new Set(body.leaseIds.map(String))] : [];
    if (!leaseIds.length) return jsonError(400, "Pick the leases to print.");
    if (leaseIds.length > MAX_LEASES) return jsonError(400, `Print at most ${MAX_LEASES} statements at a time.`);
    const { statements } = await buildStatements(auth.admin, body.projectId, leaseIds, { period: body.period || "", origin: request.nextUrl.origin });
    const list = leaseIds.map((id) => statements.get(id)).filter(Boolean);
    return Response.json({ ok: true, count: list.length, html: statementsBatchHtml(list, { title: "Resident statements" }) });
  } catch (e) {
    return billingError(e, "Couldn't build the statements.");
  }
}
