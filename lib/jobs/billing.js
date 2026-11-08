import { emptyResult } from "./contract";
import { makeBillingContext } from "@/lib/billing/context";
import { BILLABLE_STATUSES, billingWindow } from "@/lib/billing/rent";
import { loadRentLedger } from "@/lib/billing/post";
import { loadRentSteps } from "@/lib/billing/steps";
import { billLeaseDue } from "@/lib/billing/service";

// Scheduled billing (CORE-01): per project on its business date, bill each billable lease (3 months back at most, never before its billing start) and sweep Renewed leases' open AR to the successor; CORE-03/05/14 add steps after rent.

const PAGE = 1000;
const CHUNK = 150;

// Live, Renewed and accepted-renewal (Pending) leases whose billing window is open.
async function billableLeases(admin, { projectId, leaseIds }) {
  const out = [];
  const statuses = [...BILLABLE_STATUSES, "Renewed", "Pending"];
  const ids = leaseIds?.length ? leaseIds : [null];
  for (let i = 0; i < ids.length; i += CHUNK) {
    for (let from = 0; ; from += PAGE) {
      let q = admin.from("leases").select("*").is("deleted_at", null).in("status", statuses).order("id").range(from, from + PAGE - 1);
      if (projectId) q = q.eq("project_id", projectId);
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

// Bill one project's leases → adds counts to `res`.
async function billProject(admin, ctx, projectId, leases, res) {
  const settings = await ctx.settings(projectId);
  if (settings.jobsPaused || !settings.autoBillRent) {
    res.skipped += leases.length;
    return;
  }
  const live = await ctx.goLiveSettings(projectId);
  const today = await ctx.today(projectId);
  const ids = leases.map((l) => l.id);
  const renewed = leases.filter((l) => l.status === "Renewed").map((l) => l.id);
  await ctx.loadProperties(leases.map((l) => l.property_id));
  const [stepsByLease, ledger, accounts, successors] = await Promise.all([
    loadRentSteps(admin, ids),
    loadRentLedger(admin, projectId, ids),
    rowsIn(admin, "rent_accounts", "lease_id", "lease_id", ids),
    rowsIn(admin, "leases", "*", "renewal_of_id", renewed),
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
        steps: stepsByLease.get(lease.id) || [],
        hasAccount: hasAccount.has(lease.id),
        successor: successorOf.get(lease.id) || null,
      });
      const created = out.entries.filter((e) => e.created).length;
      res.created += created;
      if (!created) res.skipped += 1;
    } catch (e) {
      res.errors.push(`lease ${lease.name || lease.id}: ${e.message}`);
    }
  }
}

// opts.leaseIds narrows a run to some leases (tests and support tools); cron and "Run now" bill every billable lease.
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
  description:
    "Bills each live lease's rent from its rent schedule on the due date (prorated first month, mid-month changes split by day), catching up to 3 months, truing up changed months and moving a renewed lease's open balance to the new lease.",
  schedule: "5 10 * * *",
  run: runBilling,
};
