import { readJson } from "@/lib/messaging/auth";
import { navPermissionKey } from "@/lib/rbac";
import { billingAccess, billingError } from "@/lib/billing/http";
import { PLAN_PERMISSION } from "@/lib/billing/payment_plan_rules";
import { planAgreement, recordSigned, saveAgreement } from "@/lib/billing/payment_plans";

// The payment plan agreement (CORE-14, printed in v1): GET ?projectId returns the merged text; POST { projectId, save, signedOn } saves it to the lease's Documents and/or records the signing date.

export async function GET(request, { params }) {
  const { id } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, [PLAN_PERMISSION, "property.accounting.post", navPermissionKey("Rent Collection")], "Your role can't see payment plans.");
  if (gate.response) return gate.response;
  try {
    const merged = await planAgreement(gate.admin, projectId, id);
    return Response.json({ ok: true, name: merged.name, text: merged.text, unknown: merged.unknown, empty: merged.empty });
  } catch (e) {
    return billingError(e, "Couldn't build the agreement.");
  }
}

export async function POST(request, { params }) {
  const { id } = await params;
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, PLAN_PERMISSION, "Your role can't manage payment plans.");
  if (gate.response) return gate.response;
  try {
    const document = body.save ? await saveAgreement(gate.admin, body.projectId, id, { actor: gate.auth.user }) : null;
    const plan = body.signedOn ? await recordSigned(gate.admin, body.projectId, id, body.signedOn, { actor: gate.auth.user }) : null;
    return Response.json({ ok: true, document, plan });
  } catch (e) {
    return billingError(e, "Couldn't save the agreement.");
  }
}
