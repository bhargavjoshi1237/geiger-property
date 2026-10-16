import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { refundPayment } from "@/lib/payments/refunds";

// POST — signed-in staff refund a settled online payment (full when amount is omitted).
// Body: { projectId, paymentId, amount?, reason? } → { ok, refundId, amount, status }

export const maxDuration = 60;

export async function POST(request) {
  const input = await readJson(request);
  if (!input.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, input.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const result = await refundPayment({
    projectId: auth.projectId,
    paymentId: input.paymentId,
    amount: input.amount,
    reason: input.reason || "",
    actorName: auth.user.name,
  });
  return Response.json(result, { status: result.ok ? 200 : result.code === "stripe_not_configured" ? 503 : 400 });
}
