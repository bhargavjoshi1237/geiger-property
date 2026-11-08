import { raiseReview } from "@/lib/orchestration/review";
import { link } from "@/lib/orchestration/records";
import { ownershipIndex } from "@/lib/ledger/ownership";
import { trustPositions } from "@/lib/reports/ledger_math";
import { SERVER_SOURCES } from "@/lib/reports/sources_server";
import { forProject } from "@/lib/supabase/scope";

// month_end_checks (Month-end close checklist playbook): checks the closing period for blockers and raises ONE review
// item per blocker (reason readiness_blocker, deduped per period + blocker), so re-runs never duplicate them.

const DAY = 86400000;
const isoDay = (d) => d.toISOString().slice(0, 10);
const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const RECONCILE_STALE_DAYS = 35;

const OPEN_DEPOSITS = ["Pending", "Held", "Awaiting disposition"];
const ALL_CHECKS = ["unreconciled_banks", "pending_bills", "unposted_recurring", "deposits_overdue", "trust_shortfall"];

// The period being closed: the previous calendar month (default) or the current one.
export function closingPeriod(now, which = "previous") {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + (which === "current" ? 0 : -1);
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  return { key: isoDay(start).slice(0, 7), start: isoDay(start), end: isoDay(end), label: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

async function rows(admin, table, projectId, apply = (q) => q) {
  const { data, error } = await apply(forProject(admin.from(table).select("*").is("deleted_at", null), projectId));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

// Each check → [{ key, title, note, recordType?, recordId?, recordLabel?, amount? }].
export const CHECKS = {
  async unreconciled_banks(admin, projectId, { now }) {
    const banks = (await rows(admin, "bank_accounts", projectId)).filter((b) => !["closed", "inactive"].includes(String(b.status || "").toLowerCase()));
    if (!banks.length) return [];
    const recs = await rows(admin, "bank_reconciliations", projectId, (q) => q.eq("status", "Finalized"));
    const cutoff = isoDay(new Date(now.getTime() - RECONCILE_STALE_DAYS * DAY));
    return banks
      .map((b) => {
        const last = [b.metadata?.lastReconciled, ...recs.filter((r) => r.bank_account_id === b.id).map((r) => r.statement_date)].filter(Boolean).sort().pop() || null;
        return { b, last };
      })
      .filter(({ last }) => !last || last < cutoff)
      .map(({ b, last }) => ({
        key: `bank:${b.id}`,
        title: `Reconcile ${b.name || "a bank account"}`,
        note: last ? `${b.name || "This account"} was last reconciled on ${last}, more than ${RECONCILE_STALE_DAYS} days ago.` : `${b.name || "This account"} has never been reconciled.`,
        recordType: "bank_account",
        recordId: b.id,
        recordLabel: b.name || "Bank account",
      }));
  },

  async pending_bills(admin, projectId) {
    const bills = (await rows(admin, "bills", projectId, (q) => q.eq("approval_status", "Pending"))).filter((b) => String(b.status || "") !== "Void");
    if (!bills.length) return [];
    const total = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    return [{ key: "bills", title: `Approve ${plural(bills.length, "pending bill")}`, note: `${plural(bills.length, "bill")} totalling ${usd(total)} still wait for approval, so they aren't in payables yet.`, amount: total }];
  },

  async unposted_recurring(admin, projectId, { period }) {
    const due = (await rows(admin, "recurring_charges", projectId, (q) => q.eq("status", "Active").lte("next_date", period.end))).filter(
      (r) => r.metadata?.autoPost !== false && Number(r.amount) > 0,
    );
    if (!due.length) return [];
    const total = due.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return [{ key: "recurring", title: `Post ${plural(due.length, "recurring charge")}`, note: `${plural(due.length, "recurring charge")} (${usd(total)}) due by ${period.end} haven't posted. Run the recurring charges job or post them by hand.`, amount: total }];
  },

  async deposits_overdue(admin, projectId, { now }) {
    const today = isoDay(now);
    const deps = await rows(admin, "security_deposits", projectId, (q) => q.in("status", OPEN_DEPOSITS).lt("return_due", today));
    return deps.map((d) => ({
      key: `deposit:${d.id}`,
      title: `Return the deposit for ${d.tenant_name || "a former resident"}`,
      note: `The ${usd(d.amount)} deposit was due back on ${d.return_due}.`,
      recordType: "deposit",
      recordId: d.id,
      recordLabel: d.tenant_name || d.name || "Security deposit",
      amount: Number(d.amount) || 0,
    }));
  },

  // Trust shortfalls at the period end per owner × property (shares by date, CORE-08), property-level where no owner holds the cash.
  async trust_shortfall(admin, projectId, { period }) {
    let positions;
    try {
      const [ledger, propertyOwners] = await Promise.all([SERVER_SOURCES.ledger(admin, projectId), SERVER_SOURCES.propertyOwners(admin, projectId)]);
      positions = trustPositions(ledger.lines, ledger.accounts, period.end, ownershipIndex(propertyOwners));
    } catch {
      return [];
    }
    const groups = new Map();
    for (const t of positions) {
      const key = `${t.ownerId || "none"}:${t.propertyId || "none"}`;
      groups.set(key, { ownerId: t.ownerId, propertyId: t.propertyId, balance: (groups.get(key)?.balance || 0) + t.balance });
    }
    return [...groups.entries()]
      .filter(([, g]) => g.balance < -0.004)
      .map(([key, g]) => ({
        key: `trust:${key}`,
        title: "Trust account shortfall",
        note: `Trust cash for this ${g.ownerId ? "owner" : "property"} is overdrawn by ${usd(-g.balance)}. Fund it before closing.`,
        recordType: g.ownerId ? "owner" : g.propertyId ? "property" : null,
        recordId: g.ownerId || g.propertyId || null,
        recordLabel: g.ownerId ? "Owner" : "Property",
        amount: -g.balance,
      }));
  },
};

export const monthEndChecksStep = {
  prepare(admin, step, ctx) {
    const period = closingPeriod(ctx.now, step.config?.period);
    const checks = (Array.isArray(step.config?.checks) && step.config.checks.length ? step.config.checks : ALL_CHECKS).filter((c) => CHECKS[c]);
    return { input: { period: period.key, checks } };
  },

  async perform(admin, step, ctx, prepared) {
    const period = closingPeriod(ctx.now, step.config?.period);
    const blockers = [];
    for (const check of prepared.input.checks) blockers.push(...(await CHECKS[check](admin, ctx.projectId, { now: ctx.now, period })).map((b) => ({ ...b, check })));
    for (const b of blockers) {
      await raiseReview(admin, {
        projectId: ctx.projectId,
        dedupeKey: `close:${period.key}:${b.check}:${b.key}`,
        kind: "task",
        sourceType: "automation_run",
        sourceId: ctx.run.id,
        recordType: b.recordType || null,
        recordId: b.recordId || null,
        recordLabel: b.recordLabel || null,
        title: `${period.label} close: ${b.title}`,
        reasonCode: "readiness_blocker",
        context: { note: b.note },
        amountAtStake: b.amount ?? null,
        severity: "soon",
        metadata: { automationId: ctx.automation.id, runId: ctx.run.id, period: period.key, check: b.check },
      });
    }
    return {
      status: blockers.length ? "warning" : "ok",
      message: blockers.length ? `${plural(blockers.length, "blocker")} for the ${period.label} close — see the Review Queue` : `${period.label} is ready to close`,
      input: prepared.input,
      output: { period: period.key, blockers: blockers.map((b) => ({ check: b.check, title: b.title })) },
      links: blockers.map((b) => link(b.recordType, b.recordId, b.recordLabel)).filter(Boolean),
    };
  },
};
