import { closedError, emptyResult, projectError } from "./contract";
import { forProjectOrAll } from "@/lib/supabase/scope";
import { effectivePolicies } from "@/lib/policies";
import { buildManagementFee, round2 } from "@/lib/ledger/postings";
import { loadAccountIndex } from "@/lib/ledger/store";
import { postOnce as postOnceByKey } from "@/lib/billing/post";
import { accrueInterest } from "@/lib/billing/deposits";
import { makeBillingContext } from "@/lib/billing/context";
import { LATE_FEE_STATUSES, isLateFeeLease } from "@/lib/billing/late_fee_rules";
import { assessLateFees, loadLateFeeInputs } from "@/lib/billing/late_fees";
import { isLocked } from "@/lib/ledger/periods";
import { businessDates } from "./business_date";

// Financial jobs (server-only): late fees, management fees, deposit interest; rent and recurring charges bill in lib/jobs/billing.js (CORE-01/03). Every posting is keyed (late:/mgmt:/depint:), so re-runs post nothing.

const PAGE = 1000;
const CHUNK = 150;

const iso = (d) => d.toISOString().slice(0, 10);
const scoped = forProjectOrAll;

// First/last day of the month before `today`.
function previousMonth(today) {
  const [y, m] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 2, 1));
  const end = new Date(Date.UTC(y, m - 1, 0));
  return { from: iso(start), to: iso(end), key: iso(start).slice(0, 7) };
}

async function all(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function byIds(admin, table, ids, cols = "*") {
  const out = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 150) {
    const { data, error } = await admin.from(table).select(cols).in("id", unique.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

// Per-run caches: account index, company policies and business date per project (postings stay property-level, CORE-08).
function makeContext(admin, now = new Date()) {
  const accounts = new Map();
  const locks = new Map();
  let companies = null;
  return {
    today: businessDates(admin, now),
    // The project's lock date (CORE-40), read once per run.
    async lockedThrough(projectId) {
      const key = projectId || "";
      if (!locks.has(key)) {
        const { data, error } = projectId ? await admin.rpc("ledger_locked_through", { p_project: projectId }) : { data: null, error: null };
        if (error) throw new Error(`lock date: ${error.message}`);
        locks.set(key, data ? String(data).slice(0, 10) : null);
      }
      return locks.get(key);
    },
    async accounts(projectId) {
      const key = projectId || "";
      if (!accounts.has(key)) accounts.set(key, await loadAccountIndex(admin, projectId || null));
      return accounts.get(key);
    },
    async company(projectId) {
      if (!companies) {
        const rows = await all(() => admin.from("settings").select("project_id, value").eq("key", "fees_policies").is("deleted_at", null));
        companies = new Map(rows.map((r) => [r.project_id || "", r.value || {}]));
      }
      return companies.get(projectId || "") || {};
    },
  };
}

// Post once per idempotency key (lib/billing/post.js) with this run's cached account index.
const postOnce = async (admin, ctx, projectId, key, build) => postOnceByKey(admin, projectId, key, build, { acct: await ctx.accounts(projectId) });

// --- Late fees --------------------------------------------------------------------

// Leases late fees can run on (live, accepted renewals still Pending), optionally narrowed to `leaseIds`.
async function lateFeeLeases(admin, { projectId, leaseIds }) {
  const out = [];
  const ids = leaseIds?.length ? leaseIds : [null];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await all(() => {
      let q = scoped(admin.from("leases").select("*").is("deleted_at", null).in("status", LATE_FEE_STATUSES).order("id"), projectId);
      if (leaseIds?.length) q = q.in("id", ids.slice(i, i + CHUNK));
      return q;
    });
    out.push(...rows.filter(isLateFeeLease));
  }
  return out;
}

// Per project on its business date: each lease's rent months accrue toward the policy target (CORE-06); opts.leaseIds narrows a run (tests and support tools, as runBilling).
async function runLateFees({ admin, now = new Date(), projectId = null, leaseIds = null }) {
  const res = emptyResult();
  const ctx = makeBillingContext(admin, { now });
  const byProject = new Map();
  for (const l of await lateFeeLeases(admin, { projectId, leaseIds })) {
    if (l.project_id) byProject.set(l.project_id, [...(byProject.get(l.project_id) || []), l]);
  }
  for (const [pid, group] of byProject) {
    try {
      const today = await ctx.today(pid);
      // Period close (CORE-40): a business date in a closed period posts nothing and records why, once per project.
      if (!(await ctx.isDateOpen(pid, today))) {
        res.skipped += group.length;
        res.errors.push(projectError(pid, closedError("late fees", today, await ctx.lockedThrough(pid))));
        continue;
      }
      const inputs = await loadLateFeeInputs(admin, ctx, pid, group);
      for (const lease of group) {
        res.processed += 1;
        try {
          const out = await assessLateFees(admin, ctx, lease, today, { inputs, notify: true, auto: true });
          const created = out.entries.filter((e) => e.created).length;
          res.created += created;
          if (!created) res.skipped += 1;
        } catch (e) {
          res.errors.push(projectError(pid, `late fees ${lease.name || lease.id}: ${e.message}`));
        }
      }
    } catch (e) {
      res.errors.push(projectError(pid, `late fees: ${e.message}`));
    }
  }
  return res;
}

// --- Management fees ----------------------------------------------------------------

// Last month's collected rent per property (cash lines of payment entries) ×
// the management fee policy, posted once per property per month.
async function runManagementFees({ admin, now, projectId }) {
  const res = emptyResult();
  const ctx = makeContext(admin, now);
  // The month before the project's business date (scheduled runs are one project each; an all-projects call uses UTC).
  const period = previousMonth(await ctx.today(projectId));

  const payments = await all(() =>
    scoped(
      admin
        .from("ledger_entries")
        .select("id, project_id")
        .is("deleted_at", null)
        .eq("source_type", "payment")
        .gte("entry_date", period.from)
        .lte("entry_date", period.to),
      projectId,
    ),
  );
  if (!payments.length) return res;
  const lines = [];
  const ids = payments.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await admin.from("ledger_lines").select("*").in("entry_id", ids.slice(i, i + 150)).is("deleted_at", null);
    if (error) throw new Error(error.message);
    lines.push(...(data || []));
  }

  // Collected cash per project × property.
  const collected = new Map();
  for (const raw of lines) {
    if (!raw.property_id) continue;
    const acct = await ctx.accounts(raw.project_id || null);
    const a = acct.byId.get(raw.gl_account_id);
    if (!a || a.subtype !== "cash") continue;
    const key = `${raw.project_id || ""}|${raw.property_id}`;
    collected.set(key, (collected.get(key) || 0) + Number(raw.debit) - Number(raw.credit));
  }
  const properties = new Map(
    (await byIds(admin, "properties", [...collected.keys()].map((k) => k.split("|")[1]), "id, name, metadata")).map((p) => [p.id, p]),
  );

  const reported = new Set();
  for (const [key, amount] of collected) {
    res.processed += 1;
    const [pid, propertyId] = key.split("|");
    const project = pid || null;
    try {
      // Period close (CORE-40): the fee is dated the month end; a closed month records one error per project and posts nothing.
      const locked = await ctx.lockedThrough(project);
      if (isLocked(period.to, locked)) {
        res.skipped += 1;
        if (!reported.has(pid)) res.errors.push(projectError(pid, closedError(`management fees ${period.key}`, period.to, locked)));
        reported.add(pid);
        continue;
      }
      const property = properties.get(propertyId) || null;
      const policies = effectivePolicies({ company: await ctx.company(project), property });
      const pct = Number(policies.managementFeePct) || 0;
      const fee = amount > 0 ? round2(Math.max((amount * pct) / 100, Number(policies.managementFeeMin) || 0)) : 0;
      if (fee <= 0) {
        res.skipped += 1;
        continue;
      }
      const idem = `mgmt:${propertyId}:${period.key}`;
      const { created } = await postOnce(admin, ctx, project, idem, (a) =>
        buildManagementFee(
          {
            date: period.to,
            amount: fee,
            propertyId,
            memo: `Management fee · ${period.key}${property?.name ? ` · ${property.name}` : ""}`,
            sourceId: propertyId,
            idempotencyKey: idem,
            metadata: { auto: true, collected: round2(amount), pct },
          },
          a,
        ),
      );
      if (created) res.created += 1;
      else res.skipped += 1;
    } catch (e) {
      res.errors.push(projectError(pid, `management fee ${propertyId}: ${e.message}`));
    }
  }
  return res;
}

// --- Deposit interest ---------------------------------------------------------------

// Monthly interest per interest-bearing deposit record (CORE-04, lib/billing/deposits.js): its held and paid principal at the end of last month, the record's rate override or the policy rate.
const runDepositInterest = ({ admin, now, projectId }) => accrueInterest(admin, { now, projectId });

export const lateFeesJob = {
  key: "late-fees",
  label: "Assess late fees",
  description:
    "Assesses each unpaid rent month daily: the policy fee once the grace period ends (percent fees on the month's billed rent), then daily increments up to the maximum, catching up missed days. Stops once the month's rent is paid or under the minimum balance, for exempt tenants, and during an eviction unless the policy allows it.",
  schedule: "35 10 * * *",
  asOf: true,
  run: runLateFees,
};

export const managementFeesJob = {
  key: "management-fees",
  label: "Management fees",
  description: "Books last month's management fee per property from collected rent and the management fee policy.",
  schedule: "0 11 * * *",
  asOf: true,
  run: runManagementFees,
};

export const depositInterestJob = {
  key: "deposit-interest",
  label: "Deposit interest",
  description: "Accrues last month's interest on each interest-bearing deposit at its rate (override or policy), and credits it to the resident each January when the payout policy is annual.",
  schedule: "15 11 * * *",
  asOf: true,
  run: runDepositInterest,
};

export const FINANCIAL_JOBS = [lateFeesJob, managementFeesJob, depositInterestJob];
