import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { cancelPaymentLink } from "@/lib/payments/checkout";

// POST — signed-in staff cancel an unpaid payment link / pending checkout.
// Body: { projectId, paymentId } → { ok }

export async function POST(request) {
  const input = await readJson(request);
  const auth = await requireStaff(request, input.projectId, { permission: "property.payment.collect", denied: "Your role can't cancel payment links." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const result = await cancelPaymentLink({ projectId: auth.projectId, paymentId: input.paymentId });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
