"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Download, Info, SlidersHorizontal, TrendingUp } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@geiger/ui/chart";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@geiger/ui/tooltip";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { DataTable, EmptyState, ListLoading, ScreenHeader, SectionCard, StatGrid, Toolbar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { CSV_BOM, csvSlug, tableCsv } from "@/lib/reports/csv";
import { getSetting } from "@/lib/supabase/settings";
import { automationsData } from "@/lib/supabase/automations";
import { listImpactSince } from "@/lib/supabase/impact_daily";
import { listPlaybookInstalls } from "@/lib/supabase/playbook_installs";
import { reviewItemsLayer } from "@/lib/supabase/review_items";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { renewalsLayer } from "@/lib/supabase/renewals";
import { listLedgerEntries } from "@/lib/supabase/ledger";
import { getPlaybook } from "@/lib/orchestration/playbooks";
import { BEFORE_DAYS, METHODS, METRICS, STEP_PREFIX, VALUE_DEFAULTS, VALUE_KEY, hoursFromRows, resolveMinutes, sumMetric } from "@/lib/orchestration/value";

// Impact (ORCH-09): what automations saved and delivered. Hours saved are ESTIMATED (completed steps × your minutes
// per task, read live so editing the minutes recalculates straight away); outcomes use fixed attribution windows and
// every number carries its method. Figures come from property.impact_daily (the nightly `impact` job).

const DAY = 86400000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const hours = (n) => `${(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 1 })}h`;
const pct = (n) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
const median = (list) => {
  const v = list.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

const PERIODS = [
  { value: "month", label: "This month" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];
const TREND_OPTIONS = [
  { value: "hours", label: "Hours saved (estimated)" },
  { value: "runs", label: "Runs" },
  { value: "collected", label: "Collected after collections runs" },
  { value: "resolved", label: "Exceptions resolved" },
];
const OUTLINE = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";
const MAINTENANCE_PLAYBOOKS = ["maintenance_intake", "work_order_sla"];
const COLLECTION_PLAYBOOKS = ["collections_ladder", "autopay_failure_recovery"];

function MethodTip({ text }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="How this is measured" className="inline-flex text-text-tertiary hover:text-foreground">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-72">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const Head = ({ label, method }) => (
  <span className="inline-flex items-center gap-1">
    {label} {method ? <MethodTip text={method} /> : null}
  </span>
);

const periodStart = (period, now) =>
  period === "month" ? isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) : isoDay(now.getTime() - (Number(period) - 1) * DAY);

// Before/after for one installed playbook: the BEFORE_DAYS before install vs. the days since.
function beforeAfter(playbookKey, installedAt, { workOrders, renewals, payments, now }) {
  const at = new Date(installedAt).getTime();
  const before = [at - BEFORE_DAYS * DAY, at];
  const after = [at, now.getTime()];
  const inside = (d, [a, b]) => {
    const t = new Date(d).getTime();
    return t >= a && t < b;
  };
  const sinceDays = Math.max(1, Math.round((after[1] - after[0]) / DAY));
  if (MAINTENANCE_PLAYBOOKS.includes(playbookKey)) {
    const turn = (range) =>
      median(
        workOrders
          .filter((w) => inside(w.createdAt, range) && w.metadata?.completedDate)
          .map((w) => (new Date(`${w.metadata.completedDate}T12:00:00Z`) - new Date(w.createdAt)) / DAY),
      );
    const b = turn(before);
    const a = turn(after);
    return { label: "Median days to complete", method: METHODS.turnaround, before: b === null ? "—" : `${b.toFixed(1)}d`, after: a === null ? "—" : `${a.toFixed(1)}d`, better: a !== null && b !== null ? a < b : null };
  }
  if (playbookKey === "renewal_pipeline") {
    const rate = (range) => {
      const offered = renewals.filter((r) => r.offerSentOn && inside(`${r.offerSentOn}T12:00:00Z`, range));
      return offered.length ? offered.filter((r) => r.status === "Accepted").length / offered.length : null;
    };
    const b = rate(before);
    const a = rate(after);
    return { label: "Renewal acceptance", method: METHODS.acceptance, before: pct(b), after: pct(a), better: a !== null && b !== null ? a > b : null };
  }
  if (COLLECTION_PLAYBOOKS.includes(playbookKey)) {
    const per30 = (range, days) => (payments.filter((p) => inside(`${p.date}T12:00:00Z`, range)).reduce((s, p) => s + p.amount, 0) / days) * 30;
    const b = per30(before, BEFORE_DAYS);
    const a = per30(after, sinceDays);
    return { label: "Rent collected per 30 days", method: METHODS.collectedMonthly, before: money(b), after: money(a), better: a > b };
  }
  return null;
}

export function ImpactScreen() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("month");
  const [trend, setTrend] = useState("hours");
  const canExport = usePermission("reports.export");
  const { setTab } = useWorkspaceUrl();
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    let alive = true;
    const since = isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)));
    const ledgerFrom = isoDay(now.getTime() - 500 * DAY);
    Promise.all([
      listImpactSince(since),
      automationsData.list(),
      listPlaybookInstalls(),
      getSetting(VALUE_KEY, VALUE_DEFAULTS),
      reviewItemsLayer.list({ sourceType: "automation_run" }),
      workOrdersLayer.list(),
      renewalsLayer.list(),
      listLedgerEntries({ sourceType: "payment", from: ledgerFrom, limit: 5000 }),
    ]).then(([rows, automations, installs, value, reviews, workOrders, renewals, entries]) => {
      if (!alive) return;
      setData({
        rows: rows ?? [],
        unavailable: rows === null,
        automations: automations ?? [],
        installs: installs ?? [],
        minutes: resolveMinutes(value),
        reviews: reviews ?? [],
        workOrders: workOrders ?? [],
        renewals: renewals ?? [],
        payments: (entries ?? []).filter((e) => e.status !== "void" && !e.voidedAt).map((e) => ({ date: e.date, amount: Number(e.total) || 0 })),
      });
    });
    return () => {
      alive = false;
    };
  }, [now]);

  const view = useMemo(() => {
    if (!data) return null;
    const from = periodStart(period, now);
    const inPeriod = data.rows.filter((r) => r.date >= from);
    const thisMonth = data.rows.filter((r) => r.date >= periodStart("month", now));
    const byAutomation = new Map(data.automations.map((a) => [a.id, a]));
    const installByKey = new Map(data.installs.map((i) => [i.playbookKey, i]));

    // Rows per playbook (all its workflows together) or per standalone workflow.
    const groups = new Map();
    for (const r of inPeriod) {
      const a = byAutomation.get(r.automationId);
      const pb = r.playbookKey || a?.metadata?.playbook?.key || null;
      const key = pb ? `pb:${pb}` : `wf:${r.automationId}`;
      if (!groups.has(key)) {
        groups.set(key, { key, playbookKey: pb, name: pb ? getPlaybook(pb)?.title || pb : a?.name || "Deleted workflow", kind: pb ? "Playbook" : "Workflow", rows: [] });
      }
      groups.get(key).rows.push(r);
    }
    for (const i of data.installs) {
      const key = `pb:${i.playbookKey}`;
      if (!groups.has(key)) groups.set(key, { key, playbookKey: i.playbookKey, name: getPlaybook(i.playbookKey)?.title || i.playbookKey, kind: "Playbook", rows: [] });
    }
    const table = [...groups.values()].map((g) => {
      const completed = sumMetric(g.rows, METRICS.completed);
      const failed = sumMetric(g.rows, METRICS.failed);
      const collected = sumMetric(g.rows, METRICS.collected);
      let outcome = collected ? `${money(collected)} collected` : "—";
      let outcomeMethod = collected ? METHODS.collected : null;
      if (g.playbookKey === "renewal_pipeline") {
        outcome = `${sumMetric(g.rows, METRICS.offersSent)} offers · ${sumMetric(g.rows, METRICS.renewalsAccepted)} accepted`;
        outcomeMethod = METHODS.renewals;
      }
      return {
        ...g,
        runs: sumMetric(g.rows, METRICS.runs),
        completed,
        failed,
        success: completed + failed ? completed / (completed + failed) : null,
        raised: sumMetric(g.rows, METRICS.exceptionsRaised),
        resolved: sumMetric(g.rows, METRICS.exceptionsResolved),
        hours: hoursFromRows(g.rows, data.minutes),
        collected,
        outcome,
        outcomeMethod,
        installedAt: g.playbookKey ? installByKey.get(g.playbookKey)?.installedAt || null : null,
      };
    });
    table.sort((a, b) => b.hours - a.hours || b.runs - a.runs);

    const steps = thisMonth.filter((r) => r.metric.startsWith(STEP_PREFIX)).reduce((s, r) => s + r.value, 0);
    const monthCompleted = sumMetric(thisMonth, METRICS.completed);
    const monthFailed = sumMetric(thisMonth, METRICS.failed);
    const monthFrom = periodStart("month", now);
    const resolveHours = median(
      data.reviews.filter((r) => r.status === "resolved" && r.resolvedAt && r.resolvedAt >= monthFrom).map((r) => (new Date(r.resolvedAt) - new Date(r.createdAt)) / 3600000),
    );
    const tiles = [
      { label: "Hours saved this month", value: hours(hoursFromRows(thisMonth, data.minutes)), hint: `Estimated · ${steps.toLocaleString("en-US")} completed steps` },
      { label: "Collected after collections runs", value: money(sumMetric(thisMonth, METRICS.collected)), hint: "This month · 14-day window" },
      {
        label: "Exceptions resolved",
        value: String(sumMetric(thisMonth, METRICS.exceptionsResolved)),
        hint: `${sumMetric(thisMonth, METRICS.exceptionsRaised)} raised${resolveHours !== null ? ` · median ${Math.round(resolveHours)}h to resolve` : ""}`,
      },
      { label: "Runs this month", value: String(sumMetric(thisMonth, METRICS.runs)), hint: `${pct(monthCompleted + monthFailed ? monthCompleted / (monthCompleted + monthFailed) : null)} success` },
    ];

    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1));
      return { key: isoDay(d).slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) };
    });
    const chart = months.map((m) => {
      const rows = data.rows.filter((r) => r.date.startsWith(m.key));
      const value =
        trend === "hours"
          ? hoursFromRows(rows, data.minutes)
          : trend === "runs"
            ? sumMetric(rows, METRICS.runs)
            : trend === "collected"
              ? sumMetric(rows, METRICS.collected)
              : sumMetric(rows, METRICS.exceptionsResolved);
      return { label: m.label, value };
    });

    const comparisons = data.installs
      .map((i) => ({ install: i, playbook: getPlaybook(i.playbookKey), cmp: beforeAfter(i.playbookKey, i.installedAt, { ...data, now }) }))
      .filter((x) => x.playbook && x.cmp);

    return { table, tiles, chart, comparisons };
  }, [data, period, trend, now]);

  const exportCsv = () => {
    const columns = [
      { key: "name", header: "Playbook / workflow" },
      { key: "kind", header: "Type" },
      { key: "runs", header: "Runs" },
      { key: "completed", header: "Completed" },
      { key: "failed", header: "Failed" },
      { key: "success", header: "Success rate", format: "percent" },
      { key: "raised", header: "Exceptions raised" },
      { key: "resolved", header: "Exceptions resolved" },
      { key: "hours", header: "Hours saved (estimated)" },
      { key: "collected", header: "Collected after runs", format: "money" },
      { key: "outcome", header: "Outcome" },
    ];
    const csv = tableCsv(columns, view.table);
    const blob = new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csvSlug(`automation impact ${PERIODS.find((p) => p.value === period)?.label}`)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      key: "name",
      header: "Playbook / workflow",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {r.kind}
            {r.installedAt ? ` · installed ${new Date(r.installedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
          </span>
        </div>
      ),
    },
    { key: "runs", header: "Runs", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => r.runs.toLocaleString("en-US") },
    { key: "success", header: <Head label="Success" method={METHODS.success} />, align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => pct(r.success) },
    {
      key: "exceptions",
      header: <Head label="Exceptions" method={METHODS.exceptions} />,
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => `${r.raised} · ${r.resolved} resolved`,
    },
    { key: "hours", header: <Head label="Hours (est.)" method={METHODS.hours} />, align: "right", className: "text-right tabular-nums text-foreground", render: (r) => hours(r.hours) },
    {
      key: "outcome",
      header: "Outcome",
      className: "text-sm text-text-secondary",
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          {r.outcome} {r.outcomeMethod ? <MethodTip text={r.outcomeMethod} /> : null}
        </span>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Impact"
        description="What your automations saved and delivered. Hours are estimated from your team's minutes per task; every outcome says how it's measured."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className={OUTLINE} onClick={() => setTab("Automation Settings")}>
              <SlidersHorizontal className="h-4 w-4" /> Minutes per task
            </Button>
            <Button variant="outline" className={OUTLINE} disabled={!canExport || !view?.table.length} title={canExport ? undefined : "Your role can't export"} onClick={exportCsv}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {!view ? (
        <ListLoading label="Loading impact" />
      ) : (
        <>
          {data.unavailable ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Impact figures couldn&apos;t be loaded. They&apos;re rolled up nightly by the Impact rollup job (Automations → Scheduled Jobs).
            </p>
          ) : null}

          <StatGrid stats={view.tiles} />

          <SectionCard
            title="Trend"
            description="The last 12 months, by month."
            action={<FilterDropdown value={trend} onValueChange={setTrend} options={TREND_OPTIONS} height="h-9" />}
          >
            {view.chart.some((m) => m.value) ? (
              <ChartContainer config={{ value: { label: TREND_OPTIONS.find((o) => o.value === trend)?.label, color: "var(--foreground)" } }} className="h-[240px] w-full">
                <BarChart data={view.chart} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value) => (
                          <span className="font-medium tabular-nums text-foreground">
                            {trend === "hours" ? hours(value) : trend === "collected" ? money(value) : Number(value).toLocaleString("en-US")}
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyState icon={TrendingUp} title="Nothing to chart yet" description="Figures appear once workflows have run and the nightly impact rollup has counted them." />
            )}
          </SectionCard>

          <Toolbar>
            <FilterDropdown value={period} onValueChange={setPeriod} options={PERIODS} height="h-9" />
            <span className="text-xs text-text-tertiary">By playbook and workflow</span>
          </Toolbar>
          <DataTable
            columns={columns}
            data={view.table}
            getRowKey={(r) => r.key}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={TrendingUp}
                  title="No automation activity yet"
                  description="Install a playbook or switch on a workflow. Its runs, time saved and outcomes show here after the nightly rollup."
                  action={
                    <Button variant="outline" className={OUTLINE} onClick={() => setTab("Playbooks")}>
                      Browse playbooks
                    </Button>
                  }
                />
              </div>
            }
          />

          {view.comparisons.length ? (
            <SectionCard title="Before and after" description={METHODS.beforeAfter} bodyPadding={false}>
              <div className="divide-y divide-border">
                {view.comparisons.map(({ install, playbook, cmp }) => (
                  <div key={install.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
                    <div>
                      <p className="text-sm font-medium text-foreground">{playbook.title}</p>
                      <p className="inline-flex items-center gap-1 text-xs text-text-secondary">
                        {cmp.label} <MethodTip text={cmp.method} />
                      </p>
                    </div>
                    <p className="text-sm text-text-secondary">
                      <span className="text-xs text-text-tertiary">{BEFORE_DAYS} days before </span>
                      <span className="tabular-nums text-foreground">{cmp.before}</span>
                    </p>
                    <p className="text-sm text-text-secondary">
                      <span className="text-xs text-text-tertiary">Since install </span>
                      <span className="tabular-nums text-foreground">{cmp.after}</span>
                    </p>
                    <p
                      className={`text-xs ${
                        cmp.better === null ? "text-text-tertiary" : cmp.better ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {cmp.better === null ? "Not enough data yet" : cmp.better ? "Better since install" : "Worse since install"}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </MainScreenWrapper>
  );
}

export default ImpactScreen;
