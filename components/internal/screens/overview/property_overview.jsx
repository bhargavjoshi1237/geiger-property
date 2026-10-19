"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  FilePen,
  Flame,
  Receipt,
  Repeat,
  TrendingDown,
  TrendingUp,
  Wrench,
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
  StatsBar,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { propertiesConfig } from "@/components/internal/screens/properties/config";
import { useReportData } from "@/components/internal/screens/reports/report_kit";
import {
  ACTIVE_LEASE_STATUSES,
  OCCUPIED_STATUSES,
  UNIT_STATUS_MAP,
  agingOf,
  balanceOf,
  billOpenAmount,
  byId,
  compactMoney,
  currency,
  daysBetween,
  inRange,
  lastMonths,
  ledgerOf,
  monthLabel,
  monthRange,
  norm,
  percent,
  periodRange,
  propertyIdOf,
  startOfDay,
  sumBy,
  toDate,
} from "@/components/internal/screens/reports/shared";
import FilterDropdown from "./filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listUnits } from "@/lib/supabase/units";
import { listProperties } from "@/lib/supabase/properties";
import { leasesLayer } from "@/lib/supabase/leases";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import { workOrdersLayer } from "@/lib/supabase/work_orders";
import { applicationsLayer } from "@/lib/supabase/applications";
import { renewalsLayer } from "@/lib/supabase/renewals";
import { billsLayer } from "@/lib/supabase/bills";
import { movesLayer } from "@/lib/supabase/moves";
import { prospectsLayer } from "@/lib/supabase/prospects";
import { showingsLayer } from "@/lib/supabase/showings";

// Property Overview — the workspace dashboard, laid out like the Geiger Events overview.

const LOADERS = {
  properties: listProperties,
  units: listUnits,
  leases: () => leasesLayer.list(),
  accounts: () => rentAccountsLayer.list(),
  workOrders: () => workOrdersLayer.list(),
  applications: () => applicationsLayer.list(),
  renewals: () => renewalsLayer.list(),
  bills: () => billsLayer.list(),
  moves: () => movesLayer.list(),
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

const CLOSED_WORK = ["Completed", "Rejected", "Converted", "Cancelled", "Closed", "Draft"];
const PENDING_APPS = ["Submitted", "Screening"];

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

const URGENCY_ORDER = ["urgent", "soon", "routine"];
const URGENCY_LABELS = { urgent: "Urgent", soon: "Soon", routine: "Routine" };

const inScope = (scope, propertyId) => !scope.length || scope.includes(propertyId);

const names = (rows, pick, max = 3) => {
  const list = rows.map(pick).filter(Boolean);
  const head = list.slice(0, max).join(", ");
  return list.length > max ? `${head} +${list.length - max} more` : head;
};

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

function RentTrendWidget({ pending, properties, ledgers, workOrders }) {
  const [metric, setMetric] = useState("collected");
  const [scope, setScope] = useState([]);
  const selected = TREND_METRIC_OPTIONS.find((o) => o.value === metric) || TREND_METRIC_OPTIONS[0];

  const months = useMemo(() => lastMonths(12), []);
  const scopedLedgers = useMemo(() => ledgers.filter((l) => inScope(scope, l.propertyId)), [ledgers, scope]);
  const scopedWork = useMemo(() => workOrders.filter((w) => inScope(scope, w.propertyId)), [workOrders, scope]);
  const hasLiveData = scopedLedgers.length > 0 || scopedWork.length > 0;

  const data = useMemo(
    () =>
      months.map((key) => {
        const range = monthRange(key);
        const value =
          metric === "workOrders"
            ? scopedWork.filter((w) => inRange(toDate(w.createdAt), range)).length
            : sumBy(scopedLedgers, (l) =>
                sumBy(
                  (metric === "billed" ? l.charges : l.payments).filter((e) => inRange(e.date, range)),
                  (e) => e.amount,
                ),
              );
        return { label: monthLabel(key, false), value };
      }),
    [months, metric, scopedLedgers, scopedWork],
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
  const { pct, footnote } = useMemo(() => compute(scope), [compute, scope]);
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
                          {clamped}%
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

function NeedsAttentionCard({ items }) {
  const { setTab } = useWorkspaceUrl();
  const sorted = [...items].sort(
    (a, b) => URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency),
  );
  const open = items.filter((i) => i.count > 0).length;

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Needs Attention"
        subtitle="Open items across rent, maintenance, leasing, and payables."
        action={
          <span className="shrink-0 rounded-md border border-border bg-surface-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {open} Open
          </span>
        }
      />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.tab)}
              className="group flex cursor-pointer items-center gap-3.5 rounded-xl p-3.5 text-left transition-colors hover:bg-surface-card"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                <Icon className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{item.label}</span>
                  <span className="shrink-0 rounded-md border border-border bg-surface-card px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                    {URGENCY_LABELS[item.urgency]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-text-secondary">{item.hint}</p>
              </div>
              <span className="shrink-0 text-xl font-bold tabular-nums text-foreground">{item.count}</span>
              <ChevronRight className="h-3 w-3 shrink-0 text-text-secondary transition-colors group-hover:text-foreground" />
            </button>
          );
        })}
      </div>
    </WidgetShell>
  );
}

// --- Screen ----------------------------------------------------------------------

export function PropertyOverviewScreen() {
  const { loading, data } = useReportData(LOADERS);
  const [today] = useState(() => startOfDay(new Date()));

  // No skeleton: the page lays out at zero and fills in once the fetch lands.
  const src = useMemo(
    () => Object.fromEntries(Object.keys(LOADERS).map((k) => [k, data[k] || []])),
    [data],
  );

  const model = useMemo(() => {
    const unitsById = byId(src.units);
    const units = src.units.filter((u) => u.status !== "Draft");
    const occupiedUnits = units.filter((u) => OCCUPIED_STATUSES.includes(u.status));
    const month = periodRange("this_month", today);
    const lastMonth = periodRange("last_month", today);

    const ledgers = src.accounts.map((a) => ({
      account: a,
      propertyId: propertyIdOf(a, unitsById),
      ...ledgerOf(a, today),
    }));
    const sumIn = (kind, range, rows = ledgers) =>
      sumBy(rows, (l) => sumBy(l[kind].filter((e) => inRange(e.date, range)), (e) => e.amount));

    const workOrders = src.workOrders.map((w) => ({ ...w, propertyId: propertyIdOf(w, unitsById) }));
    const openWork = workOrders.filter((w) => !CLOSED_WORK.includes(w.status));
    const hotWork = openWork.filter((w) => w.priority === "Urgent" || w.priority === "High");
    const owing = src.accounts.filter((a) => balanceOf(a) > 0);
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

    // Needs attention
    const overdueRent = owing
      .map((a) => ({ a, aging: agingOf(a, today) }))
      .filter(
        ({ a, aging }) =>
          a.status === "Overdue" || a.status === "In collections" || aging.total - aging.b0 > 0,
      );
    const renewed = new Set(src.renewals.map((r) => r.leaseId).filter(Boolean));
    const renewedUnitTenant = new Set(
      src.renewals.map((r) => `${r.unitId || norm(r.unit)}|${r.tenantId || norm(r.tenantName)}`),
    );
    const expiring = activeLeases.filter((l) => {
      const end = toDate(l.termEnd);
      if (!end) return false;
      const days = daysBetween(today, end);
      return (
        days >= 0 &&
        days <= 60 &&
        !renewed.has(l.id) &&
        !renewedUnitTenant.has(`${l.unitId || norm(l.unit)}|${l.tenantId || norm(l.tenantName)}`)
      );
    });
    const pendingApps = src.applications.filter((a) => PENDING_APPS.includes(a.status));
    const overdueBills = src.bills.filter((b) => {
      const due = toDate(b.dueDate);
      return due && due < today && billOpenAmount(b) > 0;
    });
    const moves = src.moves.filter((m) => {
      const date = toDate(m.moveDate);
      if (!date || m.status === "Complete") return false;
      const d = daysBetween(today, date);
      return d >= 0 && d <= 30;
    });

    const attention = [
      {
        key: "rent",
        tab: "Rent Collection",
        icon: CircleDollarSign,
        label: "Overdue rent",
        urgency: "urgent",
        count: overdueRent.length,
        hint: overdueRent.length
          ? `${currency(sumBy(overdueRent, ({ aging }) => aging.total))} owed · ${names(overdueRent, ({ a }) => a.tenantName || a.name)}`
          : "Every account is current",
      },
      {
        key: "work",
        tab: "Work Orders",
        icon: Wrench,
        label: "Urgent work orders",
        urgency: "urgent",
        count: hotWork.length,
        hint: hotWork.length ? names(hotWork, (w) => w.name) : "Nothing urgent or high priority",
      },
      {
        key: "bills",
        tab: "Bills & Payables",
        icon: Receipt,
        label: "Overdue bills",
        urgency: "urgent",
        count: overdueBills.length,
        hint: overdueBills.length
          ? `${currency(sumBy(overdueBills, billOpenAmount))} past due`
          : "No bills past due",
      },
      {
        key: "renewals",
        tab: "Renewals",
        icon: Repeat,
        label: "Expiring leases",
        urgency: "soon",
        count: expiring.length,
        hint: "Ending within 60 days, no renewal",
      },
      {
        key: "moves",
        tab: "Move-ins & Move-outs",
        icon: ArrowLeftRight,
        label: "Upcoming moves",
        urgency: "soon",
        count: moves.length,
        hint: "Move-ins and move-outs in the next 30 days",
      },
      {
        key: "apps",
        tab: "Applications",
        icon: FilePen,
        label: "Pending applications",
        urgency: "routine",
        count: pendingApps.length,
        hint: "Awaiting a screening decision",
      },
    ];

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

    return {
      units,
      occupiedUnits,
      ledgers,
      workOrders,
      openWork,
      hotWork,
      owing,
      activeLeases,
      propertyRows,
      attention,
      funnel,
      sumIn,
      month,
      collected: sumIn("payments", month),
      collectedLast: sumIn("payments", lastMonth),
      billed: sumIn("charges", month),
      delinquent: sumBy(owing, balanceOf),
    };
  }, [src, today]);

  const workspaceSummary = [
    { label: "Properties", value: String(src.properties.length) },
    { label: "Units", value: String(model.units.length) },
    { label: "Active Leases", value: String(model.activeLeases.length) },
  ];

  const collectedDelta = periodDelta(model.collected, model.collectedLast);
  const stats = [
    {
      label: "Occupancy",
      value: percent(model.occupiedUnits.length, model.units.length),
      footer: `${model.occupiedUnits.length} of ${plural(model.units.length, "unit")}`,
    },
    {
      label: "Rent Collected",
      value: currency(model.collected),
      delta: collectedDelta.delta,
      trend: collectedDelta.trend,
      footer: "VS Last Month",
    },
    {
      label: "Delinquent Balance",
      value: currency(model.delinquent),
      footer: `${plural(model.owing.length, "account")} owing`,
    },
    {
      label: "Open Work Orders",
      value: String(model.openWork.length),
      footer: `${model.hotWork.length} urgent or high`,
    },
  ];

  const occupancyCompute = useCallback(
    (scope) => {
      const scoped = model.units.filter((u) => inScope(scope, u.propertyId));
      const occ = scoped.filter((u) => OCCUPIED_STATUSES.includes(u.status)).length;
      return {
        pct: scoped.length ? Math.round((occ / scoped.length) * 100) : 0,
        footnote: `${occ.toLocaleString("en-US")} of ${plural(scoped.length, "Unit")} Occupied`,
      };
    },
    [model],
  );

  const collectionCompute = useCallback(
    (scope) => {
      const scoped = model.ledgers.filter((l) => inScope(scope, l.propertyId));
      const billed = model.sumIn("charges", model.month, scoped);
      const collected = model.sumIn("payments", model.month, scoped);
      return {
        pct: billed > 0 ? Math.round((collected / billed) * 100) : 0,
        footnote: `${currency(collected)} of ${currency(billed)} Collected`,
      };
    },
    [model],
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

      <StatsBar stats={stats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-[360px] lg:col-span-2">
          <RentTrendWidget
            pending={loading}
            properties={src.properties}
            ledgers={model.ledgers}
            workOrders={model.workOrders}
          />
        </div>
        <div className="h-[360px]">
          <UnitMixWidget pending={loading} units={model.units} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-[300px]">
          <LeasingFunnelWidget stages={model.funnel} />
        </div>
        <div className="h-[300px]">
          <GaugeWidget
            title="Occupancy Rate"
            subtitle="Occupied or on-notice units vs. total."
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

      <NeedsAttentionCard items={model.attention} />
    </MainScreenWrapper>
  );
}

export default PropertyOverviewScreen;
