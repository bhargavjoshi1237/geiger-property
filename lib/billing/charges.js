import "server-only";
import { buildCharge, buildCredit } from "@/lib/ledger/postings";
import { forProject } from "@/lib/supabase/scope";
import { projectError } from "@/lib/jobs/contract";
import { makeBillingContext } from "./context";
import { maxDate, minDate, periodLabel, periodOf, round2 } from "./periods";
import { billingStartFor, billingWindow, leaseFacts } from "./rent";
import { fail, openOnEntries, postOnce } from "./post";
import { MAX_CATCH_UP, chargeEnd, chargeFacts, chargeKey, coveredBy, endAdjustments, parseChargeKey, planCharge, postedOccurrence } from "./charge_plan";
import { billsWithRent, frequencyOf } from "./frequency";

// Server-only recurring-charge billing (CORE-03): posts due occurrences (rc:), trues up end-date changes (rc-adj:), advances and ends charges.

const CHUNK = 150;
const POSTINGS_KEPT = 120;
const SKIPS_KEPT = 24;
const ENTRY_COLS = "id, entry_date, source_type, status, reversal_of, idempotency_key, total, metadata, lease_id, tenant_id, unit_id, property_id, deleted_at";

const isLive = (e) => !e.deleted_at && e.status === "posted" && !e.reversal_of;
const methodOf = (policies) => (policies?.prorationMethod === "thirty" ? "thirty" : "actual");
// Ended by the billing job (metadata.endedBy), as opposed to staff setting the status by hand.
const endedByBilling = (row) => row?.status === "Ended" && row?.metadata?.endedBy === "billing";

export async function loadCharge(admin, chargeId, projectId) {
  const { data, error } = await forProject(admin.from("recurring_charges").select("*").eq("id", chargeId), projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted_at) throw fail("Recurring charge not found.", 404);
  return data;
}

// rc: / rc-adj: entries per charge → Map chargeId → Map occurrence date → { main, billed, maxAdj, adjusted } (maxAdj counts every key ever used).
export async function loadChargeLedger(admin, projectId, chargeIds) {
  const ids = [...new Set((chargeIds || []).filter(Boolean))];
  const out = new Map(ids.map((id) => [id, new Map()]));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await forProject(admin.from("ledger_entries").select(ENTRY_COLS), projectId)
      .in("source_type", ["charge", "credit"])
      .in("source_id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(`charge ledger: ${error.message}`);
    for (const e of data || []) {
      const k = parseChargeKey(e.idempotency_key);
      if (!k || !out.has(k.chargeId)) continue;
      const byDate = out.get(k.chargeId);
      const slot = byDate.get(k.date) || { main: null, billed: 0, maxAdj: 0, adjusted: false };
      byDate.set(k.date, slot);
      if (k.kind === "rc") {
        slot.main = e;
        if (isLive(e)) slot.billed = round2(slot.billed + Number(e.total));
        continue;
      }
      slot.maxAdj = Math.max(slot.maxAdj, k.n);
      if (!isLive(e)) continue;
      slot.adjusted = true;
      slot.billed = round2(slot.billed + (e.source_type === "credit" ? -1 : 1) * Number(e.total));
    }
  }
  return out;
}

const dimsOf = (lease, charge) => {
  const l = leaseFacts(lease);
  return { leaseId: l.id, tenantId: l.tenantId || charge.tenantId || null, unitId: l.unitId || charge.unitId || null, propertyId: l.propertyId || charge.propertyId || null };
};
const entryDims = (e) => ({ leaseId: e.lease_id, tenantId: e.tenant_id, unitId: e.unit_id, propertyId: e.property_id });

// Account types a charge may credit: income, or a liability / expense for pass-throughs and recoveries; never an asset or equity.
export const CHARGE_GL_TYPES = ["Income", "Liability", "Expense"];

// The account an occurrence credits: the charge's GL (one of CHARGE_GL_TYPES), else Other Income.
function glFor(acct, glAccountId) {
  const a = glAccountId ? acct.byId.get(glAccountId) : null;
  if (a) {
    if (!CHARGE_GL_TYPES.includes(a.accountType)) throw fail(`${a.number ? `${a.number} · ` : ""}${a.name} is an ${String(a.accountType).toLowerCase()} account — a charge credits income, a liability or an expense.`);
    return a.id;
  }
  const other = acct.byKey.get("other_income");
  if (!other) throw fail("No Other Income account in the chart of accounts.");
  return other.id;
}

const occurrenceMemo = (c, occ) => {
  const when = occ.basis === "month" ? periodLabel(occ.period) : occ.from === occ.to ? occ.from : `${occ.from} – ${occ.to}`;
  return `${c.name} · ${when}${occ.amount !== occ.rate ? " (prorated)" : ""}`;
};

// Live posted occurrences of a charge with their coverage → [{ date, entryId, occ, billed, maxAdj, main }].
function postedOf(c, slots, dueDay) {
  const out = [];
  for (const [date, slot] of slots || []) {
    if (!slot.main || !isLive(slot.main)) continue;
    out.push({ date, entryId: slot.main.id, occ: postedOccurrence(c, slot.main, { dueDay }), billed: slot.billed, maxAdj: slot.maxAdj, main: slot.main });
  }
  return out;
}

// True up posted occurrences to the current end: credit (Dr GL / Cr AR applied to the occurrence) what it cuts off, re-bill what it no longer does.
async function postEndAdjustments(admin, c, history, { end, today, acct, method, createdBy }) {
  const entries = [];
  for (const adj of endAdjustments(c, history, { end, method })) {
    const p = history.find((x) => x.date === adj.date);
    const gl = glFor(acct, p.main.metadata?.glAccountId || c.glAccountId);
    const base = {
      ...entryDims(p.main),
      date: maxDate(adj.date, today),
      sourceId: c.id,
      metadata: { recurringChargeId: c.id, billing: "charge-adjustment", occurrence: adj.date, adjustment: adj.delta, endsOn: end || null },
    };
    let allocations = [];
    if (adj.delta < 0) {
      const open = (await openOnEntries(admin, c.projectId, acct, [p.entryId])).get(p.entryId) || 0;
      const take = round2(Math.min(-adj.delta, Math.max(0, open)));
      if (take > 0) allocations = [{ entryId: p.entryId, amount: take }];
    }
    const res = await postOnce(
      admin,
      c.projectId,
      adj.key,
      (a) =>
        adj.delta < 0
          ? buildCredit({ ...base, amount: -adj.delta, glAccountId: gl, allocations, sourceType: "credit", memo: `${c.name} · credit, charge ends ${end}` }, a)
          : buildCharge({ ...base, amount: adj.delta, glAccountId: gl, memo: `${c.name} · re-billed, end date moved` }, a),
      { acct, createdBy },
    );
    entries.push({ entryId: res.entryId, key: adj.key, amount: adj.delta, kind: adj.delta < 0 ? "credit" : "charge", created: res.created, date: base.date });
  }
  return entries;
}

// Bill one charge on its lease → { chargeId, entries, covered, next, status, skipped?, nothing? }.
// Posts what's due through `today` (opts.next: only the next one, due or not; opts.floor passes over pre-go-live dates), trues up to the end, saves progress.
// opts.reopen: a charge the job ended whose end changed; it resumes when the new end leaves occurrences to bill.
export async function billRecurringCharge(admin, ctx, charge, lease, today, opts = {}) {
  const c = chargeFacts(charge);
  const was = c.status;
  const out = { chargeId: c.id, entries: [], covered: [], next: c.nextDate, status: was };
  if (!(was === "Active" || (opts.reopen && endedByBilling(charge)))) return { ...out, skipped: "not active" };
  if (!(c.amount > 0)) return { ...out, skipped: "no amount" };
  if (!lease) return { ...out, skipped: "no lease" };
  const window = billingWindow(lease);
  if (!window.billable) return { ...out, skipped: "lease not billing" };
  c.projectId = c.projectId || leaseFacts(lease).projectId;

  // A renewal lease's charge keeps billing the months before its start on the lease it renewed.
  const pred = opts.predecessor && billingWindow(opts.predecessor).billable ? opts.predecessor : null;
  const start = pred ? minDate(billingWindow(pred).start, window.start) : window.start;
  const policies = opts.policies || (await ctx.policies(lease));
  const method = methodOf(policies);
  const plan = planCharge(
    { ...charge, status: "Active" },
    {
      window: { start, end: window.end },
      through: opts.next ? null : today,
      today,
      limit: opts.next ? 1 : MAX_CATCH_UP,
      dueDay: policies.rentDueDay,
      method,
      floor: opts.next ? "" : opts.floor || "",
    },
  );
  if (plan.error) throw fail(plan.error);
  // Post next with nothing left to post saves nothing (the caller answers 409).
  if (opts.next && !plan.occurrences.length) return { ...out, nothing: true };
  const slots = opts.ledger?.get(c.id) || (await loadChargeLedger(admin, c.projectId, [c.id])).get(c.id);
  const history = postedOf(c, slots, policies.rentDueDay);

  const acct = await ctx.accounts(c.projectId);
  const gl = glFor(acct, c.glAccountId);
  const createdBy = opts.actor?.id || null;
  let next = plan.next;
  let status = plan.status;
  for (const occ of plan.occurrences) {
    // Period close (CORE-40): stop before a closed period and pick up from this occurrence later.
    if (!(await ctx.isPeriodOpen(c.projectId, periodOf(occ.date)))) {
      next = occ.scheduled;
      status = "Active";
      break;
    }
    // Days another posted occurrence already billed (a rewound next_date or a moved lease start) aren't billed twice.
    if (coveredBy(occ, history.map((p) => ({ date: p.date, from: p.occ.from, to: p.occ.to })))) {
      out.covered.push(occ.date);
      continue;
    }
    const key = chargeKey(c.id, occ.date);
    const dims = pred && occ.date < window.start ? dimsOf(pred, c) : dimsOf(lease, c);
    const metadata = {
      recurringChargeId: c.id,
      billing: "charge",
      frequency: frequencyOf(c.frequency)?.value || c.frequency,
      scheduled: occ.scheduled,
      from: occ.from,
      to: occ.to,
      periodFrom: occ.periodFrom,
      periodTo: occ.periodTo,
      ...(occ.period ? { period: occ.period } : {}),
      basis: occ.basis,
      rate: occ.rate,
      prorate: c.prorate,
      method,
      glAccountId: gl,
      ...(opts.auto ? { auto: true } : {}),
    };
    const res = await postOnce(
      admin,
      c.projectId,
      key,
      (a) => buildCharge({ ...dims, date: occ.date, amount: occ.amount, glAccountId: gl, memo: occurrenceMemo(c, occ), sourceId: c.id, metadata }, a),
      { acct, createdBy },
    );
    out.entries.push({ entryId: res.entryId, key, amount: occ.amount, kind: "charge", created: res.created, date: occ.date });
  }

  // End-date / move-out true-ups for occurrences already posted (both directions).
  out.entries.push(...(await postEndAdjustments(admin, c, history, { end: plan.end, today, acct, method, createdBy })));

  await saveProgress(admin, c, { was, next, status, end: plan.end, entries: out.entries, skipped: plan.skipped, today, anchorDay: plan.anchorDay });
  return { ...out, next, status };
}

// Save next_date / status (only if nobody moved them since this read), the Posting tab log, the end the job ended it at, and go-live skips.
async function saveProgress(admin, c, { was, next, status, end, entries, skipped, today, anchorDay }) {
  if (next !== c.nextDate || status !== was) {
    const { error } = await forProject(admin.from("recurring_charges").update({ next_date: next, status }).eq("id", c.id), c.projectId).eq("next_date", c.nextDate).eq("status", was);
    if (error) throw new Error(`recurring charge: ${error.message}`);
  }
  const patch = {};
  const postings = Array.isArray(c.metadata.postings) ? [...c.metadata.postings] : [];
  const known = new Set(postings.map((p) => p.entryId));
  const fresh = entries.filter((e) => !known.has(e.entryId));
  if (fresh.length) {
    // Newest first, as the Posting tab lists them.
    for (const e of fresh) postings.unshift({ id: e.entryId, entryId: e.entryId, date: e.date, amount: e.amount, postedAt: today, ...(e.key.startsWith("rc-adj:") ? { kind: "adjustment" } : {}) });
    patch.postings = postings.slice(0, POSTINGS_KEPT);
  }
  // endedOn is the end the charge finished at; the job reopens the charge when that end changes.
  if (status === "Ended" && (was !== "Ended" || (c.metadata.endedOn ?? null) !== (end || null))) Object.assign(patch, { endedBy: "billing", endedOn: end || null });
  if (status !== "Ended" && was === "Ended") Object.assign(patch, { endedBy: null, endedOn: null });
  if (skipped?.length) patch.goLiveSkipped = [...new Set([...(c.metadata.goLiveSkipped || []), ...skipped])].slice(-SKIPS_KEPT);
  // Keep a month-end anchor (Jan 31 → Feb 28 → Mar 31) only while next_date sits clamped below it.
  const day = Number(String(next).slice(8, 10)) || 0;
  const anchor = anchorDay && anchorDay > day ? anchorDay : null;
  const anchored = frequencyOf(c.frequency)?.months && !billsWithRent(c.frequency, c.billWithRent);
  if (anchored && (c.metadata.anchorDay ?? null) !== anchor) patch.anchorDay = anchor;
  if (!Object.keys(patch).length) return;
  const { error } = await admin.rpc("merge_meta", { p_table: "recurring_charges", p_id: c.id, p_patch: patch });
  if (error) throw new Error(`recurring charge: ${error.message}`);
}

// The billing job's charge step for one project's billable leases (each floored at its billing start from `settings`) → posted entries; counts into `res`.
// Works due charges, Active ones with an end (move-out credits), and ones the job ended whose end has since changed.
export async function billLeaseCharges(admin, ctx, projectId, leases, { today, settings = {}, res = { processed: 0, created: 0, skipped: 0, errors: [] } }) {
  const byId = new Map(leases.map((l) => [l.id, l]));
  const charges = [];
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await forProject(admin.from("recurring_charges").select("*"), projectId)
      .in("status", ["Active", "Ended"])
      .is("deleted_at", null)
      .in("lease_id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(`recurring charges: ${error.message}`);
    charges.push(...(data || []));
  }
  const endOf = (r) => chargeEnd(r, billingWindow(byId.get(r.lease_id)));
  const reopen = (r) => endedByBilling(r) && (endOf(r) || null) !== (r.metadata.endedOn ?? null);
  const work = charges.filter((r) => (r.status === "Active" && ((r.next_date && r.next_date <= today) || endOf(r) || r.metadata?.endAdjusted)) || reopen(r));
  const entries = [];
  if (!work.length) return entries;
  const ledger = await loadChargeLedger(admin, projectId, work.map((r) => r.id));
  for (const row of work) {
    res.processed += 1;
    try {
      const lease = byId.get(row.lease_id);
      const predecessor = await predecessorFor(admin, lease, row, byId);
      const floor = billingStartFor(lease, settings);
      const out = await billRecurringCharge(admin, ctx, row, lease, today, { ledger, predecessor, floor, reopen: reopen(row), auto: true });
      entries.push(...out.entries);
      const created = out.entries.filter((e) => e.created).length;
      res.created += created;
      if (!created) res.skipped += 1;
    } catch (e) {
      res.errors.push(projectError(projectId, `charge ${row.name || row.id}: ${e.message}`));
    }
  }
  return entries;
}

// The lease a renewal replaced, when the charge's next occurrence predates the renewal's start.
async function predecessorFor(admin, lease, row, byId = new Map()) {
  const l = leaseFacts(lease);
  if (!l?.renewalOfId || !row.next_date || row.next_date >= (billingWindow(lease).start || "")) return null;
  if (byId.has(l.renewalOfId)) return byId.get(l.renewalOfId);
  const { data, error } = await forProject(admin.from("leases").select("*").eq("id", l.renewalOfId), l.projectId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

// "Post next charge": post the charge's next occurrence now, due or not, and advance it (accounting.post); 409 without saving when nothing is left.
export async function postNextCharge(admin, charge, { actor, ctx, now } = {}) {
  const c = chargeFacts(charge);
  if (c.status !== "Active") throw fail(c.status === "Ended" ? "This charge has ended." : "Resume the charge (status Active) before posting it.", 409);
  if (!(c.amount > 0)) throw fail("Enter the charge amount first.");
  if (!c.leaseId) throw fail("Link the charge to a lease first — charges post to a lease's ledger.");
  const { data: lease, error } = await forProject(admin.from("leases").select("*").eq("id", c.leaseId), c.projectId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lease) throw fail("The charge's lease wasn't found.", 404);
  if (!billingWindow(lease).billable) throw fail("The lease isn't billing yet, so its charges don't post.", 409);
  const bc = ctx || makeBillingContext(admin, { now });
  const today = await bc.today(c.projectId);
  const predecessor = await predecessorFor(admin, lease, charge);
  const out = await billRecurringCharge(admin, bc, charge, lease, today, { next: true, predecessor, actor });
  if (out.nothing) throw fail("This charge has nothing left to post before its end date.", 409);
  return out;
}
