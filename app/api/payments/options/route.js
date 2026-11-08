import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { getPaymentOptions } from "@/lib/payments/checkout";
import { getAutopayStatus } from "@/lib/payments/autopay";

// POST — signed-in staff: open balance, accepted online methods, convenience
// fees, the policy verdict and autopay status for a lease.
// Body: { projectId, leaseId, tenantId?, amount? }

export async function POST(request) {
  const input = await readJson(request);
  const auth = await requireStaff(request, input.projectId, { permission: "property.payment.collect", denied: "Your role can't collect payments." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const args = { projectId: auth.projectId, leaseId: input.leaseId, tenantId: input.tenantId || undefined };
  const options = await getPaymentOptions({ ...args, amount: input.amount ?? undefined });
  if (!options.ok) return Response.json(options, { status: 400 });
  const autopay = await getAutopayStatus(args);
  return Response.json({ ...options, autopay: autopay.ok ? autopay : null });
}
