import { emptyResult } from "./contract";
import { computeLateFee, effectivePolicies } from "@/lib/policies";
import {
  buildCharge,
  buildDepositInterest,
  buildManagementFee,
  normalizeEntry,
  normalizeLine,
  openItems,
  round2,
} from "@/lib/ledger/postings";
import { loadAccountIndex, postBuilt } from "@/lib/ledger/store";
import { sendNotificationEmail } from "@/lib/email/notifications";

// Financial scheduled jobs (server-only): post due recurring charges and
// opted-in rent, assess late fees, book monthly management fees and accrue
// security-deposit interest. Each follows lib/jobs/contract.js, runs across
// every project (or the `projectId` of a staff "Run now"), and is idempotent:
// every posting carries an idempotency key (rc:/rent:/late:/mgmt:/depint:)
// that property.ledger_post turns into a no-op on re-runs.

const PAGE = 1000;
const ACTIVE_LEASE = ["Active", "Expiring soon", "Month-to-month", "Notice given", "Eviction", "active", "current"];
const FREQUENCY_MONTHS = { Monthly: 1, Quarterly: 3, Annually: 12, "One-time": 0 };

const iso = (d) => d.toISOString().slice(0, 10);
const scoped = (q, projectId) => (projectId ? q.eq("project_id", projectId) : q);
const meta = (row) => (row?.metadata && typeof row.metadata === "object" ? row.metadata : {});

function addMonthsISO(v, months) {
  const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return iso(target);
}

// The due date (YYYY-MM-DD) for a day of the month containing `today`.
function dueDateIn(today, dueDay) {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${today.slice(0, 7)}-${String(Math.min(Number(dueDay) || 1, last)).padStart(2, "0")}`;
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

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

// Per-run caches: account index per project, primary owner per property,
// company policies per project.
function makeContext(admin) {
  const accounts = new Map();
  let owners = null;
  let companies = null;
  return {
    async accounts(projectId) {
      const key = projectId || "";
      if (!accounts.has(key)) accounts.set(key, await loadAccountIndex(admin, projectId || null));
      return accounts.get(key);
    },
    async ownerOf(propertyId) {
      if (!propertyId) return "";
      if (!owners) {
        const rows = await all(() => admin.from("property_owners").select("owner_id, property_id, is_primary").is("deleted_at", null));
        owners = new Map();
        for (const r of rows) if (!owners.has(r.property_id) || r.is_primary) owners.set(r.property_id, r.owner_id);
      }
      return owners.get(propertyId) || "";
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

// Has an entry with this idempotency key already been posted?
async function alreadyPosted(admin, projectId, key) {
  let q = admin.from("ledger_entries").select("id").eq("idempotency_key", key).limit(1);
  q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data?.length ? data[0].id : null;
}

async function postOnce(admin, ctx, projectId, key, build) {
  const existing = await alreadyPosted(admin, projectId, key);
  if (existing) return { entryId: existing, created: false };
  const built = build(await ctx.accounts(projectId));
  if (built.error) throw new Error(built.error);
  const entryId = await postBuilt(admin, built, { projectId });
  return { entryId, created: true };
}

// --- Recurring charges + opted-in rent ----------------------------------------

async function runRecurringCharges({ admin, now, projectId }) {
  const res = emptyResult();
  const ctx = makeContext(admin);
  const today = iso(now);

  const charges = await all(() =>
    scoped(admin.from("recurring_charges").select("*").is("deleted_at", null).eq("status", "Active").lte("next_date", today), projectId),
  );
  for (const r of charges) {
    res.processed += 1;
    const m = meta(r);
    if (m.autoPost === false || !(Number(r.amount) > 0) || (!r.lease_id && !r.tenant_id)) {
      res.skipped += 1;
      continue;
    }
    try {
      const months = FREQUENCY_MONTHS[r.frequency] ?? 1;
      const postings = Array.isArray(m.postings) ? [...m.postings] : [];
      const ownerId = await ctx.ownerOf(r.property_id);
      let next = r.next_date;
      let status = r.status;
      // Catch up every missed occurrence (bounded), one idempotent entry each.
      for (let guard = 0; next && next <= today && guard < 24; guard += 1) {
        const date = next;
        const { entryId, created } = await postOnce(admin, ctx, r.project_id, `rc:${r.id}:${date}`, (acct) =>
          buildCharge(
            {
              date,
              amount: r.amount,
              glAccountId: r.gl_account_id,
              leaseId: r.lease_id,
              tenantId: r.tenant_id,
              unitId: r.unit_id,
              propertyId: r.property_id,
              ownerId,
              memo: `${r.name} · ${date}`,
              sourceId: r.id,
              idempotencyKey: `rc:${r.id}:${date}`,
              metadata: { recurringChargeId: r.id, auto: true },
            },
            acct,
          ),
        );
        if (created) res.created += 1;
        if (!postings.some((p) => p.entryId === entryId)) {
          postings.unshift({ id: entryId, entryId, date, amount: Number(r.amount), postedAt: today, auto: true });
        }
        if (!months) {
          status = "Ended";
          break;
        }
        next = addMonthsISO(date, months);
      }
      const { error } = await admin.from("recurring_charges").update({ next_date: next, status }).eq("id", r.id);
      if (error) throw new Error(error.message);
      await admin.rpc("merge_meta", { p_table: "recurring_charges", p_id: r.id, p_patch: { postings: postings.slice(0, 120) } });
    } catch (e) {
      res.errors.push(`recurring charge ${r.id}: ${e.message}`);
    }
  }

  // Rent accounts that opted into automatic rent posting (metadata.autoPostRent).
  const accounts = await all(() => scoped(admin.from("rent_accounts").select("*").is("deleted_at", null), projectId));
  for (const a of accounts) {
    if (meta(a).autoPostRent !== true) continue;
    res.processed += 1;
    const due = dueDateIn(today, a.due_day);
    if (today < due || !(Number(a.rent) > 0) || (!a.lease_id && !a.tenant_id)) {
      res.skipped += 1;
      continue;
    }
    try {
      const key = `rent:${a.id}:${due.slice(0, 7)}`;
      const ownerId = await ctx.ownerOf(a.property_id);
      const { created } = await postOnce(admin, ctx, a.project_id, key, (acct) =>
        buildCharge(
          {
            date: due,
            amount: a.rent,
            leaseId: a.lease_id,
            tenantId: a.tenant_id,
            unitId: a.unit_id,
            propertyId: a.property_id,
            ownerId,
            memo: `Rent · ${due.slice(0, 7)}`,
            sourceId: a.id,
            idempotencyKey: key,
            metadata: { auto: true },
          },
          acct,
        ),
      );
      if (created) res.created += 1;
      else res.skipped += 1;
    } catch (e) {
      res.errors.push(`rent account ${a.id}: ${e.message}`);
    }
  }
  return res;
}

// --- Late fees --------------------------------------------------------------------

// Email the tenant once per assessed late fee (respects the late_notice toggle).
async function sendLateNotice(admin, project, lease, { due, daysLate, fee, open }) {
  if (!lease.tenant_id) return;
  const { data: tenant } = await admin.from("tenants").select("name, email").eq("id", lease.tenant_id).maybeSingle();
  if (!tenant?.email) return;
  const money = (n) => `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  await sendNotificationEmail({
    projectId: project,
    notification: "late_notice",
    to: tenant.email,
    db: admin,
    data: {
      recipientName: tenant.name || "there",
      amountDue: money(open + fee),
      lateFee: money(fee),
      dueDate: due,
      daysLate,
      unitLabel: lease.unit || "your unit",
    },
  });
}

async function runLateFees({ admin, now, projectId }) {
  const res = emptyResult();
  const ctx = makeContext(admin);
  const today = iso(now);

  const leases = (await all(() => scoped(admin.from("leases").select("*").is("deleted_at", null), projectId))).filter((l) =>
    ACTIVE_LEASE.includes(l.status),
  );
  if (!leases.length) return res;
  const properties = new Map(
    (await byIds(admin, "properties", leases.map((l) => l.property_id), "id, metadata")).map((p) => [p.id, p]),
  );

  // Group by project so each project's AR lines are read once.
  const byProject = new Map();
  for (const l of leases) byProject.set(l.project_id || "", [...(byProject.get(l.project_id || "") || []), l]);

  for (const [pid, group] of byProject) {
    const project = pid || null;
    try {
      const acct = await ctx.accounts(project);
      const ar = acct.list.filter((a) => a.subtype === "receivable").map((a) => a.id);
      if (!ar.length) continue;
      const leaseIds = new Set(group.map((l) => l.id));
      const rawLines = await all(() => {
        const q = admin.from("ledger_lines").select("*").is("deleted_at", null).in("gl_account_id", ar).not("lease_id", "is", null);
        return project ? q.eq("project_id", project) : q.is("project_id", null);
      });
      const lines = rawLines.filter((l) => leaseIds.has(l.lease_id)).map(normalizeLine);
      const entries = new Map((await byIds(admin, "ledger_entries", lines.map((l) => l.entryId))).map((e) => [e.id, normalizeEntry(e)]));
      const linesByLease = new Map();
      for (const l of lines) linesByLease.set(l.leaseId, [...(linesByLease.get(l.leaseId) || []), { ...l, entry: entries.get(l.entryId) }]);
      const company = await ctx.company(project);

      for (const lease of group) {
        res.processed += 1;
        const policies = effectivePolicies({ company, property: properties.get(lease.property_id) || null, lease });
        const due = dueDateIn(today, policies.rentDueDay);
        const daysLate = daysBetween(due, today);
        const overdue = openItems(linesByLease.get(lease.id) || [], acct, "receivable").filter(
          (i) => (i.sourceType === "charge") && i.date <= due,
        );
        const fee = overdue.length ? computeLateFee(policies, lease.rent, daysLate) : 0;
        if (daysLate <= 0 || fee <= 0) {
          res.skipped += 1;
          continue;
        }
        const key = `late:${lease.id}:${due.slice(0, 7)}`;
        const ownerId = await ctx.ownerOf(lease.property_id);
        const { created } = await postOnce(admin, ctx, project, key, (a) =>
          buildCharge(
            {
              sourceType: "late_fee",
              date: today,
              amount: fee,
              leaseId: lease.id,
              tenantId: lease.tenant_id,
              unitId: lease.unit_id,
              propertyId: lease.property_id,
              ownerId,
              memo: `Late fee · ${due.slice(0, 7)} rent`,
              sourceId: lease.id,
              idempotencyKey: key,
              metadata: { auto: true, daysLate },
            },
            a,
          ),
        );
        if (!created) {
          res.skipped += 1;
          continue;
        }
        res.created += 1;
        await sendLateNotice(admin, project, lease, { due, daysLate, fee, open: overdue.reduce((t, i) => t + (Number(i.open) || 0), 0) });
      }
    } catch (e) {
      res.errors.push(`late fees (project ${pid || "none"}): ${e.message}`);
    }
  }
  return res;
}

// --- Management fees ----------------------------------------------------------------

// Last month's collected rent per property (cash lines of payment entries) ×
// the management fee policy, posted once per property per month.
async function runManagementFees({ admin, now, projectId }) {
  const res = emptyResult();
  const ctx = makeContext(admin);
  const period = previousMonth(iso(now));

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

  for (const [key, amount] of collected) {
    res.processed += 1;
    const [pid, propertyId] = key.split("|");
    const project = pid || null;
    try {
      const property = properties.get(propertyId) || null;
      const policies = effectivePolicies({ company: await ctx.company(project), property });
      const pct = Number(policies.managementFeePct) || 0;
      const fee = amount > 0 ? round2(Math.max((amount * pct) / 100, Number(policies.managementFeeMin) || 0)) : 0;
      if (fee <= 0) {
        res.skipped += 1;
        continue;
      }
      const idem = `mgmt:${propertyId}:${period.key}`;
      const ownerId = await ctx.ownerOf(propertyId);
      const { created } = await postOnce(admin, ctx, project, idem, (a) =>
        buildManagementFee(
          {
            date: period.to,
            amount: fee,
            propertyId,
            ownerId,
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
      res.errors.push(`management fee ${propertyId}: ${e.message}`);
    }
  }
  return res;
}

// --- Deposit interest ---------------------------------------------------------------

// Monthly interest on each lease's security deposit held at the end of last
// month, at the property's depositInterestRate (annual %).
async function runDepositInterest({ admin, now, projectId }) {
  const res = emptyResult();
  const ctx = makeContext(admin);
  const period = previousMonth(iso(now));

  const leases = await all(() => scoped(admin.from("leases").select("id, project_id, property_id, tenant_id, unit_id, metadata").is("deleted_at", null), projectId));
  const byProject = new Map();
  for (const l of leases) byProject.set(l.project_id || "", [...(byProject.get(l.project_id || "") || []), l]);
  const properties = new Map(
    (await byIds(admin, "properties", leases.map((l) => l.property_id), "id, metadata")).map((p) => [p.id, p]),
  );

  for (const [pid, group] of byProject) {
    const project = pid || null;
    try {
      const acct = await ctx.accounts(project);
      const deposits = acct.byKey.get("security_deposits");
      if (!deposits) continue;
      const company = await ctx.company(project);
      const rows = await all(() => {
        const q = admin
          .from("ledger_lines")
          .select("lease_id, debit, credit")
          .is("deleted_at", null)
          .eq("gl_account_id", deposits.id)
          .lte("entry_date", period.to)
          .not("lease_id", "is", null);
        return project ? q.eq("project_id", project) : q.is("project_id", null);
      });
      const held = new Map();
      for (const r of rows) held.set(r.lease_id, (held.get(r.lease_id) || 0) + Number(r.credit) - Number(r.debit));

      for (const lease of group) {
        const balance = round2(held.get(lease.id) || 0);
        if (balance <= 0) continue;
        res.processed += 1;
        const policies = effectivePolicies({ company, property: properties.get(lease.property_id) || null });
        const interest = round2((balance * (Number(policies.depositInterestRate) || 0)) / 100 / 12);
        if (interest <= 0) {
          res.skipped += 1;
          continue;
        }
        const key = `depint:${lease.id}:${period.key}`;
        const { created } = await postOnce(admin, ctx, project, key, (a) =>
          buildDepositInterest(
            {
              date: period.to,
              amount: interest,
              leaseId: lease.id,
              tenantId: lease.tenant_id,
              unitId: lease.unit_id,
              propertyId: lease.property_id,
              memo: `Deposit interest · ${period.key}`,
              sourceId: lease.id,
              idempotencyKey: key,
              metadata: { auto: true, balance, rate: policies.depositInterestRate },
            },
            a,
          ),
        );
        if (created) res.created += 1;
        else res.skipped += 1;
      }
    } catch (e) {
      res.errors.push(`deposit interest (project ${pid || "none"}): ${e.message}`);
    }
  }
  return res;
}

export const recurringChargesJob = {
  key: "recurring-charges",
  label: "Post recurring charges",
  description: "Posts every due recurring charge (and opted-in rent) to the lease ledger, catching up missed periods.",
  schedule: "15 5 * * *",
  run: runRecurringCharges,
};

export const lateFeesJob = {
  key: "late-fees",
  label: "Assess late fees",
  description: "Charges the policy late fee once per month on leases with rent still open after the grace period.",
  schedule: "30 6 * * *",
  run: runLateFees,
};

export const managementFeesJob = {
  key: "management-fees",
  label: "Management fees",
  description: "Books last month's management fee per property from collected rent and the management fee policy.",
  schedule: "0 7 * * *",
  run: runManagementFees,
};

export const depositInterestJob = {
  key: "deposit-interest",
  label: "Deposit interest",
  description: "Accrues last month's interest on security deposits where the deposit policy sets a rate.",
  schedule: "30 7 * * *",
  run: runDepositInterest,
};

export const FINANCIAL_JOBS = [recurringChargesJob, lateFeesJob, managementFeesJob, depositInterestJob];
