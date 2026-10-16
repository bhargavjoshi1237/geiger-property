import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { cancelPaymentLink } from "@/lib/payments/checkout";

// POST — signed-in staff cancel an unpaid payment link / pending checkout.
// Body: { projectId, paymentId } → { ok }

export async function POST(request) {
  const input = await readJson(request);
  if (!input.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, input.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const result = await cancelPaymentLink({ projectId: auth.projectId, paymentId: input.paymentId });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
