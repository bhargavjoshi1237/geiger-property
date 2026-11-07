import { DEPOSIT_OPEN_STATUSES, addDays, billRows, budgetVarianceRows, inScope } from "@/lib/metrics/helpers";
import { byId, list } from "@/lib/reports/lookups";
import { dayOf, daysBetweenIso, fmtDay, money, money0, names, playbook, plural, report, skipNote, tab } from "./shared";

// Accounting detectors: past-due bills and bills stuck in approval (plus the old "Overdue bills"
// summary), deposit-return deadlines, unreconciled bank accounts and YTD expense budget overruns.

const billLabel = (b) => [b.vendorName, b.name].filter(Boolean).join(" · ") || "Bill";

export const billsAttention = {
  key: "bills_attention",
  label: "Bills past due or stuck in approval",
  area: "accounting",
  category: "risk",
  description: "Open bills past their due date, bills waiting for approval longer than the threshold, and the Overdue bills summary.",
  sources: ["bills", "properties"],
  detect(src, ctx) {
    const rows = billRows(src, ctx.p).filter((b) => b.status !== "Void");
    const findings = [];
    const overdue = rows.filter((b) => b.due && b.due < ctx.p.asOf && b.open > 0);
    for (const b of overdue) {
      const late = daysBetweenIso(b.due, ctx.p.asOf) ?? 0;
      findings.push({
        key: `bill:${b.id}:overdue`,
        title: `${billLabel(b)} is ${late} days past due`,
        why: `${money(b.open)} was due ${fmtDay(b.due)}${b.approvalStatus === "Pending" ? " and it still needs approval" : ""}. Late payment risks fees and the vendor relationship.`,
        urgency: late > 14 ? "urgent" : "soon",
        propertyId: b.propertyId,
        impact: b.open,
        grain: "record",
        records: [{ type: "bill", id: b.id, label: billLabel(b), amount: b.open }],
        actions: [tab("Open bill", "Bills & Payables", b.id), report("A/P aging", "A/P Aging")],
      });
    }
    for (const b of rows.filter((x) => x.approvalStatus === "Pending")) {
      const since = dayOf(b.billDate) || dayOf(b.createdAt);
      const waited = since ? daysBetweenIso(since, ctx.p.asOf) ?? 0 : 0;
      if (waited < ctx.config.billApprovalWaitDays) continue;
      findings.push({
        key: `bill:${b.id}:approval`,
        title: `${billLabel(b)} has waited ${waited} days for approval`,
        why: `${money(Number(b.amount) || 0)} is over the approval limit and nobody has approved it since ${fmtDay(since)}${b.due ? `; it's due ${fmtDay(b.due)}` : ""}.`,
        urgency: b.due && b.due <= addDays(ctx.p.asOf, 3) ? "urgent" : "soon",
        propertyId: b.propertyId,
        impact: Number(b.amount) || null,
        grain: "record",
        records: [{ type: "bill", id: b.id, label: billLabel(b), amount: Number(b.amount) || 0 }],
        actions: [tab("Review in queue", "Review Queue"), tab("Open bill", "Bills & Payables", b.id, "approval")],
      });
    }
    if (overdue.length) {
      const total = overdue.reduce((s, b) => s + b.open, 0);
      findings.push({
        key: "summary",
        title: `${plural(overdue.length, "bill")} past due`,
        why: `${money(total)} past due: ${names(overdue, billLabel)}.`,
        urgency: "urgent",
        impact: Math.round(total * 100) / 100,
        grain: "summary",
        records: overdue.map((b) => ({ type: "bill", id: b.id, label: billLabel(b), amount: b.open })),
        actions: [tab("Open bills", "Bills & Payables"), report("A/P aging", "A/P Aging")],
      });
    }
    const undated = rows.filter((b) => b.open > 0 && !b.due).length;
    return { findings, examined: rows.length, skipped: undated, note: skipNote(undated, rows.length, "bills", "no due date") };
  },
};

export const depositReturnDue = {
  key: "deposit_return_due",
  label: "Deposit return deadline",
  area: "accounting",
  category: "risk",
  description: "Moved-out tenants whose security deposit must be returned or itemized within the window.",
  sources: ["deposits", "properties"],
  detect(src, ctx) {
    const until = addDays(ctx.p.asOf, ctx.config.depositDueDays);
    const open = list(src.deposits).filter((d) => DEPOSIT_OPEN_STATUSES.includes(d.status) && inScope(ctx.p, d.propertyId));
    const findings = open
      .filter((d) => dayOf(d.returnDue) && dayOf(d.returnDue) <= until)
      .map((d) => {
        const due = dayOf(d.returnDue);
        const days = daysBetweenIso(ctx.p.asOf, due) ?? 0;
        const who = [d.tenantName, d.unit].filter(Boolean).join(" · ") || "A tenant";
        return {
          key: `deposit:${d.id}`,
          title: days < 0 ? `${d.tenantName || "Deposit"} return is ${-days} days late` : `Return ${d.tenantName || "a"} deposit by ${fmtDay(due)}`,
          why: `${who}'s ${money(Number(d.amount) || 0)} deposit ${days < 0 ? "was" : "is"} due back ${fmtDay(due)}. Missing the statutory deadline can forfeit the right to deductions.`,
          urgency: days <= 2 ? "urgent" : "soon",
          propertyId: d.propertyId,
          impact: Number(d.amount) || null,
          grain: "record",
          records: [{ type: "deposit", id: d.id, label: who, amount: Number(d.amount) || 0 }],
          actions: [tab("Open deposit", "Security Deposits", d.id), playbook("move_out_deposit", "Run deposit return", "move", d.moveId ? [d.moveId] : [])],
        };
      });
    const undated = open.filter((d) => !dayOf(d.returnDue)).length;
    return { findings, examined: open.length, skipped: undated, note: skipNote(undated, open.length, "deposits held", "no return-due date") };
  },
};

export const bankUnreconciled = {
  key: "bank_unreconciled",
  label: "Bank account not reconciled",
  area: "accounting",
  category: "watch",
  description: "Bank accounts with no finalized reconciliation in the last 35 days.",
  sources: ["bankAccounts", "bankReconciliations", "properties"],
  detect(src, ctx) {
    const recs = list(src.bankReconciliations).filter((r) => r.status === "Finalized");
    const accounts = list(src.bankAccounts).filter((b) => !["Closed", "Inactive", "Archived"].includes(b.status) && inScope(ctx.p, b.propertyId || ""));
    const findings = [];
    for (const b of accounts) {
      const last = [...recs.filter((r) => r.bankAccountId === b.id).map((r) => dayOf(r.statementDate)), dayOf(b.lastReconciled)].filter(Boolean).sort().pop();
      const days = last ? daysBetweenIso(last, ctx.p.asOf) ?? 0 : null;
      if (days !== null && days <= ctx.config.unreconciledDays) continue;
      findings.push({
        key: `bank:${b.id}`,
        title: `${b.name || "Bank account"} ${days === null ? "has never been reconciled" : `not reconciled for ${days} days`}`,
        why: days === null ? "There's no finalized reconciliation on record, so errors and missing deposits can hide in the books." : `The last finalized reconciliation was for ${fmtDay(last)}. Reconcile monthly to catch errors before the close.`,
        urgency: days === null || days > 60 ? "soon" : "routine",
        impact: null,
        grain: "record",
        records: [{ type: "bank_account", id: b.id, label: b.name || "Bank account" }],
        actions: [tab("Reconcile", "Bank Reconciliation"), playbook("month_end_close", "Month-end checklist")],
      });
    }
    return { findings, examined: accounts.length, skipped: 0, note: "" };
  },
};

export const budgetOverrun = {
  key: "budget_variance",
  label: "Expense over budget",
  area: "accounting",
  category: "trend",
  description: "Year-to-date spend on an expense account above budget by more than the threshold.",
  sources: ["ledger", "budgets", "budgetLines", "properties"],
  detect(src, ctx) {
    const props = byId(src.properties);
    const rows = budgetVarianceRows(src, ctx.p);
    const findings = rows
      .filter((r) => r.pct !== null && r.pct * 100 > ctx.config.budgetVariancePct && r.variance > 50)
      .map((r) => ({
        key: `budget:${r.id}`,
        title: `${r.account} is ${(r.pct * 100).toFixed(0)}% over budget`,
        why: `Year to date ${money0(r.actual)} spent against ${money0(r.budget)} budgeted${props.get(r.propertyId)?.name ? ` at ${props.get(r.propertyId).name}` : ""} — ${money0(r.variance)} over.`,
        urgency: r.pct > 0.25 ? "soon" : "routine",
        propertyId: r.propertyId,
        impact: r.variance,
        grain: "record",
        records: [{ type: "budget", id: r.budgetId, label: `${r.budgetName} · ${r.account}`, amount: r.variance }],
        actions: [tab("Open budget", "Budgets", r.budgetId), report("Financial statements", "Financial Statements")],
      }));
    return { findings, examined: rows.length, skipped: 0, note: rows.length ? "" : "No budget lines for this year." };
  },
};

export const ACCOUNTING_DETECTORS = [billsAttention, depositReturnDue, bankUnreconciled, budgetOverrun];
