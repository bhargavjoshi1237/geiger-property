import { readJson } from "@/lib/messaging/auth";
import { navPermissionKey } from "@/lib/rbac";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { makeBillingContext } from "@/lib/billing/context";
import { loadLease } from "@/lib/billing/service";
import { assessLateFees, lateFeeGuidance } from "@/lib/billing/late_fees";

// Late fees for one lease (CORE-06): GET previews each overdue month (posted vs target, why fees stop); POST assesses and posts what's due, as the daily job does. Query / body { projectId }.

const view = (res) => ({ today: res.today, stop: res.stop, policy: res.policy, periods: res.periods });

export async function GET(request, { params }) {
  const { leaseId } = await params;
  const projectId = request.nextUrl.searchParams.get("projectId");
  const gate = await billingAccess(request, projectId, [navPermissionKey("Rent Collection"), "property.accounting.post"], "Your role can't see late fees.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const ctx = makeBillingContext(gate.admin);
    const res = await assessLateFees(gate.admin, ctx, lease, await ctx.today(projectId), { dryRun: true });
    return Response.json({ ok: true, ...view(res), guidance: await lateFeeGuidance(gate.admin, projectId, lease, res.policy) });
  } catch (e) {
    return billingError(e, "Couldn't load the late fees.");
  }
}

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const { projectId } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Your role can't post late fees.");
  if (gate.response) return gate.response;
  try {
    const lease = await loadLease(gate.admin, leaseId, projectId);
    const ctx = makeBillingContext(gate.admin);
    const res = await assessLateFees(gate.admin, ctx, lease, await ctx.today(projectId), { notify: true, actor: gate.auth.user });
    return Response.json({ ok: true, ...view(res), entries: entryView(res.entries), noticeSent: Boolean(res.notice?.ok), skipped: res.skipped || null });
  } catch (e) {
    return billingError(e, "Couldn't post the late fee.");
  }
}
