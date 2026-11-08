import "server-only";
import { makeBillingContext } from "./context";
import { maxDate, periodOf } from "./periods";
import {
  BILLABLE_STATUSES,
  activeSteps,
  billablePeriods,
  billingStartFor,
  billingWindow,
  chargeDateFor,
  currentRent,
  firstCharge,
  leaseFacts,
} from "./rent";
import { billLeaseRent, fail, loadRentLedger } from "./post";
import { ensureRentSteps, loadRentSteps, syncCurrentRent } from "./steps";
import { successorOf, transferOpenReceivables } from "./receivables";
import { billLeaseCharges } from "./charges";

// Server-only billing services (CORE-01): the rent account, due-period billing (job, autopay, activation, Bill now); every posting is idempotent.

const UNIQUE = "23505";

export async function loadLease(admin, leaseId, projectId) {
  const { data, error } = await admin.from("leases").select("*").eq("id", leaseId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deleted_at) throw fail("Lease not found.", 404);
  if (!data.project_id || (projectId && data.project_id !== projectId)) throw fail("That lease belongs to another project.", 403);
  return data;
}

// The lease's collection record (autopay, method, collections status, notes), created when missing.
export async function ensureRentAccount(admin, lease, { actor } = {}) {
  const read = async () => {
    const { data, error } = await admin.from("rent_accounts").select("*").eq("lease_id", lease.id).is("deleted_at", null).limit(1);
    if (error) throw new Error(`rent account: ${error.message}`);
    return data?.[0] || null;
  };
  const existing = await read();
  if (existing) return existing;
  const l = leaseFacts(lease);
  let propertyName = "";
  if (l.propertyId) {
    const { data } = await admin.from("properties").select("name").eq("id", l.propertyId).maybeSingle();
    propertyName = data?.name || "";
  }
  const who = [l.unit, l.tenantName].filter(Boolean).join(" — ") || l.name || "Rent account";
  const { error } = await admin.from("rent_accounts").insert({
    project_id: l.projectId,
    name: propertyName ? `${propertyName} · ${who}` : who,
    unit: l.unit || null,
    tenant_name: l.tenantName || null,
    tenant_id: l.tenantId || null,
    unit_id: l.unitId || null,
    property_id: l.propertyId || null,
    lease_id: l.id,
    status: "Current",
    autopay: false,
    created_by: actor?.id || null,
    metadata: { autoCreated: true, ...(propertyName ? { propertyName } : {}) },
  });
  if (error && error.code !== UNIQUE) throw new Error(`rent account: ${error.message}`);
  return read();
}

// Bill a lease's due periods (or opts.periods) → { entries, periods }; at most catchUpMonths (3) back, never before its billing start.
export async function billLeaseThrough(admin, ctx, lease, opts = {}) {
  const projectId = leaseFacts(lease).projectId;
  const window = billingWindow(lease);
  if (!window.billable) return { entries: [], periods: [] };
  const settings = opts.settings || (await ctx.goLiveSettings(projectId));
  const policies = opts.policies || (await ctx.policies(lease));
  const today = opts.today || (await ctx.today(projectId));
  const steps = opts.steps || (await ensureRentSteps(admin, lease, opts));
  const ledger = opts.ledger || (await loadRentLedger(admin, projectId, [lease.id]));
  const periods =
    opts.periods ||
    billablePeriods({
      window,
      dueDay: policies.rentDueDay,
      today,
      billingStartsOn: billingStartFor(lease, settings),
      leadDays: settings.rentPostLeadDays,
      catchUpMonths: opts.catchUpMonths === undefined ? 3 : opts.catchUpMonths,
      includeFirst: Boolean(opts.includeFirst),
    });
  const out = { entries: [], periods: [] };
  for (const period of periods) {
    const r = await billLeaseRent(admin, ctx, lease, period, { steps, ledger, today, policies, actor: opts.actor, auto: opts.auto });
    out.periods.push(r);
    out.entries.push(...r.entries);
  }
  return out;
}

// The billing job's rules for one lease: steps, rent account, current rent, due periods; a Renewed lease then hands its open AR to its successor.
export async function billLeaseDue(admin, ctx, lease, pre = {}) {
  const l = leaseFacts(lease);
  const today = pre.today || (await ctx.today(l.projectId));
  let steps = pre.steps || (await loadRentSteps(admin, [l.id])).get(l.id) || [];
  if (!activeSteps(steps).length) steps = await ensureRentSteps(admin, lease);
  if (l.status !== "Renewed" && !pre.hasAccount) await ensureRentAccount(admin, lease);
  if (currentRent(steps, today) !== Number(lease.rent)) await syncCurrentRent(admin, lease, today);
  const out = await billLeaseThrough(admin, ctx, lease, { steps, ledger: pre.ledger, today, settings: pre.settings, auto: true });
  if (l.status === "Renewed") {
    const next = pre.successor === undefined ? await successorOf(admin, l.id) : pre.successor;
    // Only to a successor that bills (an accepted renewal); a Pending lease from the old browser accept flow keeps nothing.
    if (next && billingWindow(next).billable) out.entries.push(...(await transferOpenReceivables(admin, ctx, lease, next, { date: today })));
  }
  return out;
}

// Autopay bills its lease (and a renewed predecessor) by the job's rules before reading the balance, whatever order the crons run in.
export async function billBeforeCollecting(admin, leaseId, { now, ctx } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const lease = await loadLease(admin, leaseId).catch((e) => {
    if (e.status === 404) return null;
    throw e;
  });
  if (!lease) return { entries: [], skipped: "no lease" };
  const l = leaseFacts(lease);
  const settings = await c.settings(l.projectId);
  if (settings.jobsPaused || !settings.autoBillRent) return { entries: [], skipped: "paused" };
  const live = await c.goLiveSettings(l.projectId);
  const entries = [];
  if (l.renewalOfId) {
    const prior = await loadLease(admin, l.renewalOfId).catch(() => null);
    if (prior?.status === "Renewed") entries.push(...(await billLeaseDue(admin, c, prior, { settings: live, successor: lease })).entries);
  }
  if (billingWindow(lease).billable) entries.push(...(await billLeaseDue(admin, c, lease, { settings: live })).entries);
  // The lease's due recurring charges too (CORE-03), so autopay collects them with the rent.
  if (billingWindow(lease).billable) entries.push(...(await billLeaseCharges(admin, c, l.projectId, [lease], { today: await c.today(l.projectId) })));
  return { entries };
}

// Lease went live: steps, current rent, rent account, a renewal's stragglers, then the first (prorated) period and what's due, within the job's 3-month window; CORE-04 adds the deposit.
export async function onLeaseActivated(admin, lease, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  if (!BILLABLE_STATUSES.includes(l.status)) throw fail("Activate the lease first — it isn't live yet.", 409);
  const steps = await ensureRentSteps(admin, lease, { actor });
  const today = await c.today(l.projectId);
  const rent = await syncCurrentRent(admin, lease, today);
  const rentAccount = await ensureRentAccount(admin, lease, { actor });
  const entries = [];
  if (l.renewalOfId) {
    const prior = await loadLease(admin, l.renewalOfId).catch(() => null);
    if (prior?.status === "Renewed") entries.push(...(await transferOpenReceivables(admin, c, prior, lease, { actor, date: today })));
  }
  const policies = await c.policies(lease);
  const billed = await billLeaseThrough(admin, c, lease, { steps, today, policies, includeFirst: true, actor });
  entries.push(...billed.entries);
  return { entries, rent, rentAccountId: rentAccount?.id || null, firstCharge: firstCharge(lease, steps, policies) };
}

// "Bill now": bill (or true up) a live lease's current period, due date or not; validates before the go-live guard writes anything.
export async function billCurrentPeriod(admin, lease, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  const window = billingWindow(lease);
  if (!window.billable) throw fail("Only live leases bill rent.", 409);
  const today = await c.today(l.projectId);
  const period = periodOf(today);
  if (period < periodOf(window.start) || (window.end && period > periodOf(window.end))) throw fail("This lease has no rent in the current month.", 409);
  const policies = await c.policies(lease);
  const startsOn = billingStartFor(lease, { billingStartsOn: (await c.settings(l.projectId)).billingStartsOn || today });
  if (chargeDateFor(period, window, policies.rentDueDay) < startsOn) throw fail(`Billing starts on ${maxDate(startsOn, window.start)} for this lease.`, 409);
  const settings = await c.goLiveSettings(l.projectId);
  const steps = await ensureRentSteps(admin, lease, { actor });
  await syncCurrentRent(admin, lease, today);
  const out = await billLeaseThrough(admin, c, lease, { steps, today, settings, policies, periods: [period], actor });
  return { period, entries: out.entries, computed: out.periods[0]?.computed ?? 0, billed: out.periods[0]?.billed ?? 0 };
}
