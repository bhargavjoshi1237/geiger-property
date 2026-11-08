import "server-only";
import { buildCharge, buildCredit } from "@/lib/ledger/postings";
import { makeBillingContext } from "./context";
import { maxDate, minDate, periodLabel, periodOf, round2 } from "./periods";
import { billingWindow, leaseFacts } from "./rent";
import { fail, openOnEntries, postOnce } from "./post";
import { MAX_CATCH_UP, chargeFacts, chargeKey, endAdjustments, parseChargeKey, planCharge, postedOccurrence } from "./charge_plan";
import { billsWithRent, frequencyOf } from "./frequency";

// Server-only recurring-charge billing (CORE-03): each due occurrence posts once under rc:<charge>:<date> (Dr AR / Cr the charge's GL, else Other Income), an end date trues up what was billed past it under rc-adj:<charge>:<date>:<n>, then next_date advances and finished charges end.

const CHUNK = 150;
const POSTINGS_KEPT = 120;
const ENTRY_COLS = "id, entry_date, source_type, status, reversal_of, idempotency_key, total, metadata, lease_id, tenant_id, unit_id, property_id, deleted_at";

const isLive = (e) => !e.deleted_at && e.status === "posted" && !e.reversal_of;
const methodOf = (policies) => (policies?.prorationMethod === "thirty" ? "thirty" : "actual");

export async function loadCharge(admin, chargeId, projectId) {
  const { data, error } = await admin.from("recurring_charges").select("*").eq("id", chargeId).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted_at) throw fail("Recurring charge not found.", 404);
  return data;
}

// rc: / rc-adj: entries per charge → Map chargeId → Map occurrence date → { main, billed, maxAdj, adjusted } (maxAdj counts every key ever used).
export async function loadChargeLedger(admin, projectId, chargeIds) {
  const ids = [...new Set((chargeIds || []).filter(Boolean))];
  const out = new Map(ids.map((id) => [id, new Map()]));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin
      .from("ledger_entries")
      .select(ENTRY_COLS)
      .eq("project_id", projectId)
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

// The income account an occurrence credits: the charge's GL when it is in the chart, else Other Income.
function glFor(acct, glAccountId) {
  if (glAccountId && acct.byId.has(glAccountId)) return glAccountId;
  const other = acct.byKey.get("other_income");
  if (!other) throw fail("No Other Income account in the chart of accounts.");
  return other.id;
}

const occurrenceMemo = (c, occ) => {
  const when = occ.basis === "month" ? periodLabel(occ.period) : occ.from === occ.to ? occ.from : `${occ.from} – ${occ.to}`;
  return `${c.name} · ${when}${occ.amount !== occ.rate ? " (prorated)" : ""}`;
};

// Post true-ups for occurrences an end date cuts into (credit Dr GL / Cr AR applied to the occurrence) or no longer cuts into (charge).
async function postEndAdjustments(admin, ctx, c, slots, { end, today, acct, method, createdBy, policies }) {
  const posted = [];
  for (const [date, slot] of slots || []) {
    if (!slot.main || !isLive(slot.main)) continue;
    const occ = postedOccurrence(c, slot.main, { dueDay: policies.rentDueDay });
    if (!slot.adjusted && (!end || occ.to <= end)) continue;
    posted.push({ date, entryId: slot.main.id, occ, billed: slot.billed, maxAdj: slot.maxAdj, main: slot.main });
  }
  const entries = [];
  for (const adj of endAdjustments(c, posted, { end, method })) {
    const p = posted.find((x) => x.date === adj.date);
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

// Bill one charge on its lease: every occurrence due through `today` (or opts.next: only the next one, due or not), end-date true-ups, then next_date / status → { chargeId, entries, next, status, skipped? }.
export async function billRecurringCharge(admin, ctx, charge, lease, today, opts = {}) {
  const c = chargeFacts(charge);
  const out = { chargeId: c.id, entries: [], next: c.nextDate, status: c.status };
  if (c.status !== "Active") return { ...out, skipped: "not active" };
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
  const plan = planCharge(c, {
    window: { start, end: window.end },
    through: opts.next ? null : today,
    limit: opts.next ? 1 : MAX_CATCH_UP,
    dueDay: policies.rentDueDay,
    method,
  });
  if (plan.error) throw fail(plan.error);

  const acct = await ctx.accounts(c.projectId);
  const gl = glFor(acct, c.glAccountId);
  const createdBy = opts.actor?.id || null;
  let next = plan.next;
  let status = plan.status;
  for (const occ of plan.occurrences) {
    // Period close (CORE-40): stop before a closed period and pick up from this occurrence later.
    if (!(await ctx.isPeriodOpen(c.projectId, periodOf(occ.date)))) {
      next = occ.scheduled;
      status = c.status;
      break;
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

  // End-date / move-out true-ups for occurrences already posted.
  const end = minDate(c.endsOn || null, window.end || null);
  if (end || c.metadata.endAdjusted) {
    const slots = opts.ledger?.get(c.id) || (await loadChargeLedger(admin, c.projectId, [c.id])).get(c.id);
    out.entries.push(...(await postEndAdjustments(admin, ctx, c, slots, { end, today, acct, method, createdBy, policies })));
  }

  await saveProgress(admin, c, { next, status, entries: out.entries, today, anchorDay: plan.anchorDay });
  return { ...out, next, status };
}

// Advance next_date / status (only if nobody moved them since this read) and log postings on the charge (Posting tab).
async function saveProgress(admin, c, { next, status, entries, today, anchorDay }) {
  if (next !== c.nextDate || status !== c.status) {
    const { error } = await admin.from("recurring_charges").update({ next_date: next, status }).eq("id", c.id).eq("project_id", c.projectId).eq("next_date", c.nextDate).eq("status", c.status);
    if (error) throw new Error(`recurring charge: ${error.message}`);
  }
  const postings = Array.isArray(c.metadata.postings) ? [...c.metadata.postings] : [];
  const known = new Set(postings.map((p) => p.entryId));
  const fresh = entries.filter((e) => !known.has(e.entryId));
  const patch = {};
  if (fresh.length) {
    // Newest first, as the Posting tab lists them.
    for (const e of fresh) {
      postings.unshift({ id: e.entryId, entryId: e.entryId, date: e.date, amount: e.amount, postedAt: today, ...(e.key.startsWith("rc-adj:") ? { kind: "adjustment" } : {}) });
    }
    patch.postings = postings.slice(0, POSTINGS_KEPT);
  }
  if (entries.some((e) => e.key.startsWith("rc-adj:"))) patch.endAdjusted = true;
  // Keep a month-end anchor (Jan 31 → Feb 28 → Mar 31) only while next_date sits clamped below it.
  const day = Number(String(next).slice(8, 10)) || 0;
  const anchor = anchorDay && anchorDay > day ? anchorDay : null;
  const anchored = frequencyOf(c.frequency)?.months && !billsWithRent(c.frequency, c.billWithRent);
  if (anchored && (c.metadata.anchorDay ?? null) !== anchor) patch.anchorDay = anchor;
  if (!Object.keys(patch).length) return;
  const { error } = await admin.rpc("merge_meta", { p_table: "recurring_charges", p_id: c.id, p_patch: patch });
  if (error) throw new Error(`recurring charge: ${error.message}`);
}

// The billing job's charge step for one project's billable leases → the posted entries; adds counts to `res`.
export async function billLeaseCharges(admin, ctx, projectId, leases, { today, res = { processed: 0, created: 0, skipped: 0, errors: [] } }) {
  const byId = new Map(leases.map((l) => [l.id, l]));
  const charges = [];
  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin
      .from("recurring_charges")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "Active")
      .is("deleted_at", null)
      .in("lease_id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(`recurring charges: ${error.message}`);
    charges.push(...(data || []));
  }
  // Due charges, plus any an end date (its own or the lease's) may have cut into.
  const ends = (r) => r.ends_on || billingWindow(byId.get(r.lease_id)).end || r.metadata?.endAdjusted;
  const work = charges.filter((r) => (r.next_date && r.next_date <= today) || ends(r));
  const entries = [];
  if (!work.length) return entries;
  const ledger = await loadChargeLedger(admin, projectId, work.filter(ends).map((r) => r.id));
  for (const row of work) {
    res.processed += 1;
    try {
      const lease = byId.get(row.lease_id);
      const predecessor = await predecessorFor(admin, lease, row, byId);
      const out = await billRecurringCharge(admin, ctx, row, lease, today, { ledger, predecessor, auto: true });
      entries.push(...out.entries);
      const created = out.entries.filter((e) => e.created).length;
      res.created += created;
      if (!created) res.skipped += 1;
    } catch (e) {
      res.errors.push(`charge ${row.name || row.id}: ${e.message}`);
    }
  }
  return entries;
}

// The lease a renewal replaced, when the charge's next occurrence predates the renewal's start.
async function predecessorFor(admin, lease, row, byId = new Map()) {
  const l = leaseFacts(lease);
  if (!l?.renewalOfId || !row.next_date || row.next_date >= (billingWindow(lease).start || "")) return null;
  if (byId.has(l.renewalOfId)) return byId.get(l.renewalOfId);
  const { data, error } = await admin.from("leases").select("*").eq("id", l.renewalOfId).eq("project_id", l.projectId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

// "Post next charge": post the charge's next occurrence now, due or not, and advance it (accounting.post).
export async function postNextCharge(admin, charge, { actor, ctx, now } = {}) {
  const c = chargeFacts(charge);
  if (c.status !== "Active") throw fail(c.status === "Ended" ? "This charge has ended." : "Resume the charge (status Active) before posting it.", 409);
  if (!(c.amount > 0)) throw fail("Enter the charge amount first.");
  if (!c.leaseId) throw fail("Link the charge to a lease first — charges post to a lease's ledger.");
  const { data: lease, error } = await admin.from("leases").select("*").eq("id", c.leaseId).eq("project_id", c.projectId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lease) throw fail("The charge's lease wasn't found.", 404);
  if (!billingWindow(lease).billable) throw fail("The lease isn't billing yet, so its charges don't post.", 409);
  const bc = ctx || makeBillingContext(admin, { now });
  const today = await bc.today(c.projectId);
  const predecessor = await predecessorFor(admin, lease, charge);
  const out = await billRecurringCharge(admin, bc, charge, lease, today, { next: true, predecessor, actor });
  if (!out.entries.some((e) => e.kind === "charge" && !e.key.startsWith("rc-adj:"))) {
    throw fail(out.status === "Ended" ? "This charge has nothing left to post — it ended." : "Nothing to post for this charge.", 409);
  }
  return out;
}
