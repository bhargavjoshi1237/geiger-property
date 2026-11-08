import { emptyResult } from "./contract";
import { makeBillingContext } from "@/lib/billing/context";
import { BILLABLE_STATUSES, activeSteps, currentRent } from "@/lib/billing/rent";
import { loadRentLedger } from "@/lib/billing/post";
import { billLeaseThrough, ensureRentAccount, ensureRentSteps, loadRentSteps, syncCurrentRent } from "@/lib/billing/service";

// Scheduled billing (CORE-01): per project on its business date, sync each live lease's rent and bill due periods (3 months back at most, never before billingStartsOn); CORE-03/05/14 add charges, concessions and plan installments after rent.

const PAGE = 1000;
const CHUNK = 150;

async function billableLeases(admin, { projectId, leaseIds }) {
  const out = [];
  const statuses = [...BILLABLE_STATUSES, "Renewed"];
  const ids = leaseIds?.length ? leaseIds : [null];
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (let from = 0; ; from += PAGE) {
      let q = admin.from("leases").select("*").is("deleted_at", null).in("status", statuses).order("id").range(from, from + PAGE - 1);
      if (projectId) q = q.eq("project_id", projectId);
      if (leaseIds?.length) q = q.in("id", ids.slice(i, i + CHUNK));
      const { data, error } = await q;
      if (error) throw new Error(`leases: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

// Lease ids that already have a live rent account.
async function leasesWithRentAccounts(admin, leaseIds) {
  const out = new Set();
  for (let i = 0; i < leaseIds.length; i += CHUNK) {
    const { data, error } = await admin.from("rent_accounts").select("lease_id").in("lease_id", leaseIds.slice(i, i + CHUNK)).is("deleted_at", null);
    if (error) throw new Error(`rent accounts: ${error.message}`);
    for (const r of data || []) out.add(r.lease_id);
  }
  return out;
}

// Bill one project's leases → adds counts to `res`.
async function billProject(admin, ctx, projectId, leases, res) {
  const settings = await ctx.settings(projectId);
  if (settings.jobsPaused || !settings.autoBillRent) {
    res.skipped += leases.length;
    return;
  }
  const live = await ctx.goLiveSettings(projectId);
  const today = await ctx.today(projectId);
  await ctx.loadProperties(leases.map((l) => l.property_id));
  const [stepsByLease, ledger, accounts] = await Promise.all([
    loadRentSteps(admin, leases.map((l) => l.id)),
    loadRentLedger(admin, projectId, leases.map((l) => l.id)),
    leasesWithRentAccounts(admin, leases.map((l) => l.id)),
  ]);
  for (const lease of leases) {
    res.processed += 1;
    try {
      let steps = stepsByLease.get(lease.id) || [];
      if (!activeSteps(steps).length) steps = await ensureRentSteps(admin, lease);
      if (lease.status !== "Renewed" && !accounts.has(lease.id)) await ensureRentAccount(admin, lease);
      if (currentRent(steps, today) !== Number(lease.rent)) await syncCurrentRent(admin, lease, today);
      const out = await billLeaseThrough(admin, ctx, lease, { steps, ledger, today, settings: live, auto: true });
      const created = out.entries.filter((e) => e.created).length;
      res.created += created;
      if (!created) res.skipped += 1;
    } catch (e) {
      res.errors.push(`lease ${lease.name || lease.id}: ${e.message}`);
    }
  }
}

// opts.leaseIds narrows a run to some leases (tests and support tools); cron and "Run now" bill every live lease.
export async function runBilling({ admin, now = new Date(), projectId = null, leaseIds = null }) {
  const res = emptyResult();
  const ctx = makeBillingContext(admin, { now });
  const leases = await billableLeases(admin, { projectId, leaseIds });
  const byProject = new Map();
  for (const l of leases) {
    if (!l.project_id) continue;
    byProject.set(l.project_id, [...(byProject.get(l.project_id) || []), l]);
  }
  for (const [pid, group] of byProject) {
    try {
      await billProject(admin, ctx, pid, group, res);
    } catch (e) {
      res.errors.push(`billing (project ${pid}): ${e.message}`);
    }
  }
  return res;
}

export const billingJob = {
  key: "billing",
  label: "Bill rent",
  description: "Bills each live lease's rent from its rent schedule on the due date (prorated first month, mid-month changes split by day), catching up to 3 months and truing up changed months.",
  schedule: "5 10 * * *",
  run: runBilling,
};
