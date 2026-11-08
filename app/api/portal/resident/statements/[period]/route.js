import { requirePortal } from "@/lib/portal/session";
import { residentContext, residentPermissions } from "@/lib/portal/resident";
import { residentStatement } from "@/lib/portal/statements";
import { statementHtml } from "@/lib/billing/statement_html";
import { resultPage } from "@/lib/payments/http";

// GET ?lease= — a resident's printable statement for a month (YYYY-MM), only for their own leases (CORE-12); the same page the office prints.

const notFound = () => resultPage({ title: "Statement not found", message: "This statement isn't available on your account." }, 404);

export async function GET(request, { params }) {
  const ctx = await requirePortal(request, { role: "resident" });
  if (!ctx.ok) return resultPage({ title: "Sign in to see this statement", message: ctx.error }, ctx.status);
  if (!residentPermissions(ctx).statements) return resultPage({ title: "Statements aren't shared here", message: "Contact the office for a statement." }, 403);
  const { period } = await params;
  try {
    const rc = await residentContext(ctx);
    const st = await residentStatement(ctx, rc, { period, leaseId: request.nextUrl.searchParams.get("lease") || "", origin: request.nextUrl.origin });
    if (!st) return notFound();
    return new Response(statementHtml(st), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    if (Number(e?.status) === 404 || Number(e?.status) === 400) return notFound();
    console.error("[portal.statement]", e);
    return resultPage({ title: "Couldn't load this statement", message: "Something went wrong. Try again in a moment." }, 500);
  }
}
