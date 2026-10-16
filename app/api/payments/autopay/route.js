import { jsonError, readJson, requireStaff } from "@/lib/messaging/auth";
import { cancelAutopay, createAutopayLink, enrollAutopay, getAutopayStatus } from "@/lib/payments/autopay";
import { requestBase, sameOriginUrl } from "@/lib/payments/http";

// POST — signed-in staff manage a lease's autopay.
// Body: { projectId, leaseId, tenantId?, action: "status" | "link" | "enroll" | "cancel",
//         payerEmail?, amountMode?, fixedAmount?, maxAmount?, chargeDay?, sendEmail?, returnUrl? }
// link → emailable enrollment link; enroll → setup Checkout now (returnUrl required).

export const maxDuration = 60;

export async function POST(request) {
  const input = await readJson(request);
  if (!input.projectId) return jsonError(400, "projectId is required.");
  const auth = await requireStaff(request, input.projectId);
  if (!auth.ok) return jsonError(auth.status, auth.error);
  const args = {
    projectId: auth.projectId,
    leaseId: input.leaseId,
    tenantId: input.tenantId || undefined,
    payerEmail: input.payerEmail || undefined,
    amountMode: input.amountMode,
    fixedAmount: input.fixedAmount,
    maxAmount: input.maxAmount,
    chargeDay: input.chargeDay,
    createdBy: auth.user.id,
  };

  let result;
  switch (input.action) {
    case "status":
      result = await getAutopayStatus(args);
      break;
    case "cancel":
      result = await cancelAutopay({ projectId: auth.projectId, leaseId: input.leaseId, planId: input.planId, actorName: auth.user.name });
      break;
    case "enroll": {
      const back = sameOriginUrl(request, input.returnUrl);
      if (!back) return jsonError(400, "returnUrl must point back to this app.");
      result = await enrollAutopay({ ...args, returnUrl: back });
      break;
    }
    case "link":
      result = await createAutopayLink({ ...args, baseUrl: requestBase(request), sendEmail: Boolean(input.sendEmail) });
      break;
    default:
      return jsonError(400, "Unknown autopay action.");
  }
  return Response.json(result, { status: result.ok ? 200 : result.code === "stripe_not_configured" ? 503 : 400 });
}
