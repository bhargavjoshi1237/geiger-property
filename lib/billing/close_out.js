import "server-only";
import { forProject } from "@/lib/supabase/scope";
import { makeBillingContext } from "./context";
import { isoDate, periodOf } from "./periods";
import { activeSteps, billablePeriods, billingEndOf, billingStartFor, billingWindow, initialStepFor, leaseFacts } from "./rent";
import { billLeaseRent, fail, loadHapLedger, loadRentLedger } from "./post";
import { billedPeriodsIn, ensureRentSteps, loadRentSteps } from "./steps";
import { billLeaseCharges } from "./charges";
import { closeOutSummary, finalRent } from "./lease_end";

// Server-only move-out close-out (CORE-02): bill a lease through its move-out now (rent / HAP true-ups, recurring-charge end credits), or preview it without posting; the billing job posts the same on its next run.

// Run (or preview) the close-out of `lease` through `through` → { through, billing, final, credit, charge, lines, entries, errors, message? }.
async function closeOut(admin, lease, through, { actor, ctx, now, dryRun }) {
  const c = ctx || makeBillingContext(admin, { now });
  const l = leaseFacts(lease);
  const date = isoDate(through) || billingWindow(lease).end;
  if (!date) throw fail("Set the move-out date first.", 409);
  if (l.status === "Renewed") throw fail("This lease was renewed — it bills until the renewal starts. Close out the renewal lease instead.", 409);
  const target = { ...lease, move_out_date: date, moveOutDate: date };
  const window = billingWindow(target);
  const base = { through: date, billing: window.billable, final: null, credit: 0, charge: 0, lines: [], entries: [], errors: [] };
  if (!window.billable) {
    if (window.start && date < window.start) throw fail(`The move-out date is before the lease starts (${window.start}).`, 409);
    return { ...base, message: "This lease isn't billing, so nothing posts." };
  }

  // The move-out date becomes the lease's billing end when it isn't already (CORE-13 / LEAS-17 pass their date in).
  if (!dryRun && billingEndOf(lease) !== date) {
    const { error } = await forProject(admin.from("leases").update({ move_out_date: date }).eq("id", l.id), l.projectId);
    if (error) throw new Error(`lease: ${error.message}`);
    lease.move_out_date = date;
  }

  const today = await c.today(l.projectId);
  const stored = await c.settings(l.projectId);
  const settings = dryRun ? { ...stored, billingStartsOn: stored.billingStartsOn || today } : await c.goLiveSettings(l.projectId);
  const policies = await c.policies(target);
  const rows = dryRun ? (await loadRentSteps(admin, [l.id])).get(l.id) || [] : await ensureRentSteps(admin, target, { actor });
  const steps = activeSteps(rows).length ? rows : [initialStepFor(target)];
  const [ledger, hapLedger] = await Promise.all([loadRentLedger(admin, l.projectId, [l.id]), loadHapLedger(admin, l.projectId, [l.id])]);
  const startsOn = billingStartFor(target, settings);
  const dueDay = policies.rentDueDay;

  // Every billed month from the move-out month on (any age, never before go-live), plus what's due by the job's rules when rent bills automatically.
  const billed = billedPeriodsIn(ledger.get(l.id), hapLedger.get(l.id), { from: periodOf(date), startsOn, window, dueDay });
  const due = settings.autoBillRent ? billablePeriods({ window, dueDay, today, billingStartsOn: startsOn, leadDays: settings.rentPostLeadDays, catchUpMonths: 3 }) : [];
  const periods = [...new Set([...due, ...billed])].sort();
  const rent = [];
  for (const period of periods) {
    rent.push(await billLeaseRent(admin, c, target, period, { steps, ledger, hapLedger, today, policies, actor, dryRun }));
  }

  // Recurring charges stop at min(ends_on, move-out) and credit back past it (rc-adj, CORE-03).
  const res = { processed: 0, created: 0, skipped: 0, errors: [] };
  const charges = await billLeaseCharges(admin, c, l.projectId, [target], { today, settings, res, dryRun });
  const summary = closeOutSummary(rent, charges);
  return {
    ...base,
    final: finalRent(steps, window, policies),
    ...summary,
    entries: dryRun ? [] : [...rent.flatMap((r) => r.entries), ...charges],
    errors: res.errors.map((e) => e?.message || String(e)),
  };
}

// What closing the lease out through `through` would post, without posting (GET …/preview).
export const previewCloseOut = (admin, lease, through, opts = {}) => closeOut(admin, lease, through, { ...opts, dryRun: true });

// Close the lease out through `through` (its move-out date when omitted): records the move-out date, then posts the true-ups now (accounting.post); idempotent.
export const closeOutLease = (admin, lease, through, opts = {}) => closeOut(admin, lease, through, { ...opts, dryRun: false });
