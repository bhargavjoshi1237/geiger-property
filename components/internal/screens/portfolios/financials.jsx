"use client";

import { useEffect, useState } from "react";
import { Building2, FileBarChart, Lock, Target } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { DataTable, EmptyState, ListLoading, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { useLedgerAccess } from "@/components/internal/shared/ledger_gate";
import { MeterBar, StatementLines } from "@/components/internal/screens/reports/report_kit";
import { useRefreshKey } from "@/components/internal/screens/properties/sections/refresh";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { LEDGER_LOCKED } from "@/lib/ledger/access";
import { money } from "@/lib/reports/format";
import { formatIso } from "@/lib/reports/periods";
import { cn } from "@/lib/utils";
import { financialChecks, loadFinancials, loadRollup, targetsOf } from "./data";

// Portfolio Financials (CORE-43): fiscal year-to-date P&L and NOI consolidated over the current member properties (the CORE-41 ledger
// aggregates), delinquency against the monthly rent roll, and both checked against the portfolio's targets. The figures equal
// Financial Statements and Delinquency with this portfolio selected.

const TARGET_STATUS_MAP = {
  met: { label: "On track", variant: "success" },
  behind: { label: "Below target", variant: "warning" },
  over: { label: "Over the limit", variant: "danger" },
  unset: { label: "No target", variant: "neutral" },
};

const right = "text-right tabular-nums";
const negative = (n) => (Number(n) < 0 ? "text-red-600 dark:text-red-400" : "");

function TargetRow({ title, status, summary, detail, meter, meterClass }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <StatusPill status={status} map={TARGET_STATUS_MAP} />
        </div>
        <p className="mt-1 text-sm text-text-secondary">{summary}</p>
        {detail ? <p className="mt-0.5 text-xs text-text-tertiary">{detail}</p> : null}
      </div>
      {meter === null ? null : <MeterBar value={meter} className="sm:w-48" colorClass={meterClass} />}
    </div>
  );
}

function TargetsCard({ fin, checks, onNavigate }) {
  const { noi, delinquency: dq } = checks;
  const setTargets = (
    <Button variant="ghost" size="sm" onClick={() => onNavigate?.("targets")} className="h-8 hover:bg-surface-hover">
      <Target className="h-4 w-4" /> Edit targets
    </Button>
  );
  return (
    <SectionCard title="Targets" description="Annual NOI is pro-rated to today; delinquency is measured against the monthly rent roll." bodyPadding={false} action={setTargets}>
      <div className="divide-y divide-border">
        {noi ? (
          <TargetRow
            title="Net operating income"
            status={noi.met ? "met" : "behind"}
            summary={`${money(noi.actual)} year to date against ${money(noi.expected)} expected by ${formatIso(fin.ytd.to)}`}
            detail={`${money(noi.annual)} annual target · ${noi.met ? "ahead by" : "short by"} ${money(Math.abs(noi.gap))}`}
            meter={noi.expected > 0 ? Math.max(0, noi.actual) / noi.expected : 0}
            meterClass={noi.met ? "bg-emerald-500" : "bg-amber-500"}
          />
        ) : (
          <TargetRow title="Net operating income" status="unset" summary={`${money(fin.pnl.noi)} year to date. Set a target annual NOI to track it.`} meter={null} />
        )}
        {dq ? (
          <TargetRow
            title="Delinquency"
            status={dq.met ? "met" : "over"}
            summary={dq.pct === null ? `${money(dq.amount)} owed, with no rent roll to measure it against` : `${dq.pct}% of the ${money(dq.rentRoll)} monthly rent roll · limit ${dq.max}%`}
            detail={`${money(dq.amount)} owed across ${fin.delinquentLeases} lease${fin.delinquentLeases === 1 ? "" : "s"}`}
            meter={dq.max > 0 && dq.pct !== null ? dq.pct / dq.max : dq.met ? 0 : 1}
            meterClass={dq.met ? "bg-emerald-500" : "bg-red-500"}
          />
        ) : (
          <TargetRow title="Delinquency" status="unset" summary={`${money(fin.delinquent)} owed. Set a max delinquency to track it.`} meter={null} />
        )}
      </div>
    </SectionCard>
  );
}

const statementLines = (rows, emptyLabel) => (rows.length ? rows.map((r) => ({ label: r.label, value: money(r.amount) })) : [{ label: emptyLabel, value: money(0), muted: true }]);

const PROPERTY_COLUMNS = [
  { key: "name", header: "Property", render: (r) => <span className={cn("text-foreground", r.__total ? "font-semibold" : "font-medium")}>{r.name}</span> },
  { key: "income", header: "Income", align: "right", className: right, render: (r) => money(r.income) },
  { key: "expenses", header: "Expenses", align: "right", className: right, render: (r) => money(r.expenses) },
  { key: "noi", header: "NOI", align: "right", className: right, render: (r) => <span className={negative(r.noi)}>{money(r.noi)}</span> },
  { key: "delinquent", header: "Delinquent", align: "right", className: right, render: (r) => <span className={r.delinquent > 0 ? "text-red-600 dark:text-red-400" : ""}>{money(r.delinquent)}</span> },
  { key: "rentRoll", header: "Rent roll", align: "right", className: right, render: (r) => money(r.rentRoll) },
].map((c, i) => (i === 0 ? c : { ...c, render: (r) => <span className={cn("text-text-secondary", r.__total && "font-semibold text-foreground")}>{c.render(r)}</span> }));

export function PortfolioFinancialsSection({ item, onNavigate }) {
  const { openItemInTab } = useWorkspaceUrl();
  const key = useRefreshKey("portfolio-properties", item.id);
  const ledger = useLedgerAccess();
  const targets = targetsOf(item);
  const fyStart = targets.fiscalYearStart;
  const loadKey = `${item.id}|${key}|${fyStart || ""}`;
  const [loaded, setLoaded] = useState({ key: null, value: null });

  useEffect(() => {
    if (!ledger) return undefined;
    let alive = true;
    loadRollup(item.id).then(async (rollup) => {
      const fin = rollup.members.length ? await loadFinancials(item.id, rollup, fyStart) : null;
      if (alive) setLoaded({ key: loadKey, value: { rollup, fin, failed: rollup.members.length > 0 && !fin } });
    });
    return () => {
      alive = false;
    };
  }, [item.id, loadKey, ledger, fyStart]);

  // Only figures loaded for the current portfolio, membership and fiscal year; otherwise the loader.
  const d = loaded.key === loadKey ? loaded.value : null;

  if (!ledger) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={Lock} title={LEDGER_LOCKED} description="The P&L, NOI and delinquency come from the ledger." />
      </div>
    );
  }
  if (!d) return <ListLoading label="Loading financials" className="py-10" />;
  if (!d.rollup.members.length) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Financials consolidate the portfolio's properties. Add properties to see its P&L and targets."
          action={
            <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => onNavigate?.("properties")}>
              Add properties
            </Button>
          }
        />
      </div>
    );
  }
  if (d.failed) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={FileBarChart} title="Couldn't load the financials" description="The ledger didn't respond. Try again in a moment." />
      </div>
    );
  }

  const { fin } = d;
  const { pnl } = fin;
  const checks = financialChecks(fin, targets);
  const totals = {
    id: "__total",
    __total: true,
    name: "Portfolio total",
    income: pnl.totalIncome,
    expenses: pnl.totalExpense,
    noi: pnl.noi,
    delinquent: fin.delinquent,
    rentRoll: fin.rentRoll,
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-tertiary">
        Fiscal year to date · {formatIso(fin.ytd.from)} – {formatIso(fin.ytd.to)} · consolidated over {d.rollup.members.length} propert
        {d.rollup.members.length === 1 ? "y" : "ies"}
      </p>
      <StatsBar
        stats={[
          { label: "Income", value: money(pnl.totalIncome), footer: "Year to date" },
          { label: "Expenses", value: money(pnl.totalExpense), footer: "Year to date" },
          { label: "NOI", value: money(pnl.noi), footer: checks.noi ? `Target ${money(checks.noi.expected)} to date` : "No NOI target" },
          {
            label: "Delinquent",
            value: money(fin.delinquent),
            footer: checks.delinquency?.pct != null ? `${checks.delinquency.pct}% of rent roll · max ${checks.delinquency.max}%` : `${fin.delinquentLeases} lease${fin.delinquentLeases === 1 ? "" : "s"} owing`,
          },
        ]}
      />
      <TargetsCard fin={fin} checks={checks} onNavigate={onNavigate} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Income" bodyPadding={false}>
          <StatementLines lines={statementLines(pnl.income, "No income this year")} total={{ label: "Total income", value: money(pnl.totalIncome) }} />
        </SectionCard>
        <SectionCard title="Expenses" bodyPadding={false}>
          <StatementLines lines={statementLines(pnl.expenses, "No expenses this year")} total={{ label: "Total expenses", value: money(pnl.totalExpense) }} />
        </SectionCard>
      </div>
      <SectionCard title="Net operating income" description="NOI leaves out Management Fee Income, the manager's side of each fee." bodyPadding={false}>
        <StatementLines
          lines={[
            { label: "Total income", value: money(pnl.totalIncome) },
            { label: "Less total expenses", value: money(-pnl.totalExpense) },
            { label: "Net income", value: money(pnl.net) },
            { label: "Less management fee income", value: money(-pnl.feeIncome), muted: true },
          ]}
          total={{ label: "Net operating income", value: money(pnl.noi) }}
        />
      </SectionCard>
      <SectionCard title="By property" description="Each property's year to date. The columns add up to the portfolio total." bodyPadding={false}>
        <div className="overflow-x-auto">
          <DataTable
            className="rounded-none border-0"
            columns={PROPERTY_COLUMNS}
            data={[...fin.byProperty, totals]}
            getRowKey={(r) => r.id}
            onRowClick={(r) => !r.__total && openItemInTab(r.id, "Properties")}
          />
        </div>
      </SectionCard>
    </div>
  );
}
