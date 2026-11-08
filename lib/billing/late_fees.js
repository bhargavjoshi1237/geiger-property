import "server-only";
import { buildCharge } from "@/lib/ledger/postings";
import { forProject } from "@/lib/supabase/scope";
import { sendNotificationEmail } from "@/lib/email/notifications";
import { periodLabel, periodOf, round2 } from "./periods";
import { billingStartFor, leaseFacts } from "./rent";
import { loadRentLedger, postOnce } from "./post";
import { loadLeaseReceivables } from "./receivables";
import { billedRentByPeriod, lateFeeWarnings, planLateFees } from "./late_fee_rules";

// Server-only late fees (CORE-06): each rent month accrues toward its cumulative policy target, posting only the difference, so a missed run catches up and a re-run posts nothing.

const CHUNK = 150;
const POLICY_KEYS = ["lateFeeType", "lateFeeAmount", "dailyLateFee", "maxLateFee", "graceDays", "rentDueDay", "lateFeeMinBalance", "lateFeesDuringEviction"];

async function loadTenants(admin, projectId, ids) {
  const out = new Map();
  const want = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < want.length; i += CHUNK) {
    const q = admin.from("tenants").select("id, name, email, metadata").in("id", want.slice(i, i + CHUNK)).is("deleted_at", null);
    const { data, error } = await forProject(q, projectId);
    if (error) throw new Error(`tenants: ${error.message}`);
    for (const t of data || []) out.set(t.id, t);
  }
  return out;
}

// What assessLateFees reads for a batch of one project's leases → { acct, receivables, rentLedger, tenants, settings }.
export async function loadLateFeeInputs(admin, ctx, projectId, leases) {
  const acct = await ctx.accounts(projectId);
  const ids = leases.map((l) => l.id);
  const receivables = await loadLeaseReceivables(admin, projectId, ids, acct);
  const carriedFrom = [...receivables.values()].flatMap((r) => r.items.map((i) => i.fromLeaseId)).filter(Boolean);
  const [rentLedger, tenants, settings] = await Promise.all([
    loadRentLedger(admin, projectId, [...ids, ...carriedFrom]),
    loadTenants(admin, projectId, leases.map((l) => leaseFacts(l).tenantId)),
    ctx.settings(projectId),
    ctx.loadProperties(leases.map((l) => leaseFacts(l).propertyId)),
  ]);
  return { acct, receivables, rentLedger, tenants, settings };
}

// The tenant's late notice, sent with a month's first late fee only (respects the late_notice toggle); never throws.
async function sendLateNotice(admin, projectId, lease, tenant, { due, daysLate, fee, balance }) {
  if (!tenant?.email) return { ok: false, skipped: true };
  const money = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  try {
    return await sendNotificationEmail({
      projectId,
      notification: "late_notice",
      to: tenant.email,
      db: admin,
      data: { recipientName: tenant.name || "there", amountDue: money(balance), lateFee: money(fee), dueDate: due, daysLate, unitLabel: lease.unit || "your unit" },
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Assess one lease on business date `today` (dryRun: plan only) → { leaseId, today, stop, policy, periods, entries, notice }.
// opts: inputs (loadLateFeeInputs, for batches), policies, plans (CORE-14: Map leaseId → active plan), notify, auto, actor, catchUpMonths.
export async function assessLateFees(admin, ctx, lease, today, opts = {}) {
  const l = leaseFacts(lease);
  if (!l?.projectId) throw new Error("The lease has no project.");
  const day = today || (await ctx.today(l.projectId));
  const inputs = opts.inputs?.receivables?.has(l.id) ? opts.inputs : await loadLateFeeInputs(admin, ctx, l.projectId, [lease]);
  const policies = opts.policies || (await ctx.policies(lease));
  const receivable = inputs.receivables.get(l.id);
  const tenant = inputs.tenants.get(l.tenantId) || null;
  const plan = planLateFees({
    leaseId: l.id,
    lease,
    policies,
    tenant,
    plan: opts.plans?.get(l.id) || null,
    receivable,
    billed: billedRentByPeriod(inputs.rentLedger, l.id, receivable.items),
    today: day,
    startsOn: billingStartFor(lease, inputs.settings),
    catchUpMonths: opts.catchUpMonths,
  });
  const out = { leaseId: l.id, today: day, stop: plan.stop, policy: Object.fromEntries(POLICY_KEYS.map((k) => [k, policies[k]])), periods: plan.periods, entries: [], notice: null };
  const due = plan.periods.filter((p) => p.delta > 0);
  if (opts.dryRun || !due.length) return out;
  // Period close (CORE-40) can refuse a posting dated today.
  if (!(await ctx.isPeriodOpen(l.projectId, periodOf(day)))) return { ...out, skipped: "closed" };

  const dims = { leaseId: l.id, tenantId: l.tenantId || undefined, unitId: l.unitId || undefined, propertyId: l.propertyId || undefined };
  let first = null;
  for (const p of due) {
    const metadata = { lateFee: { period: p.period, daysLate: p.daysLate, base: p.base, target: p.target, postedBefore: p.posted }, ...(opts.auto ? { auto: true } : {}) };
    const memo = `Late fee · ${periodLabel(p.period)} rent${p.posted > 0 ? ` (day ${p.daysLate})` : ""}`;
    const res = await postOnce(admin, l.projectId, p.key, (a) => buildCharge({ ...dims, sourceType: "late_fee", date: day, amount: p.delta, memo, sourceId: l.id, metadata }, a), {
      acct: inputs.acct,
      createdBy: opts.actor?.id || null,
    });
    out.entries.push({ entryId: res.entryId, key: p.key, amount: p.delta, kind: "late_fee", period: p.period, created: res.created });
    if (res.created && p.first && !first) first = p;
  }
  if (first && opts.notify) {
    const posted = round2(out.entries.filter((e) => e.created).reduce((s, e) => s + e.amount, 0));
    out.notice = await sendLateNotice(admin, l.projectId, lease, tenant, { due: first.due, daysLate: first.daysLate, fee: first.delta, balance: round2(receivable.balance + posted) });
  }
  return out;
}

// Late-fee sources for the lease's state from Legal Resources, plus policy warnings (warn only) → { state, sources, warnings }.
export async function lateFeeGuidance(admin, projectId, lease, policy) {
  const l = leaseFacts(lease);
  let state = null;
  let sources = [];
  const shared = (q) => q.or(`project_id.is.null,project_id.eq.${projectId}`).is("deleted_at", null);
  const { data: property } = l.propertyId ? await forProject(admin.from("properties").select("state").eq("id", l.propertyId), projectId).maybeSingle() : { data: null };
  const raw = String(property?.state || "").trim();
  if (raw) {
    const { data: places } = await shared(admin.from("legal_jurisdictions").select("code, name").eq("kind", "state"));
    const v = raw.toLowerCase().replace(/\.$/, "");
    state = (places || []).find((j) => j.code.toLowerCase() === v || j.name.toLowerCase() === v) || null;
  }
  if (state) {
    const { data } = await shared(admin.from("legal_resources").select("title, url, citation, category, scope, locality").eq("jurisdiction_code", state.code).contains("topics", ["late_fees"]));
    const rank = (r) => (r.category === "statute" ? 0 : r.scope === "state" ? 1 : 2);
    sources = (data || []).sort((a, b) => rank(a) - rank(b)).slice(0, 4);
  }
  return { state, sources, warnings: lateFeeWarnings(policy, { stateName: state?.name || "", sources: sources.length }) };
}
