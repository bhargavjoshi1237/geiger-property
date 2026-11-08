import { readJson } from "@/lib/messaging/auth";
import { navPermissionKey } from "@/lib/rbac";
import { staffCan } from "@/lib/auth/permissions";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { makeBillingContext } from "@/lib/billing/context";
import { fail } from "@/lib/billing/post";
import { loadLease } from "@/lib/billing/service";
import { recordManualPayment } from "@/lib/billing/payments";
import { OVERRIDE_PERMISSION } from "@/lib/billing/payment_rules";
import { PLAN_PERMISSION } from "@/lib/billing/payment_plan_rules";
import { activatePlan, createPlan, loadPlan, planOverview } from "@/lib/billing/payment_plans";

// Payment plans (CORE-14). GET ?projectId&leaseId: the lease's plans with standing, balances, open charges and down payment candidates.
// POST { projectId, leaseId, plan } creates a draft; with { activate: true } (and planId for an existing draft) it activates, taking downPayment { entryId } or { record: office payment } and signedOn.

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const projectId = sp.get("projectId");
  const gate = await billingAccess(request, projectId, [PLAN_PERMISSION, "property.accounting.post", navPermissionKey("Rent Collection")], "Your role can't see payment plans.");
  if (gate.response) return gate.response;
  try {
    if (!sp.get("leaseId")) throw fail("leaseId is required.");
    const lease = await loadLease(gate.admin, sp.get("leaseId"), projectId);
    const overview = await planOverview(gate.admin, makeBillingContext(gate.admin), lease);
    return Response.json({ ok: true, ...overview, canManage: gate.can(PLAN_PERMISSION) });
  } catch (e) {
    return billingError(e, "Couldn't load the payment plans.");
  }
}

// The down payment: a payment already on the lease ({ entryId }), or one recorded now through the office-payment path (CORE-11), which also needs accounting.post.
async function downPaymentFor(gate, ctx, plan, body) {
  const dp = body.downPayment || {};
  if (!(plan.downPayment > 0) || plan.status !== "Draft") return null;
  if (dp.entryId) return { entryId: dp.entryId, created: false };
  if (!dp.record) return null;
  if (!(await staffCan(gate.auth, "property.accounting.post"))) throw fail("Your role can't record payments — record the down payment from the lease ledger first.", 403);
  const canOverride = dp.record.override?.reason ? await staffCan(gate.auth, OVERRIDE_PERMISSION) : false;
  const res = await recordManualPayment(
    gate.admin,
    { ...dp.record, projectId: body.projectId, leaseId: plan.leaseId, amount: plan.downPayment, memo: dp.record.memo || `Down payment · ${plan.name}` },
    gate.auth.user,
    { canOverride, ctx },
  );
  return { entryId: res.entryId, created: res.created, receiptNo: res.receiptNo, receipt: res.receipt || null, warnings: res.warnings || [] };
}

export async function POST(request) {
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, PLAN_PERMISSION, "Your role can't set up payment plans.");
  if (gate.response) return gate.response;
  const ctx = makeBillingContext(gate.admin);
  const actor = gate.auth.user;
  let plan = null;
  let downPayment = null;
  try {
    if (body.planId) plan = await loadPlan(gate.admin, body.projectId, body.planId);
    else plan = await createPlan(gate.admin, ctx, await loadLease(gate.admin, body.leaseId, body.projectId), body.plan || {}, { actor });
    if (!body.activate) return Response.json({ ok: true, plan, entries: [] });
    downPayment = await downPaymentFor(gate, ctx, plan, body);
    const res = await activatePlan(gate.admin, ctx, plan.id, { projectId: body.projectId, downPaymentEntryId: downPayment?.entryId, signedOn: body.signedOn, actor });
    return Response.json({ ok: true, plan: res.plan, entries: entryView(res.entries), downPayment, replay: Boolean(res.replay) });
  } catch (e) {
    // A draft saved before activation failed comes back with the reason (a refused down payment with its restrictions).
    const status = Number(e?.status) || 400;
    return Response.json({ ok: false, error: e?.message || "Couldn't set up the payment plan.", plan, downPayment, ...(e?.restrictions ? { restrictions: e.restrictions } : {}) }, { status });
  }
}
