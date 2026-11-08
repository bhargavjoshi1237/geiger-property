import { emptyResult, projectError } from "./contract";
import { forProjectOrAll } from "@/lib/supabase/scope";
import { makeBillingContext } from "@/lib/billing/context";
import { addDays, addMonths, businessDate } from "@/lib/billing/periods";
import { BILLABLE_STATUSES, ENDED_STATUSES, billingWindow, billsWithin } from "@/lib/billing/rent";
import { loadHapLedger, loadRentLedger } from "@/lib/billing/post";
import { loadRentSteps } from "@/lib/billing/steps";
import { billLeaseDue } from "@/lib/billing/service";
import { billLeaseCharges } from "@/lib/billing/charges";
import { applyHoldovers } from "@/lib/billing/holdover";

// Scheduled billing per project on its business date: holdovers (CORE-02), recurring charges (CORE-03), then rent (CORE-01: 3 months back at most, never before billing start) and the Renewed-lease sweep; CORE-05/14 add steps.

const PAGE = 1000;
const CHUNK = 150;

// Live, Renewed and accepted-renewal (Pending) leases whose billing window is open, and Ended / Terminated ones whose move-out falls in the catch-up window (CORE-02).
async function billableLeases(admin, { projectId, leaseIds, now }) {
  const out = [];
  const statuses = [...BILLABLE_STATUSES, "Renewed", "Pending", ...ENDED_STATUSES];
  // A day of slack for time zones; billsWithin and the period floors then apply each project's business date.
  const since = addDays(addMonths(businessDate(now, "UTC"), -3), -1);
  const ended = `(${ENDED_STATUSES.join(",")})`;
  const ids = leaseIds?.length ? leaseIds : [null];
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (let from = 0; ; from += PAGE) {
      let q = forProjectOrAll(admin.from("leases").select("*").is("deleted_at", null).in("status", statuses).order("id").range(from, from + PAGE - 1), projectId);
      q = q.or(`status.not.in.${ended},move_out_date.gte.${since},metadata->>endedOn.gte.${since}`);
      if (leaseIds?.length) q = q.in("id", ids.slice(i, i + CHUNK));
      const { data, error } = await q;
      if (error) throw new Error(`leases: ${error.message}`);
      out.push(...(data || []).filter((l) => billingWindow(l).billable));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

// Rows of `table` whose `col` is in `values` (chunked).
async function rowsIn(admin, table, cols, col, values) {
  const out = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const { data, error } = await admin.from(table).select(cols).in(col, values.slice(i, i + CHUNK)).is("deleted_at", null);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

// Renewed leases worth sweeping: billing ended within the catch-up window, or AR still on them (one batched balance read).
async function sweepable(admin, projectId, renewed, today) {
  const since = addMonths(today, -3);
  const out = new Set(renewed.filter((l) => (billingWindow(l).end || "") >= since).map((l) => l.id));
  const rest = renewed.filter((l) => !out.has(l.id)).map((l) => l.id);
  for (let i = 0; i < rest.length; i += CHUNK) {
    const { data, error } = await admin
      .from("ledger_party_balances")
      .select("dimension_id, receivable")
      .eq("project_id", projectId)
      .eq("dimension", "lease")
      .in("dimension_id", rest.slice(i, i + CHUNK));
    if (error) throw new Error(`lease balances: ${error.message}`);
    for (const r of data || []) if (Math.abs(Number(r.receivable) || 0) > 0.004) out.add(r.dimension_id);
  }
  return out;
}

// Bill one project's leases: holdovers, recurring charges, then rent unless autoBillRent is off (its Renewed-lease sweep then carries both); jobsPaused stops all.
async function billProject(admin, ctx, projectId, all, res) {
  const settings = await ctx.settings(projectId);
  if (settings.jobsPaused) {
    res.skipped += all.length;
    return;
  }
  const today = await ctx.today(projectId);
  const leases = all.filter((l) => billsWithin(l, today));
  // Holdovers first, so a month-to-month premium bills in this run; a failure here doesn't stop billing.
  await applyHoldovers(admin, ctx, projectId, leases, { today, res }).catch((e) => res.errors.push(projectError(projectId, `holdovers: ${e.message}`)));
  // Only rent billing records the go-live date (CORE-01); with rent off, charges just read it.
  const live = settings.autoBillRent ? await ctx.goLiveSettings(projectId) : settings;
  await billLeaseCharges(admin, ctx, projectId, leases, { today, settings: live, res });
  if (settings.autoBillRent) await billRent(admin, ctx, projectId, leases, res);
  else res.skipped += leases.length;
}

async function billRent(admin, ctx, projectId, leases, res) {
  const live = await ctx.goLiveSettings(projectId);
  const today = await ctx.today(projectId);
  const ids = leases.map((l) => l.id);
  const sweep = await sweepable(admin, projectId, leases.filter((l) => l.status === "Renewed"), today);
  await ctx.loadProperties(leases.map((l) => l.property_id));
  // Voucher splits (HOUS-01) read the lease fields; HOUS-03 loads its contract terms here as hapIndex (loadHapIndex, once per project).
  const hapIndex = new Map();
  const [stepsByLease, ledger, hapLedger, accounts, successors] = await Promise.all([
    loadRentSteps(admin, ids),
    loadRentLedger(admin, projectId, ids),
    loadHapLedger(admin, projectId, ids),
    rowsIn(admin, "rent_accounts", "lease_id", "lease_id", ids),
    rowsIn(admin, "leases", "*", "renewal_of_id", [...sweep]),
  ]);
  const hasAccount = new Set(accounts.map((a) => a.lease_id));
  const successorOf = new Map();
  for (const s of successors.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    if (!successorOf.has(s.renewal_of_id)) successorOf.set(s.renewal_of_id, s);
  }
  for (const lease of leases) {
    res.processed += 1;
    try {
      const out = await billLeaseDue(admin, ctx, lease, {
        today,
        settings: live,
        ledger,
        hapLedger,
        hapIndex,
        steps: stepsByLease.get(lease.id) || [],
        hasAccount: hasAccount.has(lease.id),
        successor: successorOf.get(lease.id) || null,
      });
      const created = out.entries.filter((e) => e.created).length;
      res.created += created;
      if (!created) res.skipped += 1;
    } catch (e) {
      res.errors.push(projectError(projectId, `lease ${lease.name || lease.id}: ${e.message}`));
    }
  }
}

// opts.leaseIds narrows a run to some leases and opts.settings overrides billing_settings in memory (tests and support tools); cron and "Run now" bill every billable lease.
export async function runBilling({ admin, now = new Date(), projectId = null, leaseIds = null, settings = null }) {
  const res = emptyResult();
  const ctx = makeBillingContext(admin, { now, settings });
  const leases = await billableLeases(admin, { projectId, leaseIds, now });
  const byProject = new Map();
  for (const l of leases) {
    if (!l.project_id) continue;
    byProject.set(l.project_id, [...(byProject.get(l.project_id) || []), l]);
  }
  for (const [pid, group] of byProject) {
    try {
      await billProject(admin, ctx, pid, group, res);
    } catch (e) {
      res.errors.push(projectError(pid, `billing: ${e.message}`));
    }
  }
  return res;
}

export const billingJob = {
  key: "billing",
  label: "Bill rent & charges",
  description:
    "Bills each live lease's rent from its rent schedule on the due date (prorated first and move-out months, mid-month changes split by day), catching up to 3 months, truing up changed months and moving a renewed lease's open balance to the new lease. Billing stops at the move-out date: rent and charges billed past it are credited. A fixed lease past its term end with no renewal rolls to month-to-month (or is flagged Holdover). Voucher leases bill the tenant's share and the housing authority's share separately. Recurring charges post first: every due occurrence (catching up missed ones), with end-date true-ups.",
  schedule: "5 10 * * *",
  run: runBilling,
};
