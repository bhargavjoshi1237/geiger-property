import "server-only";
import { makeBillingContext } from "./context";
import { isoDate, periodOf, round2 } from "./periods";
import {
  PRE_LIVE_STATUSES,
  STEP_SOURCES,
  activeSteps,
  billingStartFor,
  billingWindow,
  chargeDateFor,
  initialStepFor,
  leaseFacts,
  projectSteps,
  resolveStepAmount,
} from "./rent";
import { billLeaseRent, fail, loadHapLedger, loadRentLedger } from "./post";

// Server-only rent schedule (CORE-01): a lease's dated rent steps, leases.rent synced from them, and true-ups when they change.

const CHUNK = 150;
const UNIQUE = "23505";

// Active rent steps per lease → Map leaseId → rows, oldest first.
export async function loadRentSteps(admin, leaseIds) {
  const ids = [...new Set((leaseIds || []).filter(Boolean))];
  const out = new Map(ids.map((id) => [id, []]));
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin
      .from("lease_rent_steps")
      .select("*")
      .in("lease_id", ids.slice(i, i + CHUNK))
      .is("deleted_at", null)
      .eq("status", "active")
      .order("effective_date", { ascending: true });
    if (error) throw new Error(`rent steps: ${error.message}`);
    for (const r of data || []) out.get(r.lease_id)?.push(r);
  }
  return out;
}

export const stepRow = (lease, s, actor) => ({
  project_id: leaseFacts(lease).projectId,
  lease_id: lease.id,
  effective_date: s.effectiveDate,
  amount: round2(s.amount),
  change_mode: s.changeMode || "amount",
  change_value: s.changeValue ?? round2(s.amount),
  source: s.source || "manual",
  note: s.note || null,
  created_by: actor?.id || null,
  metadata: s.metadata || {},
});

// A lease's steps, creating the initial step from its current rent when it has none.
export async function ensureRentSteps(admin, lease, { actor } = {}) {
  const rows = (await loadRentSteps(admin, [lease.id])).get(lease.id) || [];
  if (rows.length) return rows;
  const { error } = await admin.from("lease_rent_steps").insert(stepRow(lease, { ...initialStepFor(lease), metadata: { auto: true } }, actor));
  if (error && error.code !== UNIQUE) throw new Error(`rent steps: ${error.message}`);
  return (await loadRentSteps(admin, [lease.id])).get(lease.id) || [];
}

// leases.rent ← the step in force on asOf (property.lease_sync_current_rent is its only writer).
export async function syncCurrentRent(admin, lease, asOf) {
  const { data, error } = await admin.rpc("lease_sync_current_rent", { p_lease_id: lease.id, p_as_of: asOf });
  if (error) throw new Error(`sync rent: ${error.message}`);
  const rent = Number(data) || 0;
  lease.rent = rent;
  return rent;
}

// Periods from `from` billed to the tenant or the housing authority (a HAP-only month has no tenant rent, HOUS-01), never before the billing start.
export function billedPeriodsIn(rentByPeriod, hapByPeriod, { from, startsOn, window, dueDay }) {
  const billed = (byPeriod) => [...(byPeriod?.entries() || [])].filter(([, sum]) => sum.entries.length).map(([p]) => p);
  return [...new Set([...billed(rentByPeriod), ...billed(hapByPeriod)])]
    .filter((p) => p >= from)
    .filter((p) => !startsOn || chargeDateFor(p, window, dueDay) >= startsOn)
    .sort();
}

// Billed periods from `from` on that a schedule change may true up.
async function billedPeriodsFrom(admin, ctx, lease, from) {
  const l = leaseFacts(lease);
  const [ledger, hapLedger, settings, policies] = await Promise.all([
    loadRentLedger(admin, l.projectId, [l.id]),
    loadHapLedger(admin, l.projectId, [l.id]),
    ctx.goLiveSettings(l.projectId),
    ctx.policies(lease),
  ]);
  const periods = billedPeriodsIn(ledger.get(l.id), hapLedger.get(l.id), { from, startsOn: billingStartFor(lease, settings), window: billingWindow(lease), dueDay: policies.rentDueDay });
  return { ledger, hapLedger, periods, policies };
}

// After a schedule change: re-project percent / premium steps, sync leases.rent, true up open billed periods from `from`.
async function applyScheduleChange(admin, ctx, lease, from, actor) {
  const l = leaseFacts(lease);
  const current = (await loadRentSteps(admin, [l.id])).get(l.id) || [];
  for (const s of projectSteps(current).filter((x) => x.changed)) {
    const { error } = await admin.from("lease_rent_steps").update({ amount: s.amount }).eq("id", s.id);
    if (error) throw new Error(`rent steps: ${error.message}`);
  }
  const steps = (await loadRentSteps(admin, [l.id])).get(l.id) || [];
  const today = await ctx.today(l.projectId);
  const rent = await syncCurrentRent(admin, lease, today);
  if (!billingWindow(lease).billable) return { steps, rent, entries: [] };
  const { ledger, hapLedger, periods, policies } = await billedPeriodsFrom(admin, ctx, lease, from);
  const entries = [];
  for (const period of periods) {
    const r = await billLeaseRent(admin, ctx, lease, period, { steps, ledger, hapLedger, today, policies, actor });
    entries.push(...r.entries);
  }
  return { steps, rent, entries };
}

// Add a dated rent step (step.replaces swaps one out); Draft/Pending leases edit their initial rent in place (source "initial").
export async function addRentStep(admin, lease, step, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  const source = STEP_SOURCES.includes(step.source) ? step.source : "manual";
  const steps = await ensureRentSteps(admin, lease, { actor });
  const preLive = PRE_LIVE_STATUSES.includes(l.status);

  if (source === "initial") {
    if (!preLive) throw fail("A live lease's rent changes with a dated step — add one instead of editing the initial rent.");
    const amount = round2(step.amount ?? step.changeValue);
    if (!(amount >= 0)) throw fail("Enter the monthly rent.");
    const first = activeSteps(steps)[0];
    const date = isoDate(step.effectiveDate) || billingWindow(lease).start || first.effectiveDate;
    const patch = { amount, change_mode: "amount", change_value: amount, effective_date: date };
    const { error } = await admin.from("lease_rent_steps").update(patch).eq("id", first.id);
    if (error) throw fail(error.code === UNIQUE ? "Another rent step already starts on that date." : error.message);
    const out = await applyScheduleChange(admin, c, lease, "0000-00", actor);
    return { step: { ...first, ...patch }, ...out };
  }

  const live = activeSteps(steps);
  const replaced = step.replaces ? live.find((s) => s.id === step.replaces) : null;
  if (step.replaces && !replaced) throw fail("That rent step was already changed — reload and try again.", 409);
  const resolved = resolveStepAmount(steps, { ...step, source });
  if (resolved.error) throw fail(resolved.error);
  const date = isoDate(step.effectiveDate);
  if (live.some((s) => s.effectiveDate === date && s.id !== replaced?.id)) throw fail(`The rent already changes on ${date}. Edit that step instead.`, 409);
  if (replaced) {
    const { error } = await admin
      .from("lease_rent_steps")
      .update({ status: "cancelled", metadata: { ...replaced.metadata, replacedOn: new Date().toISOString(), replacedBy: actor?.id || null } })
      .eq("id", replaced.id);
    if (error) throw new Error(error.message);
  }
  const metadata = { ...(resolved.premium !== undefined ? { premium: resolved.premium } : {}), ...(replaced ? { replaces: replaced.id } : {}) };
  const row = stepRow(lease, { effectiveDate: date, amount: resolved.amount, changeMode: resolved.changeMode, changeValue: resolved.changeValue, source, note: step.note, metadata }, actor);
  const { data: inserted, error } = await admin.from("lease_rent_steps").insert(row).select("*").single();
  if (error) {
    if (replaced) await admin.from("lease_rent_steps").update({ status: "active" }).eq("id", replaced.id);
    throw fail(error.code === UNIQUE ? `The rent already changes on ${date}.` : error.message);
  }
  const from = periodOf(replaced && replaced.effectiveDate < date ? replaced.effectiveDate : date);
  return { step: inserted, ...(await applyScheduleChange(admin, c, lease, from, actor)) };
}

// Cancel a rent step (never a live lease's first one) and true up what it billed.
export async function cancelRentStep(admin, lease, stepId, { actor, ctx, now } = {}) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  const live = activeSteps(await ensureRentSteps(admin, lease, { actor }));
  const target = live.find((s) => s.id === stepId);
  if (!target) throw fail("That rent step isn't active on this lease.", 404);
  if (live.length === 1) throw fail("A lease needs at least one rent step.");
  if (live[0].id === target.id && !PRE_LIVE_STATUSES.includes(l.status)) {
    throw fail("The first rent step can't be cancelled on a live lease. Replace it with the correct amount instead.");
  }
  const { error } = await admin
    .from("lease_rent_steps")
    .update({ status: "cancelled", metadata: { ...target.metadata, cancelledOn: new Date().toISOString(), cancelledBy: actor?.id || null } })
    .eq("id", target.id);
  if (error) throw new Error(error.message);
  return { step: { ...target, status: "cancelled" }, ...(await applyScheduleChange(admin, c, lease, periodOf(target.effectiveDate), actor)) };
}
