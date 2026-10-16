import { portalError, portalJson, readBody } from "@/lib/portal/http";
import { submitInvoice, vendorInvoices, vendorPermissions } from "@/lib/portal/vendor";
import { withPortal } from "@/lib/portal/session";

// GET — invoices the vendor has submitted (bills) with approval + payment status.
export const GET = withPortal(
  async (ctx) => portalJson({ invoices: await vendorInvoices(ctx), permissions: vendorPermissions(ctx) }),
  { role: "vendor" },
);

// POST — submit an invoice; it lands in Bills pending approval.
export const POST = withPortal(
  async (ctx, request) => {
    const res = await submitInvoice(ctx, await readBody(request));
    if (!res.ok) return portalError(400, res.error);
    return portalJson({ invoice: res.invoice });
  },
  { role: "vendor" },
);
