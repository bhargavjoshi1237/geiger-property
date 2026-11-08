"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  Clock,
  Flame,
  Lock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Label,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { Button } from "@geiger/ui/button";
import { Card, CardContent } from "@geiger/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@geiger/ui/chart";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@geiger/ui/table";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  EmptyState,
  RollingNumber,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { propertiesConfig } from "@/components/internal/screens/properties/config";
import { useReportData } from "@/components/internal/screens/reports/report_kit";
import {
  ACTIVE_LEASE_STATUSES,
  OCCUPIED_STATUSES,
  UNIT_STATUS_MAP,
  byId,
  compactMoney,
  currency,
  inRange,
  lastMonths,
  monthLabel,
  monthRange,
  propertyIdOf,
  startOfDay,
  sumBy,
  toDate,
} from "@/components/internal/screens/reports/shared";
import FilterDropdown from "./filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useModules } from "@/context/modules-context";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { leasesLayer } from "@/lib/supabase/leases";
import { arMonthly } from "@/lib/supabase/receivables";
import { sumArMonths } from "@/lib/ledger/ar_reads";
import { LEDGER_LOCKED } from "@/lib/ledger/access";
import { useLedgerAccess } from "@/components/internal/shared/ledger_gate";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { applicationsLayer } from "@/lib/supabase/applications";
import { prospectsLayer } from "@/lib/supabase/prospects";
import { showingsLayer } from "@/lib/supabase/showings";
import { useMetrics } from "@/lib/metrics/client";
import { MetricDrillSheet, MetricStatsBar } from "@/components/internal/screens/orchestration/metric_kit";
import { TodayPanel } from "@/components/internal/screens/orchestration/today_panel";
import { GetStartedCard } from "./get_started_card";

// Property Overview — the workspace dashboard, laid out like the Geiger Events overview.

const TREND_MONTHS = 12;

const LOADERS = {
  properties: listProperties,
  units: listUnits,
  leases: () => leasesLayer.list(),
  // The rent trend is the ledger's tenant AR by month (ledger_ar_monthly, CORE-07).
  arMonths: () => arMonthly({ from: `${lastMonths(TREND_MONTHS)[0]}-01` }),
  workOrders: () => workOrdersLayer.list(),
  applications: () => applicationsLayer.list(),
  prospects: () => prospectsLayer.list(),
  showings: () => showingsLayer.list(),
};

// Monochrome chart inks from theme tokens, so light/dark follow the app theme.
const CHART_COLORS = {
  primary: "var(--foreground)",
  appBackground: "var(--surface-subtle)",
  grid: "var(--border)",
  tick: "var(--muted-foreground)",
};

const CHART_SERIES_COLORS = [100, 72, 50, 32, 18].map((pct) =>
  pct === 100
    ? CHART_COLORS.primary
    : `color-mix(in oklab, var(--foreground) ${pct}%, var(--surface-subtle))`,
);

// Collected = payments applied to tenant AR; billed = billedOf (lib/ledger/ar_buckets.js), the collection-rate gauge's figure too.
const TREND_METRIC_OPTIONS = [
  { value: "collected", label: "Rent collected" },
  { value: "billed", label: "Rent billed" },
  { value: "workOrders", label: "Work orders" },
];

const TOP_PROPERTIES_SORT_OPTIONS = [
  { value: "rent", label: "Monthly rent" },
  { value: "occupancy", label: "Occupancy" },
];

const HEALTH_META = {
  full: { label: "Fully leased", icon: Flame, className: "text-emerald-700 dark:text-emerald-300" },
  healthy: { label: "Healthy", icon: TrendingUp, className: "text-sky-700 dark:text-sky-300" },
  risk: { label: "Vacancy risk", icon: TrendingDown, className: "text-amber-700 dark:text-amber-300" },
  empty: { label: "No units yet", icon: Clock, className: "text-text-secondary" },
};

const inScope = (scope, propertyId) => !scope.length || scope.includes(propertyId);

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function periodDelta(current, previous) {
  if (previous <= 0) return { delta: null, trend: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { delta: `${pct >= 0 ? "+" : ""}${pct}%`, trend: pct >= 0 ? "up" : "down" };
}

function healthFor(row) {
  if (!row.total) return "empty";
  const share = row.occupied / row.total;
  if (share >= 0.95) return "full";
  if (share >= 0.8) return "healthy";
  return "risk";
}

// --- Widget frame ----------------------------------------------------------------

function WidgetShell({ children, className, contentClassName }) {
  return (
    <Card
      className={cn(
        "h-full gap-0 overflow-hidden rounded-xl border-border bg-surface-subtle py-0 text-foreground",
        className,
      )}
    >
      <CardContent className={cn("h-full p-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

function WidgetHeader({ title, subtitle, action }) {
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

// Multi-select of properties scoping a single widget (empty = all properties).
function PropertyScopeSelect({ properties, selected, onChange }) {
  const all = selected.length === 0;
  const clip = (s) => (s.length > 8 ? `${s.slice(0, 8)}…` : s);
  const label = all
    ? "All"
    : selected.length === 1
      ? clip(properties.find((p) => p.id === selected[0])?.name || "1 property")
      : `${selected.length} properties`;

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2 border-border bg-surface-card text-foreground hover:bg-surface-active"
          disabled={!properties.length}
        >
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle">
        <DropdownMenuCheckboxItem
          checked={all}
          onCheckedChange={() => onChange([])}
          onSelect={(e) => e.preventDefault()}
        >
          All Properties
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator className="bg-border" />
        {properties.map((p) => (
          <DropdownMenuCheckboxItem
            key={p.id}
            checked={selected.includes(p.id)}
            onCheckedChange={() => toggle(p.id)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="truncate">{p.name || "Untitled property"}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// --- Widgets ---------------------------------------------------------------------

function RentTrendWidget({ pending, properties, arMonths, workOrders, ledger }) {
  const [metric, setMetric] = useState(ledger ? "collected" : "workOrders");
  const [scope, setScope] = useState([]);
  const selected = TREND_METRIC_OPTIONS.find((o) => o.value === metric) || TREND_METRIC_OPTIONS[0];

  const months = useMemo(() => lastMonths(TREND_MONTHS), []);
  const byMonth = useMemo(() => sumArMonths(arMonths, { propertyIds: scope }), [arMonths, scope]);
  const scopedWork = useMemo(() => workOrders.filter((w) => inScope(scope, w.propertyId)), [workOrders, scope]);
  const hasLiveData = byMonth.size > 0 || scopedWork.length > 0;

  const data = useMemo(
    () =>
      months.map((key) => {
        const value =
          metric === "workOrders"
            ? scopedWork.filter((w) => inRange(toDate(w.createdAt), monthRange(key))).length
            : byMonth.get(key)?.[metric] || 0;
        return { label: monthLabel(key, false), value };
      }),
    [months, metric, byMonth, scopedWork],
  );

  const isMoney = metric !== "workOrders";
  const formatValue = (value) => (isMoney ? compactMoney(value) : Number(value).toLocaleString("en-US"));

  const header = (
    <WidgetHeader
      title="Rent Over Time"
      subtitle={`${selected.label} across your portfolio, by month.`}
      action={
        <div className="flex items-center gap-2">
          <PropertyScopeSelect properties={properties} selected={scope} onChange={setScope} />
          <FilterDropdown value={metric} onValueChange={setMetric} options={TREND_METRIC_OPTIONS} height="h-9" />
        </div>
      }
    />
  );

  // Rent series come from the ledger: a role without accounting access sees a locked state, never a flat $0 line.
  if (isMoney && !ledger) {
    return (
      <WidgetShell contentClassName="flex flex-col">
        {header}
        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
          <EmptyState icon={Lock} title={LEDGER_LOCKED} description="Rent collected and billed come from the ledger. Work orders still chart here." />
        </div>
      </WidgetShell>
    );
  }

  // Mid-fetch the line sits flat on zero and animates up when the numbers land.
  if (!pending && !hasLiveData) {
    return (
      <WidgetShell contentClassName="flex flex-col">
        {header}
        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={TrendingUp}
            title="No activity yet"
            description="Rent charges, payments, and work orders will chart here once they're recorded."
          />
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell contentClassName="flex flex-col">
      {header}
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer
          config={{ value: { label: selected.label, color: CHART_COLORS.primary } }}
          className="mx-auto h-full w-full"
        >
          <LineChart data={data} margin={{ top: 24, right: 16, left: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: CHART_COLORS.tick, fontSize: 11 }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  hideLabel
                  formatter={(value) => (
                    <span className="font-medium tabular-nums text-foreground">
                      {isMoney ? currency(value) : formatValue(value)}
                    </span>
                  )}
                />
              }
            />
            <Line
              dataKey="value"
              type="monotone"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              dot={{ fill: CHART_COLORS.primary, r: 3 }}
              activeDot={{ r: 5 }}
            >
              <LabelList
                dataKey="value"
                position="top"
                offset={10}
                className="fill-foreground"
                fontSize={11}
                formatter={formatValue}
              />
            </Line>
          </LineChart>
        </ChartContainer>
      </div>
    </WidgetShell>
  );
}

function UnitMixWidget({ pending, units }) {
  const mix = useMemo(
    () =>
      Object.keys(UNIT_STATUS_MAP)
        .filter((status) => status !== "Draft")
        .map((status) => ({
          key: status,
          label: UNIT_STATUS_MAP[status].label,
          value: units.filter((u) => u.status === status).length,
        }))
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value),
    [units],
  );

  const [selectedType, setSelectedType] = useState(null);
  const activeType = mix.some((item) => item.key === selectedType) ? selectedType : mix[0]?.key ?? null;

  const total = mix.reduce((sum, item) => sum + item.value, 0);
  const chartData = mix.map((item, index) => ({
    ...item,
    fill: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
  }));
  const selectedIndex = Math.max(chartData.findIndex((item) => item.key === activeType), 0);
  const selectedItem = chartData[selectedIndex] || chartData[0];
  const chartConfig = Object.fromEntries(
    mix.map((item, index) => [
      item.key,
      { label: item.label, color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] },
    ]),
  );

  // A donut has no zero shape, so mid-fetch it holds an empty ring on the same geometry.
  if (pending && !mix.length) {
    return (
      <WidgetShell contentClassName="flex flex-col">
        <WidgetHeader title="Unit Status Mix" subtitle="How your units are split by status." />
        <div className="relative mt-4 flex min-h-0 w-full flex-1 items-center justify-center">
          <div className="h-[156px] w-[156px] rounded-full border-[34px] border-border" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <span className="text-3xl font-bold leading-none text-foreground">0</span>
            <span className="mt-1 text-xs font-medium text-muted-foreground">0% share</span>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-text-secondary">0 of 0 units</p>
      </WidgetShell>
    );
  }

  if (!mix.length) {
    return (
      <WidgetShell contentClassName="flex flex-col">
        <WidgetHeader title="Unit Status Mix" subtitle="How your units are split by status." />
        <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
          <EmptyState icon={Building2} title="No units yet" description="Add units to see them split by status." />
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Unit Status Mix"
        subtitle="How your units are split by status."
        action={
          <FilterDropdown
            value={activeType}
            onValueChange={setSelectedType}
            options={mix.map((item) => ({ value: item.key, label: item.label }))}
            height="h-9"
          />
        }
      />
      <div className="relative mt-4 flex min-h-0 w-full flex-1 items-center justify-center">
        <ChartContainer config={chartConfig} className="mx-auto h-[220px] w-[220px]">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="key"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={78}
              activeIndex={selectedIndex}
              activeShape={{ outerRadius: 88 }}
              stroke={CHART_COLORS.appBackground}
              strokeWidth={2}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="text-3xl font-bold leading-none text-foreground">{selectedItem?.value}</span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">
            {total > 0 ? Math.round((selectedItem.value / total) * 100) : 0}% share
          </span>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-text-secondary">
        {selectedItem?.value.toLocaleString("en-US")} of {plural(total, "unit")} {selectedItem?.label.toLowerCase()}
      </p>
    </WidgetShell>
  );
}

function LeasingFunnelWidget({ stages }) {
  const top = stages[0]?.value || 0;
  const bottom = stages[stages.length - 1]?.value || 0;
  const overall = top > 0 ? Math.round((bottom / top) * 100) : 0;
  const chartData = stages.map((stage) => ({
    ...stage,
    share: top > 0 ? Math.round((stage.value / top) * 100) : 0,
  }));

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Leasing Funnel"
        subtitle="Share of prospects reaching each step toward a signed lease."
        action={
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-3xl font-bold leading-none text-foreground">{overall}%</span>
            <span className="mt-1 text-[11px] text-text-secondary">prospect → lease</span>
          </div>
        }
      />
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer
          config={{ share: { label: "Share of prospects", color: CHART_COLORS.primary } }}
          className="mx-auto aspect-square h-full max-h-[210px]"
        >
          <RadarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  nameKey="key"
                  formatter={(value, name, item) => (
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{item.payload.label}</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {item.payload.value.toLocaleString("en-US")} · {item.payload.share}%
                      </span>
                    </span>
                  )}
                />
              }
            />
            <PolarGrid stroke={CHART_COLORS.grid} />
            <PolarAngleAxis dataKey="short" tick={{ fill: CHART_COLORS.tick, fontSize: 11 }} />
            <Radar
              dataKey="share"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              fill={CHART_COLORS.primary}
              fillOpacity={0.5}
              dot={{
                r: 4,
                fill: CHART_COLORS.primary,
                fillOpacity: 1,
                stroke: CHART_COLORS.appBackground,
                strokeWidth: 1.5,
              }}
            />
          </RadarChart>
        </ChartContainer>
      </div>
    </WidgetShell>
  );
}

function GaugeWidget({ title, subtitle, caption, properties, compute }) {
  const [scope, setScope] = useState([]);
  // `locked`: the figure needs a permission the viewer lacks, so the dial reads "—" rather than 0%.
  const { pct, footnote, locked } = useMemo(() => compute(scope), [compute, scope]);
  const clamped = Math.max(0, Math.min(100, pct));
  const endAngle = 90 - (clamped / 100) * 360;

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title={title}
        subtitle={subtitle}
        action={<PropertyScopeSelect properties={properties} selected={scope} onChange={setScope} />}
      />
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer
          config={{ value: { label: caption, color: CHART_COLORS.primary } }}
          className="mx-auto aspect-square h-full max-h-[190px]"
        >
          <RadialBarChart
            data={[{ name: caption, value: clamped, fill: CHART_COLORS.primary }]}
            startAngle={90}
            endAngle={endAngle}
            innerRadius={72}
            outerRadius={104}
          >
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              polarRadius={[78, 66]}
              className="first:fill-surface-hover last:fill-surface-card"
            />
            <RadialBar dataKey="value" cornerRadius={8} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                          {locked ? "—" : `${clamped}%`}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 22}
                          className="fill-muted-foreground text-xs font-medium"
                        >
                          {caption}
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </div>
      {footnote ? <p className="mt-1 text-center text-xs text-text-secondary">{footnote}</p> : null}
    </WidgetShell>
  );
}

function TopPropertiesTable({ pending, properties, rows }) {
  const [sortBy, setSortBy] = useState("rent");
  const [scope, setScope] = useState([]);
  const { openItemInTab } = useWorkspaceUrl();

  const sorted = rows
    .filter((r) => inScope(scope, r.id))
    .sort((a, b) =>
      sortBy === "rent"
        ? b.rent - a.rent
        : (b.total ? b.occupied / b.total : -1) - (a.total ? a.occupied / a.total : -1),
    )
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <WidgetHeader title="Top Performing Properties" subtitle="Ranked by scheduled rent and occupancy." />
        <div className="flex items-center gap-2">
          <PropertyScopeSelect properties={properties} selected={scope} onChange={setScope} />
          <FilterDropdown value={sortBy} onValueChange={setSortBy} options={TOP_PROPERTIES_SORT_OPTIONS} height="h-9" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        {/* Mid-fetch the table keeps its header and no rows rather than declaring it empty. */}
        {sorted.length === 0 && !pending ? (
          <EmptyState icon={Building2} title="No properties yet" description="Add a property to see it ranked here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Property</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px]">Occupancy</TableHead>
                <TableHead className="text-right">Monthly rent</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const pct = row.total ? Math.round((row.occupied / row.total) * 100) : 0;
                const meta = HEALTH_META[healthFor(row)];
                const HealthIcon = meta.icon;
                return (
                  <TableRow key={row.id} className="border-border">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">{row.name}</span>
                        <p className="text-xs text-text-secondary">
                          {row.occupied} / {plural(row.total, "unit")} occupied
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusPill status={row.status} map={propertiesConfig.statusMap} />
                    </TableCell>
                    <TableCell>
                      <div className="w-[140px] space-y-1.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                          <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-text-secondary">{pct}%</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-foreground">
                      {currency(row.rent)}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.className)}>
                        <HealthIcon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Open ${row.name}`}
                        className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={() => openItemInTab(row.id, "Properties")}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// --- Screen ----------------------------------------------------------------------

// KPI tiles and gauges read the shared metrics layer (lib/metrics), so the Overview, the reports and
// the signals engine agree; every tile opens the records behind its number.
const KPI_METRICS = [
  "occupancy",
  "rent_collected",
  "delinquent_balance",
  "delinquent_accounts",
  "open_work_orders",
  "urgent_work_orders",
  "collection_rate",
  "rent_billed",
];

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function PropertyOverviewScreen() {
  const { loading, data } = useReportData(LOADERS);
  const metrics = useMetrics(KPI_METRICS);
  const [today] = useState(() => startOfDay(new Date()));
  const [drill, setDrill] = useState(null);
  // The leasing funnel belongs to Leasing & screening; it leaves the Overview while that module is off.
  const leasingOn = useModules().isOn("leasing");
  // Rent figures come from the ledger; without accounting access they read "—" (CORE-07).
  const ledger = useLedgerAccess();

  // No skeleton: the page lays out at zero and fills in once the fetch lands.
  const src = useMemo(
    () => Object.fromEntries(Object.keys(LOADERS).map((k) => [k, data[k] || []])),
    [data],
  );

  const model = useMemo(() => {
    const unitsById = byId(src.units);
    const units = src.units.filter((u) => u.status !== "Draft");
    const workOrders = src.workOrders.map((w) => ({ ...w, propertyId: propertyIdOf(w, unitsById) }));
    const activeLeases = src.leases.filter((l) => ACTIVE_LEASE_STATUSES.includes(l.status));

    // Per-property rollup for the ranking table.
    const propertyRows = src.properties.map((p) => {
      const own = units.filter((u) => u.propertyId === p.id);
      const occ = own.filter((u) => OCCUPIED_STATUSES.includes(u.status));
      return {
        id: p.id,
        name: p.name || "Untitled property",
        status: p.status,
        total: own.length,
        occupied: occ.length,
        rent: sumBy(occ, (u) => u.rent),
      };
    });

    const funnel = [
      { key: "prospects", label: "Prospects", short: "Prospects", value: src.prospects.length },
      {
        key: "showings",
        label: "Showings held or booked",
        short: "Showings",
        value: src.showings.filter((s) => s.status !== "Cancelled").length,
      },
      { key: "applications", label: "Applications", short: "Applied", value: src.applications.length },
      {
        key: "leases",
        label: "Leases signed",
        short: "Leased",
        value: src.leases.filter((l) => l.status && l.status !== "Draft").length,
      },
    ];

    return { units, workOrders, activeLeases, propertyRows, funnel };
  }, [src]);

  const workspaceSummary = [
    { label: "Properties", value: String(src.properties.length) },
    { label: "Units", value: String(model.units.length) },
    { label: "Active Leases", value: String(model.activeLeases.length) },
  ];

  const m = metrics.metrics;
  const show = (key) => (metrics.loading ? "0" : m[key]?.display ?? "—");
  const lastMonth = useMemo(() => {
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { asOf: isoDay(end), from: isoDay(new Date(end.getFullYear(), end.getMonth(), 1)), to: isoDay(end) };
  }, [today]);
  const collectedLast = metrics.loading ? 0 : metrics.compute("rent_collected", lastMonth)?.value || 0;
  const collectedDelta = periodDelta(m.rent_collected?.value || 0, collectedLast);
  const open = (metricKey) => setDrill({ metricKey, result: m[metricKey], records: metrics.records(metricKey) });

  const stats = [
    {
      label: "Occupancy",
      value: show("occupancy"),
      footer: m.occupancy ? `${m.occupancy.count} of ${plural(model.units.length, "unit")} occupied` : "Occupied or covered by a lease",
      onClick: () => open("occupancy"),
    },
    ledger
      ? {
          label: "Rent Collected",
          value: show("rent_collected"),
          delta: collectedDelta.delta,
          trend: collectedDelta.trend,
          footer: "VS Last Month",
          onClick: () => open("rent_collected"),
        }
      : { label: "Rent Collected", value: "—", footer: LEDGER_LOCKED },
    ledger
      ? {
          label: "Delinquent Balance",
          value: show("delinquent_balance"),
          footer: `${plural(m.delinquent_accounts?.value || 0, "account")} owing`,
          onClick: () => open("delinquent_balance"),
        }
      : { label: "Delinquent Balance", value: "—", footer: LEDGER_LOCKED },
    {
      label: "Open Work Orders",
      value: show("open_work_orders"),
      footer: `${m.urgent_work_orders?.value || 0} urgent or high`,
      onClick: () => open("open_work_orders"),
    },
  ];

  const occupancyCompute = useCallback(
    (scope) => {
      const r = metrics.loading ? null : metrics.compute("occupancy", { propertyIds: scope });
      const total = model.units.filter((u) => inScope(scope, u.propertyId)).length;
      const occ = r?.count || 0;
      return {
        pct: r?.value ? Math.round(r.value * 100) : 0,
        footnote: `${occ.toLocaleString("en-US")} of ${plural(total, "Unit")} Occupied`,
      };
    },
    [metrics, model],
  );

  const collectionCompute = useCallback(
    (scope) => {
      if (!ledger) return { pct: 0, footnote: LEDGER_LOCKED, locked: true };
      if (metrics.loading) return { pct: 0, footnote: "Loading…" };
      const rate = metrics.compute("collection_rate", { propertyIds: scope })?.value;
      const billed = metrics.compute("rent_billed", { propertyIds: scope })?.value || 0;
      const collected = metrics.compute("rent_collected", { propertyIds: scope })?.value || 0;
      return {
        pct: rate ? Math.round(rate * 100) : 0,
        footnote: `${currency(collected)} of ${currency(billed)} Collected`,
      };
    },
    [metrics, ledger],
  );

  return (
    <MainScreenWrapper>
      <div className="mt-2">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-center text-2xl font-bold tracking-tight text-foreground md:text-left">
              Property Overview
            </h1>
            <p className="mt-1 text-center text-sm text-muted-foreground md:text-left">
              Track occupancy, rent collection, leasing, and maintenance across your portfolio.
            </p>
          </div>
          <div className="flex w-full md:w-auto">
            {workspaceSummary.map((stat, i) => {
              const last = i === workspaceSummary.length - 1;
              return (
                <div
                  key={stat.label}
                  className={cn(
                    "flex flex-1 flex-col items-center md:flex-none",
                    i === 0 && "md:pr-8",
                    i > 0 && "border-l border-border",
                    i > 0 && !last && "md:px-8",
                    last && i > 0 && "md:pl-8",
                  )}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                    {stat.label}
                  </span>
                  <RollingNumber value={stat.value} className="mt-0.5 text-2xl font-bold text-foreground" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <GetStartedCard />

      <MetricStatsBar stats={stats} />

      <TodayPanel />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[360px] lg:col-span-2">
          <RentTrendWidget
            pending={loading}
            properties={src.properties}
            arMonths={src.arMonths}
            workOrders={model.workOrders}
            ledger={ledger}
          />
        </div>
        <div className="h-[360px]">
          <UnitMixWidget pending={loading} units={model.units} />
        </div>
      </div>

      <div className={cn("grid grid-cols-1 gap-4", leasingOn ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {leasingOn ? (
          <div className="h-[300px]">
            <LeasingFunnelWidget stages={model.funnel} />
          </div>
        ) : null}
        <div className="h-[300px]">
          <GaugeWidget
            title="Occupancy Rate"
            subtitle="Units occupied or covered by a lease vs. total."
            caption="Occupied"
            properties={src.properties}
            compute={occupancyCompute}
          />
        </div>
        <div className="h-[300px]">
          <GaugeWidget
            title="Collection Rate"
            subtitle="Rent collected vs. billed this month."
            caption="Collected"
            properties={src.properties}
            compute={collectionCompute}
          />
        </div>
      </div>

      <TopPropertiesTable pending={loading} properties={src.properties} rows={model.propertyRows} />

      <MetricDrillSheet drill={drill} onClose={() => setDrill(null)} />
    </MainScreenWrapper>
  );
}

export default PropertyOverviewScreen;
