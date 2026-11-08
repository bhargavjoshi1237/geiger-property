import "server-only";
import { buildPlanDeferral, buildPlanRebill } from "@/lib/ledger/postings";
import { logActivity } from "@/lib/messaging/threads";
import { forProject } from "@/lib/supabase/scope";
import { effectivePolicies } from "@/lib/policies";
import { projectError } from "@/lib/jobs/contract";
import { DEFAULT_PAYMENT_PLAN_BODY, buildMergeValues, buildPlanMergeValues, mergeTemplate } from "@/lib/leasing/merge";
import { addDays, isoDate, periodOf, round2 } from "./periods";
import { leaseFacts } from "./rent";
import { fail, findPosted, openOnEntries, postOnce } from "./post";
import { loadLeaseReceivables } from "./receivables";
import {
  DEFAULT_GRACE_DAYS,
  OPEN_PLAN_STATUSES,
  PLAN_FREQUENCIES,
  buildSchedule,
  defaultsAfter,
  deferAllocations,
  financedOf,
  frequencyNoun,
  installmentMemo,
  openTotalOf,
  pastDueOf,
  planAccelerateKey,
  planDeferKey,
  planInstallmentKey,
  planStanding,
  shouldDefault,
  validatePlan,
} from "./payment_plan_rules";

// Server-only payment plans (CORE-14): a draft with its schedule, activation (open AR → 1210 Deferred Receivable), installments re-billed to AR as they fall due, standing, default and cancel (the remainder back to AR) and the printed agreement; postings are keyed plan:<id>:*.

const CHUNK = 150;
const PLANS = "lease_payment_plans";
const INSTALLMENTS = "lease_payment_plan_installments";
// The public suite bucket the lease agreement uses (lib/supabase/property_storage.js).
const DOCUMENT_BUCKET = "products";

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const usd = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const metaOf = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});

export function normalizeInstallment(row) {
  const meta = metaOf(row);
  return {
    id: row.id,
    planId: row.plan_id,
    seq: Number(row.seq),
    dueDate: row.due_date,
    amount: round2(row.amount),
    status: row.status || "Scheduled",
    chargeEntryId: row.charge_entry_id || "",
    accelerated: meta.accelerated === true,
    metadata: meta,
  };
}

export function normalizePlan(row, installments = []) {
  return {
    id: row.id,
    projectId: row.project_id,
    leaseId: row.lease_id,
    tenantId: row.tenant_id || "",
    propertyId: row.property_id || "",
    unitId: row.unit_id || "",
    name: row.name || "Payment plan",
    totalAmount: round2(row.total_amount),
    downPayment: round2(row.down_payment),
    installmentCount: Number(row.installment_count) || installments.length,
    frequency: row.frequency || "Monthly",
    firstDue: row.first_due,
    status: row.status || "Draft",
    graceDays: Number(row.grace_days ?? DEFAULT_GRACE_DAYS),
    suspendLateFees: row.suspend_late_fees !== false,
    deferEntryId: row.defer_entry_id || "",
    agreementDocumentId: row.agreement_document_id || "",
    signedOn: row.signed_on || "",
    createdAt: row.created_at,
    metadata: metaOf(row),
    installments: installments.sort((a, b) => a.seq - b.seq),
  };
}

// Plans of one project (planIds / leaseIds / statuses narrow it; an empty id list matches nothing) with their installments, oldest first.
export async function loadPlans(admin, projectId, { planIds, leaseIds, statuses } = {}) {
  if ((planIds && !planIds.length) || (leaseIds && !leaseIds.length)) return [];
  const narrow = planIds ? ["id", [...new Set(planIds)]] : leaseIds ? ["lease_id", [...new Set(leaseIds)]] : null;
  const rows = [];
  for (let i = 0; i < (narrow ? narrow[1].length : 1); i += CHUNK) {
    let q = forProject(admin.from(PLANS).select("*"), projectId).is("deleted_at", null);
    if (narrow) q = q.in(narrow[0], narrow[1].slice(i, i + CHUNK));
    if (statuses?.length) q = q.in("status", statuses);
    rows.push(...must(await q.order("created_at"), "payment plans"));
  }
  const byPlan = new Map(rows.map((r) => [r.id, []]));
  const ids = [...byPlan.keys()];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const q = forProject(admin.from(INSTALLMENTS).select("*"), projectId).in("plan_id", ids.slice(i, i + CHUNK)).is("deleted_at", null);
    for (const r of must(await q, "installments")) byPlan.get(r.plan_id)?.push(normalizeInstallment(r));
  }
  return rows.map((r) => normalizePlan(r, byPlan.get(r.id)));
}

export async function loadPlan(admin, projectId, planId) {
  const [plan] = await loadPlans(admin, projectId, { planIds: [planId] });
  if (!plan) throw fail("Payment plan not found.", 404);
  return plan;
}

async function leaseRows(admin, projectId, ids) {
  const out = new Map();
  const want = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < want.length; i += CHUNK) {
    for (const l of must(await forProject(admin.from("leases").select("*"), projectId).in("id", want.slice(i, i + CHUNK)), "leases")) out.set(l.id, l);
  }
  return out;
}

async function leaseRow(admin, projectId, leaseId) {
  const lease = (await leaseRows(admin, projectId, [leaseId])).get(leaseId);
  if (!lease || lease.deleted_at) throw fail("Lease not found.", 404);
  return lease;
}

const dimsOf = (plan) => ({ leaseId: plan.leaseId, tenantId: plan.tenantId || undefined, unitId: plan.unitId || undefined, propertyId: plan.propertyId || undefined });

// Activity on the plan's lease and tenant (never throws).
async function logPlan(admin, plan, summary, actor, metadata = {}) {
  const who = { actorId: actor?.id || null, actorName: actor?.name || actor?.email || (actor ? "Staff" : "Billing") };
  for (const [ownerType, ownerId] of [["lease", plan.leaseId], ["tenant", plan.tenantId]]) {
    if (ownerId) await logActivity(admin, { projectId: plan.projectId, ownerType, ownerId, verb: "action", summary, ...who, metadata: { paymentPlanId: plan.id, ...metadata } });
  }
}

// What a plan still holds in 1210: the debits less credits on its plan: entries (and their reversals).
export async function deferredRemaining(admin, projectId, acct, planId) {
  const keyed = must(await forProject(admin.from("ledger_entries").select("id"), projectId).like("idempotency_key", `plan:${planId}:%`).is("deleted_at", null), "plan entries");
  if (!keyed.length) return 0;
  const ids = keyed.map((e) => e.id);
  const reversals = must(await forProject(admin.from("ledger_entries").select("id"), projectId).in("reversal_of", ids).is("deleted_at", null), "plan reversals");
  const deferred = acct.list.filter((a) => a.subtype === "deferred_receivable").map((a) => a.id);
  const all = [...ids, ...reversals.map((r) => r.id)];
  let sum = 0;
  for (let i = 0; i < all.length; i += CHUNK) {
    const q = forProject(admin.from("ledger_lines").select("debit, credit"), projectId).in("entry_id", all.slice(i, i + CHUNK)).in("gl_account_id", deferred).is("deleted_at", null);
    for (const l of must(await q, "plan lines")) sum += Number(l.debit) - Number(l.credit);
  }
  return round2(sum);
}

// Plans with each installment's standing on `today` (what its charge still has open) → [{ …plan, installments, standing, deferredRemaining }].
export async function withStanding(admin, projectId, acct, plans, today) {
  const ids = plans.flatMap((p) => p.installments.map((i) => i.chargeEntryId)).filter(Boolean);
  const open = ids.length ? await openOnEntries(admin, projectId, acct, ids) : new Map();
  return plans.map((p) => {
    const { installments, ...standing } = planStanding(p, p.installments, { openByEntry: open, today });
    return { ...p, installments, standing, deferredRemaining: p.status === "Active" ? standing.unbilled : 0 };
  });
}

// Wizard inputs → plan fields (numbers coerced, defaults filled).
function fieldsOf(input = {}) {
  return {
    name: String(input.name || "").trim().slice(0, 120) || "Payment plan",
    totalAmount: round2(input.totalAmount),
    downPayment: round2(input.downPayment || 0),
    installmentCount: Number(input.installmentCount),
    frequency: PLAN_FREQUENCIES.includes(input.frequency) ? input.frequency : "Monthly",
    firstDue: isoDate(input.firstDue),
    graceDays: input.graceDays === undefined || input.graceDays === "" || input.graceDays === null ? DEFAULT_GRACE_DAYS : Number(input.graceDays),
    suspendLateFees: input.suspendLateFees !== false,
    note: String(input.note || "").trim().slice(0, 1000),
  };
}

// Live payments on the lease since `since`, newest first (down payment candidates).
async function recentPayments(admin, projectId, leaseId, since) {
  const q = forProject(admin.from("ledger_entries").select("id, entry_date, total, memo, metadata"), projectId)
    .eq("lease_id", leaseId)
    .eq("source_type", "payment")
    .eq("status", "posted")
    .is("reversal_of", null)
    .is("deleted_at", null)
    .gte("entry_date", since)
    .order("entry_date", { ascending: false })
    .limit(20);
  return must(await q, "payments").map((e) => ({ entryId: e.id, date: e.entry_date, amount: round2(e.total), memo: e.memo || "Payment", method: metaOf(e).method || "", reference: metaOf(e).reference || "" }));
}

// Everything the wizard and the Payment plan section show for a lease: balances, open charges, down payment candidates, plan policies and its plans with standing.
export async function planOverview(admin, ctx, lease) {
  const l = leaseFacts(lease);
  const projectId = l.projectId;
  const today = await ctx.today(projectId);
  const acct = await ctx.accounts(projectId);
  const [receivables, policies, payments, plans] = await Promise.all([
    loadLeaseReceivables(admin, projectId, [l.id], acct),
    ctx.policies(lease),
    recentPayments(admin, projectId, l.id, addDays(today, -60)),
    loadPlans(admin, projectId, { leaseIds: [l.id] }),
  ]);
  const rec = receivables.get(l.id);
  const used = new Set(plans.filter((p) => p.status !== "Cancelled").map((p) => p.metadata.downPaymentEntryId).filter(Boolean));
  return {
    today,
    balance: rec.balance,
    credit: rec.credit,
    pastDue: pastDueOf(rec.items, today),
    openTotal: openTotalOf(rec.items),
    items: rec.items.map((i) => ({ entryId: i.entryId, date: i.date, memo: i.memo, kind: i.kind, period: i.period, amount: i.amount, open: i.open })),
    payments: payments.filter((p) => !used.has(p.entryId)),
    policies: {
      graceDays: Number(policies.graceDays) || 0,
      lateFeeType: policies.lateFeeType || "none",
      lateFeeOnInstallments: policies.lateFeeOnInstallments === true || policies.lateFeeOnInstallments === "true",
      planDefaultAfterMissed: defaultsAfter(policies),
    },
    plans: (await withStanding(admin, projectId, acct, plans, today)).reverse(),
  };
}

// A draft plan and its schedule for a lease → plan; one draft or active plan per lease, and the plan can't exceed the open charges.
export async function createPlan(admin, ctx, lease, input, { actor } = {}) {
  const l = leaseFacts(lease);
  const projectId = l.projectId;
  if (!projectId) throw fail("The lease has no project.");
  const current = await loadPlans(admin, projectId, { leaseIds: [l.id], statuses: OPEN_PLAN_STATUSES });
  if (current.length) {
    throw fail(current[0].status === "Draft" ? "This lease already has a draft payment plan — activate or cancel it first." : "This lease already has an active payment plan.", 409);
  }
  const today = await ctx.today(projectId);
  const acct = await ctx.accounts(projectId);
  const rec = (await loadLeaseReceivables(admin, projectId, [l.id], acct)).get(l.id);
  const fields = fieldsOf(input);
  const error = validatePlan(fields, { today, openTotal: openTotalOf(rec.items) });
  if (error) throw fail(error);
  const schedule = buildSchedule(fields);
  const id = crypto.randomUUID();
  const createdBy = actor?.id || null;
  must(
    await admin.from(PLANS).insert({
      id,
      project_id: projectId,
      lease_id: l.id,
      tenant_id: l.tenantId || null,
      property_id: l.propertyId || null,
      unit_id: l.unitId || null,
      name: fields.name,
      total_amount: fields.totalAmount,
      down_payment: fields.downPayment,
      installment_count: schedule.length,
      frequency: fields.frequency,
      first_due: fields.firstDue,
      status: "Draft",
      grace_days: fields.graceDays,
      suspend_late_fees: fields.suspendLateFees,
      created_by: createdBy,
      metadata: { createdOn: today, pastDue: pastDueOf(rec.items, today), balance: rec.balance, ...(fields.note ? { note: fields.note } : {}) },
    }),
    "payment plan",
  );
  const inserted = await admin.from(INSTALLMENTS).insert(schedule.map((s) => ({ project_id: projectId, plan_id: id, seq: s.seq, due_date: s.dueDate, amount: s.amount, status: "Scheduled", created_by: createdBy })));
  if (inserted.error) {
    await admin.from(PLANS).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    throw new Error(`installments: ${inserted.error.message}`);
  }
  const plan = await loadPlan(admin, projectId, id);
  await logPlan(admin, plan, `Payment plan drafted: ${usd(financedOf(plan))} in ${schedule.length} installments (${frequencyNoun(plan.frequency)}) from ${plan.firstDue}${plan.downPayment > 0 ? ` after a ${usd(plan.downPayment)} down payment` : ""}`, actor);
  return plan;
}

// The payment that covers a plan's down payment: posted, on the plan's lease, at least the amount, and not another plan's.
async function checkDownPayment(admin, projectId, plan, entryId) {
  if (!entryId) throw fail(`Record the ${usd(plan.downPayment)} down payment first, or set the down payment to $0.`, 409);
  const e = must(await forProject(admin.from("ledger_entries").select("id, lease_id, source_type, status, reversal_of, total, entry_date, deleted_at"), projectId).eq("id", entryId).maybeSingle(), "down payment");
  if (!e || e.deleted_at || e.source_type !== "payment" || e.status !== "posted" || e.reversal_of) throw fail("The down payment must be a posted payment.", 409);
  if (e.lease_id !== plan.leaseId) throw fail("The down payment must be a payment on this plan's lease.", 409);
  if (round2(e.total) + 0.004 < plan.downPayment) throw fail(`That payment (${usd(e.total)}) is less than the ${usd(plan.downPayment)} down payment.`, 409);
  const others = await loadPlans(admin, projectId, { leaseIds: [plan.leaseId] });
  if (others.some((p) => p.id !== plan.id && p.status !== "Cancelled" && p.metadata.downPaymentEntryId === entryId)) throw fail("That payment is already another plan's down payment.", 409);
  return { id: e.id, amount: round2(e.total), date: e.entry_date };
}

// Activate a draft once its down payment is recorded (CORE-11): defer the lease's open charges oldest first up to total − down payment (plan:<id>:defer, Dr 1210 / Cr AR), then bill installments already due → { plan, entries, replay? }.
export async function activatePlan(admin, ctx, planId, { projectId, downPaymentEntryId, signedOn, actor } = {}) {
  const plan = await loadPlan(admin, projectId, planId);
  if (plan.status === "Active") return { plan, entries: [], replay: true };
  if (plan.status !== "Draft") throw fail(`This plan is ${plan.status.toLowerCase()}; only a draft can be activated.`, 409);
  if ((await loadPlans(admin, projectId, { leaseIds: [plan.leaseId], statuses: ["Active"] })).length) throw fail("This lease already has an active payment plan.", 409);
  const down = plan.downPayment > 0 ? await checkDownPayment(admin, projectId, plan, downPaymentEntryId) : null;
  const today = await ctx.today(projectId);
  const acct = await ctx.accounts(projectId);
  const key = planDeferKey(plan.id);
  const financed = financedOf(plan);
  let allocations = [];
  // A retry after the deferral posted reuses it; otherwise the lease must still owe what the plan defers.
  if (!(await findPosted(admin, projectId, key))) {
    const rec = (await loadLeaseReceivables(admin, projectId, [plan.leaseId], acct)).get(plan.leaseId);
    const d = deferAllocations(rec.items, financed);
    if (d.short > 0) {
      throw fail(`Only ${usd(financed - d.short)} is open on the lease to defer, and this plan defers ${usd(financed)}. Cancel the draft and set up a plan for what's owed now.`, 409);
    }
    allocations = d.allocations;
  }
  const res = await postOnce(
    admin,
    projectId,
    key,
    (a) =>
      buildPlanDeferral(
        { ...dimsOf(plan), date: today, amount: financed, allocations, memo: `Payment plan · ${plan.name} — ${usd(financed)} deferred`, sourceId: plan.id, paymentPlanId: plan.id, metadata: { paymentPlanId: plan.id, deferred: financed, items: allocations } },
        a,
      ),
    { acct, createdBy: actor?.id || null },
  );
  const metadata = { ...plan.metadata, activatedOn: today, ...(down ? { downPaymentEntryId: down.id } : {}), ...(actor ? { activatedBy: { id: actor.id || null, name: actor.name || actor.email || "Staff" } } : {}) };
  const updated = await admin
    .from(PLANS)
    .update({ status: "Active", defer_entry_id: res.entryId, signed_on: isoDate(signedOn) || plan.signedOn || null, metadata })
    .eq("id", plan.id)
    .eq("status", "Draft")
    .select("id");
  if (updated.error) throw updated.error.code === "23505" ? fail("This lease already has an active payment plan.", 409) : new Error(`payment plan: ${updated.error.message}`);
  const active = await loadPlan(admin, projectId, plan.id);
  await logPlan(admin, active, `Payment plan activated: ${usd(financed)} moved to Deferred Receivable, ${active.installmentCount} installments (${frequencyNoun(active.frequency)}) from ${active.firstDue}`, actor, {
    entryId: res.entryId,
    ...(down ? { downPaymentEntryId: down.id } : {}),
  });
  const billed = await billPlanInstallments(admin, ctx, today, { projectId, planIds: [plan.id], actor });
  return { plan: await loadPlan(admin, projectId, plan.id), entries: [{ entryId: res.entryId, key, amount: financed, kind: "defer", created: res.created }, ...billed.entries] };
}

// Persist each installment's standing and the plan's: Completed once every installment is paid, Defaulted (accelerated) at the policy's missed limit → { standing, changed, completed?, defaulted?, entries }.
export async function refreshPlanStatus(admin, ctx, plan, { today, acct, lease, actor, autoDefault = true } = {}) {
  const projectId = plan.projectId;
  const accounts = acct || (await ctx.accounts(projectId));
  const day = today || (await ctx.today(projectId));
  const ids = plan.installments.map((i) => i.chargeEntryId).filter(Boolean);
  const open = ids.length ? await openOnEntries(admin, projectId, accounts, ids) : new Map();
  const standing = planStanding(plan, plan.installments, { openByEntry: open, today: day });
  let changed = 0;
  for (const s of standing.installments) {
    const was = plan.installments.find((i) => i.id === s.id);
    if (!was || was.status === s.status) continue;
    must(await admin.from(INSTALLMENTS).update({ status: s.status }).eq("id", s.id), "installment status");
    was.status = s.status;
    changed += 1;
  }
  const out = { standing, changed, entries: [] };
  if (plan.status !== "Active") return out;
  if (standing.allPaid) {
    must(await admin.from(PLANS).update({ status: "Completed", metadata: { ...plan.metadata, completedOn: day } }).eq("id", plan.id).eq("status", "Active"), "payment plan");
    await logPlan(admin, plan, `Payment plan completed: all ${plan.installmentCount} installments paid`, actor);
    return { ...out, completed: true };
  }
  const policies = await ctx.policies(lease || (await leaseRow(admin, projectId, plan.leaseId)));
  if (!autoDefault || !shouldDefault(standing, policies)) return out;
  const res = await accelerate(admin, ctx, plan, { status: "Defaulted", reason: `${standing.missed} installment${standing.missed === 1 ? "" : "s"} missed`, today: day, actor });
  return { ...out, defaulted: true, entries: res.entries };
}

// Bill every installment due by `today` on active plans (billing job step, autopay, activation), then refresh standing → { entries, completed, defaulted }; with `res` (the job) failures are collected per plan.
export async function billPlanInstallments(admin, ctx, today, { projectId, planIds, leaseIds, actor, res } = {}) {
  const plans = await loadPlans(admin, projectId, { planIds, leaseIds, statuses: ["Active"] });
  const out = { entries: [], completed: [], defaulted: [] };
  if (!plans.length) return out;
  const acct = await ctx.accounts(projectId);
  const leases = await leaseRows(admin, projectId, plans.map((p) => p.leaseId));
  for (const plan of plans) {
    if (res) res.processed += 1;
    try {
      let created = 0;
      for (const inst of plan.installments.filter((i) => !i.chargeEntryId && i.status === "Scheduled" && i.dueDate <= today)) {
        const key = planInstallmentKey(plan.id, inst.seq);
        // Posted on its due date (aging and late fees count from it) unless that month is closed (CORE-40).
        const date = (await ctx.isPeriodOpen(projectId, periodOf(inst.dueDate))) ? inst.dueDate : today;
        const metadata = { paymentPlanId: plan.id, installment: inst.seq, of: plan.installmentCount, dueDate: inst.dueDate, ...(res ? { auto: true } : {}) };
        const r = await postOnce(
          admin,
          projectId,
          key,
          (a) => buildPlanRebill({ ...dimsOf(plan), date, amount: inst.amount, sourceType: "charge", memo: installmentMemo(inst.seq, plan.installmentCount), sourceId: plan.id, paymentPlanId: plan.id, metadata }, a),
          { acct, createdBy: actor?.id || null },
        );
        must(await admin.from(INSTALLMENTS).update({ status: "Billed", charge_entry_id: r.entryId }).eq("id", inst.id), "installment");
        Object.assign(inst, { status: "Billed", chargeEntryId: r.entryId });
        out.entries.push({ entryId: r.entryId, key, amount: inst.amount, kind: "installment", created: r.created, planId: plan.id });
        if (r.created) created += 1;
      }
      const after = await refreshPlanStatus(admin, ctx, plan, { today, acct, lease: leases.get(plan.leaseId), actor });
      out.entries.push(...after.entries.map((e) => ({ ...e, planId: plan.id })));
      created += after.entries.filter((e) => e.created).length;
      if (after.completed) out.completed.push(plan.id);
      if (after.defaulted) out.defaulted.push(plan.id);
      if (res) {
        res.created += created;
        if (!created) res.skipped += 1;
      }
    } catch (e) {
      if (!res) throw e;
      res.errors.push(projectError(projectId, `payment plan ${plan.name} (${plan.id}): ${e.message}`));
    }
  }
  return out;
}

// End an active plan, posting what 1210 still holds back to AR (plan:<id>:accelerate, Dr AR / Cr 1210); its unbilled installments are then billed by that entry.
async function accelerate(admin, ctx, plan, { status, reason, today, actor }) {
  const projectId = plan.projectId;
  const acct = await ctx.accounts(projectId);
  const day = today || (await ctx.today(projectId));
  const key = planAccelerateKey(plan.id);
  const remaining = await deferredRemaining(admin, projectId, acct, plan.id);
  const entries = [];
  if (remaining > 0.004 || (await findPosted(admin, projectId, key))) {
    const verb = status === "Defaulted" ? "defaulted" : "cancelled";
    const r = await postOnce(
      admin,
      projectId,
      key,
      (a) =>
        buildPlanRebill(
          { ...dimsOf(plan), date: day, amount: remaining, sourceType: "payment_plan", memo: `Payment plan · ${plan.name} ${verb} — remaining balance due`, sourceId: plan.id, paymentPlanId: plan.id, metadata: { paymentPlanId: plan.id, accelerated: remaining, reason: reason || "" } },
          a,
        ),
      { acct, createdBy: actor?.id || null },
    );
    entries.push({ entryId: r.entryId, key, amount: remaining, kind: "accelerate", created: r.created });
    for (const i of plan.installments.filter((x) => !x.chargeEntryId)) {
      must(await admin.from(INSTALLMENTS).update({ status: "Billed", charge_entry_id: r.entryId, metadata: { ...i.metadata, accelerated: true } }).eq("id", i.id), "installment");
    }
  }
  const metadata = { ...plan.metadata, endedOn: day, endedReason: reason || "", ...(actor ? { endedBy: { id: actor.id || null, name: actor.name || actor.email || "Staff" } } : {}) };
  must(await admin.from(PLANS).update({ status, metadata }).eq("id", plan.id).eq("status", plan.status), "payment plan");
  await logPlan(admin, plan, `Payment plan ${status === "Defaulted" ? "defaulted" : "cancelled"}${reason ? ` (${reason})` : ""}${remaining > 0.004 ? `: ${usd(remaining)} still deferred is due now` : ""}`, actor, {
    entryId: entries[0]?.entryId || null,
  });
  return { entries };
}

// Default an active plan by hand (the job defaults at the policy's missed limit) → { plan, entries, replay? }.
export async function defaultPlan(admin, ctx, planId, { projectId, reason, actor, today } = {}) {
  const plan = await loadPlan(admin, projectId, planId);
  if (plan.status === "Defaulted") return { plan, entries: [], replay: true };
  if (plan.status !== "Active") throw fail(`Only an active plan can be defaulted; this one is ${plan.status.toLowerCase()}.`, 409);
  const res = await accelerate(admin, ctx, plan, { status: "Defaulted", reason: String(reason || "").trim().slice(0, 300) || "Defaulted by staff", today, actor });
  return { plan: await loadPlan(admin, projectId, planId), entries: res.entries };
}

// Cancel a draft (nothing posted) or an active plan (its remainder back to AR) → { plan, entries, replay? }.
export async function cancelPlan(admin, ctx, planId, { projectId, reason, actor, today } = {}) {
  const plan = await loadPlan(admin, projectId, planId);
  const why = String(reason || "").trim().slice(0, 300);
  if (plan.status === "Cancelled") return { plan, entries: [], replay: true };
  if (plan.status === "Draft") {
    const day = today || (await ctx.today(projectId));
    must(await admin.from(PLANS).update({ status: "Cancelled", metadata: { ...plan.metadata, endedOn: day, endedReason: why } }).eq("id", plan.id).eq("status", "Draft"), "payment plan");
    await logPlan(admin, plan, `Draft payment plan cancelled${why ? ` (${why})` : ""}`, actor);
    return { plan: await loadPlan(admin, projectId, planId), entries: [] };
  }
  if (plan.status !== "Active") throw fail(`A ${plan.status.toLowerCase()} plan can't be cancelled.`, 409);
  const res = await accelerate(admin, ctx, plan, { status: "Cancelled", reason: why || "Cancelled by staff", today, actor });
  return { plan: await loadPlan(admin, projectId, planId), entries: res.entries };
}

// --- Agreement --------------------------------------------------------------------

async function rowOf(admin, table, id, projectId) {
  if (!id) return null;
  const row = must(await forProject(admin.from(table).select("*"), projectId).eq("id", id).maybeSingle(), table);
  return row && !row.deleted_at ? row : null;
}

async function settingOf(admin, projectId, key) {
  const rows = must(await forProject(admin.from("settings").select("value"), projectId).eq("key", key).is("deleted_at", null).limit(1), key);
  return rows[0]?.value || {};
}

// The plan's agreement merged from the lease's records (lib/leasing/merge.js) → { text, name, unknown, empty, plan }.
export async function planAgreement(admin, projectId, planOrId) {
  const plan = typeof planOrId === "string" ? await loadPlan(admin, projectId, planOrId) : planOrId;
  const lease = await leaseRow(admin, projectId, plan.leaseId);
  const [tenant, unit, property, parties, company, profile] = await Promise.all([
    rowOf(admin, "tenants", lease.tenant_id, projectId),
    rowOf(admin, "units", lease.unit_id, projectId),
    rowOf(admin, "properties", lease.property_id, projectId),
    forProject(admin.from("lease_parties").select("role, name, email, phone, is_primary"), projectId).eq("lease_id", lease.id).is("deleted_at", null).then((r) => must(r, "lease parties")),
    settingOf(admin, projectId, "fees_policies"),
    settingOf(admin, projectId, "company_profile"),
  ]);
  const policies = effectivePolicies({ company, property, lease });
  const l = leaseFacts(lease);
  const leaseView = { ...l, leaseType: lease.lease_type || "residential", signedDate: lease.signed_date || "", deposit: Number(lease.deposit) || 0 };
  const values = buildMergeValues({
    lease: leaseView,
    tenant,
    unit,
    property,
    parties: parties.map((p) => ({ role: p.role, name: p.name, email: p.email, phone: p.phone, isPrimary: p.is_primary })),
    policies,
    company: profile,
  });
  const merged = mergeTemplate(DEFAULT_PAYMENT_PLAN_BODY, { ...values, ...buildPlanMergeValues({ plan, installments: plan.installments, policies, lateFee: values["lease.late_fee"] }) });
  return { ...merged, name: `${plan.name} — payment plan agreement`, plan };
}

// Save the merged agreement to the lease's Documents and link it to the plan → { documentId, url, name }.
export async function saveAgreement(admin, projectId, planId, { actor, today } = {}) {
  const merged = await planAgreement(admin, projectId, planId);
  const plan = merged.plan;
  const day = today || isoDate(new Date());
  const name = `${merged.name} ${day}`.replace(/[^a-zA-Z0-9 _—-]+/g, "").trim();
  const path = `property/lease/${plan.leaseId}/${new Date().toISOString().replace(/[.:]/g, "-")}-${plan.id.slice(0, 8)}-payment-plan.txt`;
  const bytes = Buffer.from(merged.text, "utf8");
  const up = await admin.storage.from(DOCUMENT_BUCKET).upload(path, bytes, { contentType: "text/plain;charset=utf-8", upsert: false });
  if (up.error) throw new Error(`agreement upload: ${up.error.message}`);
  const url = admin.storage.from(DOCUMENT_BUCKET).getPublicUrl(path).data?.publicUrl || "";
  const doc = must(
    await admin
      .from("documents")
      .insert({ project_id: projectId, owner_type: "lease", owner_id: plan.leaseId, kind: "payment_plan_agreement", name: `${name}.txt`, url, size_bytes: bytes.length, created_by: actor?.id || null, metadata: { paymentPlanId: plan.id, storagePath: path } })
      .select("id")
      .single(),
    "document",
  );
  must(await admin.from(PLANS).update({ agreement_document_id: doc.id }).eq("id", plan.id), "payment plan");
  await logPlan(admin, plan, "Payment plan agreement saved to Documents", actor, { documentId: doc.id });
  return { documentId: doc.id, url, name: `${name}.txt` };
}

// Record the date the printed agreement was signed (v1: no e-signature).
export async function recordSigned(admin, projectId, planId, signedOn, { actor } = {}) {
  const day = isoDate(signedOn);
  if (!day) throw fail("Pick the date the agreement was signed.");
  const plan = await loadPlan(admin, projectId, planId);
  if (plan.status === "Cancelled") throw fail("This plan is cancelled.", 409);
  must(await admin.from(PLANS).update({ signed_on: day }).eq("id", plan.id), "payment plan");
  await logPlan(admin, plan, `Payment plan agreement signed on ${day}`, actor);
  return loadPlan(admin, projectId, planId);
}
