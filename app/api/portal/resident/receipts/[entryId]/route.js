import { requirePortal } from "@/lib/portal/session";
import { residentContext } from "@/lib/portal/resident";
import { receiptData } from "@/lib/billing/receipts";
import { receiptHtml } from "@/lib/billing/receipt_html";
import { resultPage } from "@/lib/payments/http";

// GET — a resident's printable payment receipt (CORE-11), only for their own payments (their tenant record or one of their leases); never the housing authority's.

const notFound = () => resultPage({ title: "Receipt not found", message: "This receipt isn't available on your account." }, 404);

export async function GET(request, { params }) {
  const ctx = await requirePortal(request, { role: "resident" });
  if (!ctx.ok) return resultPage({ title: "Sign in to see this receipt", message: ctx.error }, ctx.status);
  const { entryId } = await params;
  try {
    const rc = await residentContext(ctx);
    const receipt = await receiptData(ctx.admin, entryId, { projectId: ctx.projectId });
    const leaseIds = new Set(rc.leases.map((l) => l.id));
    const mine = receipt.payer.kind !== "housing_authority" && (receipt.payer.tenantId === ctx.party.id || (receipt.lease?.id && leaseIds.has(receipt.lease.id)));
    if (!mine) return notFound();
    return new Response(receiptHtml(receipt), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    if (Number(e?.status) === 404 || Number(e?.status) === 400) return notFound();
    console.error("[portal.receipt]", e);
    return resultPage({ title: "Couldn't load this receipt", message: "Something went wrong. Try again in a moment." }, 500);
  }
}
