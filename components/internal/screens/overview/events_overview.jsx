"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowUpRight,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Flame,
  Gauge,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Wallet,
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { RollingNumber, StatsBar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "./filter_dropdown";
import { cn } from "@/lib/utils";

const CHART_COLORS = {
  primary: "#ffffff",
  appBackground: "#161616",
};

const CHART_SERIES_COLORS = ["#ffffff", "#d4d4d4", "#a3a3a3", "#737373", "#525252"];

// --- Sample data (placeholder until backend is connected) --------------------

// Compact workspace summary shown beside the page title.
const WORKSPACE_SUMMARY = [
  { label: "Events", value: "24" },
  { label: "Upcoming", value: "6" },
  { label: "Attendees", value: "3,420" },
];

const STATS = [
  { label: "Registrations", value: "1,284", delta: "+12.5%", trend: "up", footer: "vs last period" },
  { label: "Ticket Revenue", value: "$24,860", delta: "+8.2%", trend: "up", footer: "vs last period" },
  { label: "Check-ins", value: "962", delta: "+5.1%", trend: "up", footer: "vs last period" },
  { label: "New RSVPs", value: "148", delta: "-3.4%", trend: "down", footer: "vs last period" },
];

const TREND_SERIES = {
  rsvps: [40, 62, 55, 80, 72, 96, 110, 105, 130, 148, 160, 182],
  tickets: [20, 35, 30, 48, 52, 60, 75, 82, 90, 104, 120, 138],
  revenue: [400, 720, 650, 980, 1100, 1450, 1600, 1820, 2100, 2480, 2750, 3120],
};

const REGISTRATION_RANGE_OPTIONS = [
  { value: "rsvps", label: "RSVPs" },
  { value: "tickets", label: "Tickets sold" },
  { value: "revenue", label: "Revenue" },
];

const TICKET_MIX = [
  { key: "paid", label: "Paid", value: 620 },
  { key: "free", label: "Free", value: 540 },
  { key: "vip", label: "VIP", value: 124 },
];

// Acquisition funnel — where the audience drops off on the way to a ticket.
// `short` is the compact label used around the radar's polar axis.
const CONVERSION_FUNNEL = [
  { key: "views", label: "Event page views", short: "Views", value: 8420 },
  { key: "started", label: "Registration started", short: "Started", value: 2140 },
  { key: "completed", label: "Registration completed", short: "Completed", value: 1284 },
  { key: "paid", label: "Tickets purchased", short: "Purchased", value: 744 },
];

// Attendee lifecycle gauges that sit beside the funnel (same ratio).
const SELL_THROUGH = { value: 78, sold: 1544, capacity: 1980 };
const ATTENDANCE = { value: 82, attended: 962, registered: 1173 };

// Events ranked by performance for the selected period.
const TOP_EVENTS = [
  { name: "Summer Product Launch", status: "On sale", revenue: 9840, sold: 312, capacity: 400, momentum: "fast" },
  { name: "Local Music Night", status: "Sold out", revenue: 5400, sold: 300, capacity: 300, momentum: "track" },
  { name: "Founder AMA — Live", status: "On sale", revenue: 3120, sold: 128, capacity: 150, momentum: "fast" },
  { name: "Design Systems Workshop", status: "Draft", revenue: 2160, sold: 54, capacity: 80, momentum: "slow" },
  { name: "Indie Film Screening", status: "On sale", revenue: 1480, sold: 74, capacity: 120, momentum: "slow" },
];

const MOMENTUM_META = {
  fast: { label: "Selling fast", icon: Flame, className: "text-emerald-300" },
  track: { label: "On track", icon: TrendingUp, className: "text-sky-300" },
  slow: { label: "Slow", icon: TrendingDown, className: "text-amber-300" },
};

const EVENT_STATUS_META = {
  "On sale": "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  "Sold out": "border-sky-500/20 bg-sky-500/10 text-sky-400",
  Draft: "border-border bg-surface-card text-muted-foreground",
};

// Operational tasks waiting on the organizer — the reason to open this screen.
// `count` is the numeric weight used by the urgency breakdown chart.
const ATTENTION_ITEMS = [
  { key: "refunds", label: "Refund requests", hint: "Awaiting your decision", value: "3", count: 3, cta: "Process", icon: RotateCcw, urgency: "urgent" },
  { key: "failed", label: "Failed payments", hint: "Retry to recover $410", value: "5", count: 5, cta: "Retry", icon: CreditCard, urgency: "urgent" },
  { key: "waitlist", label: "Waitlist approvals", hint: "Across 3 events", value: "12", count: 12, cta: "Review", icon: Clock, urgency: "soon" },
  { key: "capacity", label: "Events near capacity", hint: "Over 90% sold", value: "4", count: 4, cta: "Manage", icon: Gauge, urgency: "soon" },
  { key: "payout", label: "Payout available", hint: "Next payout Jun 10", value: "$8,240", count: 1, cta: "Withdraw", icon: Wallet, urgency: "routine" },
  { key: "drafts", label: "Unpublished drafts", hint: "Ready to go live", value: "2", count: 2, cta: "Publish", icon: FileText, urgency: "routine" },
];

const URGENCY_ORDER = ["urgent", "soon", "routine"];

const URGENCY_LABELS = { urgent: "Urgent", soon: "Soon", routine: "Routine" };

// --- Widgets -----------------------------------------------------------------

function WidgetShell({ children, className, contentClassName }) {
  return (
    <Card
      className={cn(
        "bg-surface-subtle border-border text-foreground rounded-xl py-0 gap-0 overflow-hidden h-full",
        className,
      )}
    >
      <CardContent className={cn("p-4 h-full", contentClassName)}>{children}</CardContent>
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

// --- Registrations over time (line + label, with detail) ---------------------

function RegistrationsTrendWidget() {
  const [metric, setMetric] = useState("rsvps");
  const selected =
    REGISTRATION_RANGE_OPTIONS.find((o) => o.value === metric) ||
    REGISTRATION_RANGE_OPTIONS[0];
  const series = TREND_SERIES[metric];
  const data = series.map((value, i) => ({ label: `W${i + 1}`, value }));
  const isRevenue = metric === "revenue";
  const formatValue = (value) =>
    isRevenue ? `$${value.toLocaleString()}` : value.toLocaleString();

  // Trend detail: change from the start to the end of the selected range.
  const first = series[0];
  const last = series[series.length - 1];
  const changePct = first ? Math.round(((last - first) / first) * 100) : 0;
  const trendingUp = changePct >= 0;
  const TrendArrow = trendingUp ? TrendingUp : TrendingDown;
  const total = series.reduce((sum, value) => sum + value, 0);

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Registrations Over Time"
        subtitle={`${selected.label} across your events.`}
        action={
          <FilterDropdown
            value={metric}
            onValueChange={setMetric}
            options={REGISTRATION_RANGE_OPTIONS}
            height="h-9"
          />
        }
      />
      <div className="mt-4 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer
          config={{ value: { label: selected.label, color: CHART_COLORS.primary } }}
          className="mx-auto h-full w-full"
        >
          <LineChart data={data} margin={{ top: 24, right: 16, left: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#2a2a2a" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "#737373", fontSize: 11 }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="line"
                  hideLabel
                  formatter={(value) => (
                    <span className="font-medium tabular-nums text-foreground">
                      {formatValue(value)}
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
              isAnimationActive={true}
            >
              <LabelList
                dataKey="value"
                position="top"
                offset={10}
                className="fill-[#ededed]"
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

// --- Ticket type mix (donut) -------------------------------------------------

function TicketMixWidget() {
  const [selectedType, setSelectedType] = useState(TICKET_MIX[0].key);
  const total = TICKET_MIX.reduce((sum, item) => sum + item.value, 0);
  const chartData = TICKET_MIX.map((item, index) => ({
    ...item,
    fill: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
  }));
  const selectedIndex = Math.max(
    chartData.findIndex((item) => item.key === selectedType),
    0,
  );
  const selectedItem = chartData[selectedIndex] || chartData[0];
  const typeOptions = TICKET_MIX.map((item) => ({ value: item.key, label: item.label }));
  const chartConfig = TICKET_MIX.reduce(
    (config, item, index) => ({
      ...config,
      [item.key]: {
        label: item.label,
        color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
      },
    }),
    {},
  );

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Ticket Type Mix"
        subtitle="Distribution across ticket types."
        action={
          <FilterDropdown
            value={selectedType}
            onValueChange={setSelectedType}
            options={typeOptions}
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
              onMouseEnter={(_, index) => {
                setSelectedType(chartData[index]?.key || selectedType);
              }}
              stroke={CHART_COLORS.appBackground}
              strokeWidth={2}
              isAnimationActive={true}
            />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="text-3xl font-bold leading-none text-foreground">{selectedItem?.value}</span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">{selectedItem?.label}</span>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-text-secondary">
        {selectedItem?.label} is {Math.round((selectedItem.value / total) * 100)}% of {total.toLocaleString()} tickets
      </p>
    </WidgetShell>
  );
}

// --- Conversion funnel (radar chart — dots) ----------------------------------

function ConversionFunnelWidget() {
  const top = CONVERSION_FUNNEL[0].value;
  const bottom = CONVERSION_FUNNEL[CONVERSION_FUNNEL.length - 1].value;
  const overall = Math.round((bottom / top) * 100);

  // Plot each stage as its share of the top of the funnel (page views), so the
  // radar's silhouette reads as the drop-off from view to ticket.
  const chartData = CONVERSION_FUNNEL.map((stage) => ({
    ...stage,
    share: Math.round((stage.value / top) * 100),
  }));

  const chartConfig = {
    share: { label: "Share of views", color: CHART_COLORS.primary },
  };

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Registration Funnel"
        subtitle="Share of page views reaching each step toward a ticket."
        action={
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-3xl font-bold leading-none text-white">{overall}%</span>
            <span className="mt-1 text-[11px] text-text-secondary">view → ticket</span>
          </div>
        }
      />
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-full max-h-[210px]">
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
                        {item.payload.value.toLocaleString()} · {item.payload.share}%
                      </span>
                    </span>
                  )}
                />
              }
            />
            <PolarGrid stroke="#2a2a2a" />
            <PolarAngleAxis dataKey="short" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
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
              isAnimationActive={true}
            />
          </RadarChart>
        </ChartContainer>
      </div>
    </WidgetShell>
  );
}

// --- Lifecycle gauge (radial text) -------------------------------------------

function GaugeWidget({ title, subtitle, value, caption, footnote }) {
  const clamped = Math.max(0, Math.min(100, value));
  // Sweep the colored arc clockwise from the top, proportional to the value.
  const endAngle = 90 - (clamped / 100) * 360;
  const data = [{ name: caption, value: clamped, fill: CHART_COLORS.primary }];

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader title={title} subtitle={subtitle} />
      <div className="mt-1 flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer
          config={{ value: { label: caption, color: CHART_COLORS.primary } }}
          className="mx-auto aspect-square h-full max-h-[190px]"
        >
          <RadialBarChart
            data={data}
            startAngle={90}
            endAngle={endAngle}
            innerRadius={72}
            outerRadius={104}
          >
            {/* Full-circle track behind the value arc */}
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              polarRadius={[78, 66]}
              className="first:fill-[#202020] last:fill-[#1a1a1a]"
            />
            <RadialBar dataKey="value" cornerRadius={8} isAnimationActive={true} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-white text-3xl font-bold"
                        >
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
      {footnote ? (
        <p className="mt-1 text-center text-xs text-text-secondary">{footnote}</p>
      ) : null}
    </WidgetShell>
  );
}

// --- Top performing events (table) -------------------------------------------

const TOP_EVENTS_SORT_OPTIONS = [
  { value: "revenue", label: "Revenue" },
  { value: "sellthrough", label: "Sell-through" },
];

function TopEventsTable() {
  const [sortBy, setSortBy] = useState("revenue");
  const sorted = [...TOP_EVENTS].sort((a, b) =>
    sortBy === "revenue"
      ? b.revenue - a.revenue
      : b.sold / b.capacity - a.sold / a.capacity,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <WidgetHeader
          title="Top Performing Events"
          subtitle="Ranked by sales momentum and sell-through."
        />
        <FilterDropdown
          value={sortBy}
          onValueChange={setSortBy}
          options={TOP_EVENTS_SORT_OPTIONS}
          height="h-9"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[180px]">Sell-through</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead>Momentum</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((event) => {
              const pct = Math.min(100, Math.round((event.sold / event.capacity) * 100));
              const meta = MOMENTUM_META[event.momentum] || MOMENTUM_META.track;
              const MomentumIcon = meta.icon;
              return (
                <TableRow key={event.name} className="border-border">
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-foreground">{event.name}</span>
                      <p className="text-xs text-text-secondary">
                        {event.sold.toLocaleString()} / {event.capacity.toLocaleString()} seats
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex min-w-[80px] justify-center rounded-md border px-2 py-0.5 text-[10px] font-medium",
                        EVENT_STATUS_META[event.status] || EVENT_STATUS_META.Draft,
                      )}
                    >
                      {event.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="w-[140px] space-y-1.5">
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                        <div
                          className="h-full rounded-full bg-[#ededed]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-text-secondary">{pct}%</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-white">
                    ${event.revenue.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.className)}>
                      <MomentumIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// --- General stats (flat list of key numbers) -------------------------------

function GeneralStatsCard() {
  const sorted = [...ATTENTION_ITEMS].sort(
    (a, b) => URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency),
  );
  const total = ATTENTION_ITEMS.length;

  return (
    <WidgetShell contentClassName="flex flex-col">
      <WidgetHeader
        title="Overall Stats"
        subtitle="A quick snapshot of key numbers across your events."
        action={
          <span className="shrink-0 rounded-md border border-border bg-surface-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {total} Legends
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
              className="group flex items-center gap-3.5 rounded-xl p-3.5 text-left transition-colors hover:bg-surface-card"
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
              <span className="shrink-0 text-xl font-bold tabular-nums text-white">{item.value}</span>
              <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-text-secondary transition-colors group-hover:text-foreground">
                <ChevronRight className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </WidgetShell>
  );
}

// --- Screen ------------------------------------------------------------------

export function EventsOverviewScreen() {
  return (
    <MainScreenWrapper>
      {/* Header: title + workspace summary stats */}
      <div className="mt-2">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex w-full items-center justify-center gap-3 text-center md:w-auto md:justify-start md:text-left">
              <h1 className="text-2xl font-bold text-white tracking-tight">Events Overview</h1>
              <span className="bg-surface-subtle text-text-secondary text-[9px] px-1.5 py-0.5 rounded border border-border font-mono tracking-widest shrink-0">
                WORKSPACE
              </span>
            </div>
            <p className="mt-1 text-center text-sm text-foreground0 md:text-left">
              Track registrations, ticket sales, check-ins, and revenue across all your events.
            </p>
          </div>
          <div className="w-full md:w-auto">
            <div className="flex w-full md:w-auto md:gap-0">
              {WORKSPACE_SUMMARY.map((stat, i) => {
                const last = i === WORKSPACE_SUMMARY.length - 1;
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
                    <span className="text-text-secondary text-[11px] uppercase tracking-wider font-medium">
                      {stat.label}
                    </span>

                    <RollingNumber
                      value={stat.value}
                      className="mt-0.5 text-2xl font-bold text-white"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Summary stats bar */}
      <StatsBar stats={STATS} />

      {/* Bento hero: wide trend + donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 h-[360px]">
          <RegistrationsTrendWidget />
        </div>
        <div className="h-[360px]">
          <TicketMixWidget />
        </div>
      </div>

      {/* Attendee lifecycle: funnel + two gauges (equal ratio) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-[300px]">
          <ConversionFunnelWidget />
        </div>
        <div className="h-[300px]">
          <GaugeWidget
            title="Sell-Through Rate"
            subtitle="Seats sold vs. capacity."
            value={SELL_THROUGH.value}
            caption="sold"
            footnote={`${SELL_THROUGH.sold.toLocaleString()} of ${SELL_THROUGH.capacity.toLocaleString()} seats`}
          />
        </div>
        <div className="h-[300px]">
          <GaugeWidget
            title="Attendance Rate"
            subtitle="Checked in vs. registered."
            value={ATTENDANCE.value}
            caption="checked in"
            footnote={`${ATTENDANCE.attended.toLocaleString()} of ${ATTENDANCE.registered.toLocaleString()} showed up`}
          />
        </div>
      </div>

      {/* Top performing events table */}
      <TopEventsTable />

      {/* General stats */}
      <GeneralStatsCard />
    </MainScreenWrapper>
  );
}

export default EventsOverviewScreen;
