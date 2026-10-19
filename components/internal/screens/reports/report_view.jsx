"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Download, FileBarChart, Printer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { Button } from "@geiger/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@geiger/ui/chart";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ListLoading,
  ScreenHeader,
  SearchInput,
  SectionCard,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useRbac } from "@/context/rbac-context";
import { defaultFilters, getReport, rangeFilterOf, runReport } from "@/lib/reports/catalog";
import { alignOf, cellText, cellValue, money } from "@/lib/reports/format";
import { CSV_BOM, csvSlug, sectionsCsv } from "@/lib/reports/csv";
import { isoLocal } from "@/lib/reports/periods";
import { loadReportSources } from "@/lib/reports/sources_client";
import {
  ChartLegendRow,
  MeterBar,
  PropertyFilter,
  RangeFilter,
  SERIES,
  StatementLines,
} from "./report_kit";
import { ReportPrint } from "./report_print";
import { ScheduleDialog } from "./schedule_dialog";

// A catalog-driven report screen (lib/reports/catalog.js): loads the report's
// sources once, recomputes on filter changes, and renders stats + sections with
// CSV export, print-to-PDF, and scheduling. `cells` overrides a column's cell
// renderer: { [sectionKey]: { [columnKey]: (row) => node } }.

const PAGE = 100;
const SERIES_COLORS = [SERIES.primary, SERIES.secondary];

// Fill "first option" select defaults once the sources are loaded.
function withDataDefaults(def, filters, data) {
  const next = { ...filters };
  for (const flt of def.filters || []) {
    if (!flt.key || next[flt.key]) continue;
    next[flt.key] = flt.options?.(data)?.[0]?.value || "all";
  }
  return next;
}

const matchesSearch = (section, row, q) =>
  section.columns.some(
    (c) => String(cellText(c, row)).toLowerCase().includes(q) || (c.sub && String(row[c.sub] || "").toLowerCase().includes(q)),
  );

function defaultCell(col, row, isTotal, first) {
  const v = cellValue(col, row);
  if (isTotal) {
    if (first) return <span className="font-semibold text-foreground">{row.label || v || "Totals"}</span>;
    if (v === undefined || v === null || v === "" || ["status", "meter"].includes(col.format)) return null;
    return <span className="font-semibold tabular-nums text-foreground">{cellText(col, row)}</span>;
  }
  if (col.format === "status") return v ? <StatusPill status={v} map={col.statusMap} /> : <span className="text-text-tertiary">—</span>;
  if (col.format === "meter") {
    return (
      <div className="flex min-w-32 items-center gap-3">
        <MeterBar value={v} />
        <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">{cellText(col, row)}</span>
      </div>
    );
  }
  if ((col.format === "money" || col.format === "money0") && (v === null || v === undefined || v === "")) {
    return <span className="text-text-tertiary">—</span>;
  }
  const text = cellText(col, row);
  const owed = col.tone === "owed" && Number(v) > 0;
  const negative = (col.format === "money" || col.format === "money0") && Number(v) < 0;
  const main = (
    <span className={cn(first ? "font-medium text-foreground" : "", owed || negative ? "text-red-600 dark:text-red-400" : "", text === "—" && "text-text-tertiary")}>
      {text}
    </span>
  );
  if (!col.sub) return main;
  return (
    <div className="flex flex-col gap-0.5">
      {main}
      {row[col.sub] ? <span className="text-xs text-text-secondary">{row[col.sub]}</span> : null}
    </div>
  );
}

function tableColumns(section, overrides = {}) {
  return section.columns.map((col, i) => {
    const align = alignOf(col);
    return {
      key: col.key,
      header: col.header,
      align,
      className: cn(
        align === "right" ? "text-right tabular-nums" : "",
        i === 0 ? "" : "text-text-secondary",
        ["date", "days"].includes(col.format) && "whitespace-nowrap",
      ),
      render: (row) => {
        const isTotal = row.__total === true;
        if (!isTotal && overrides[col.key]) return overrides[col.key](row);
        return defaultCell(col, row, isTotal, i === 0);
      },
    };
  });
}

function TableSection({ section, overrides, search, className }) {
  const [limit, setLimit] = useState(PAGE);
  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () => (section.searchable && q ? section.rows.filter((r) => matchesSearch(section, r, q)) : section.rows),
    [section, q],
  );
  const shown = rows.slice(0, limit);
  const data = section.totals && !q ? [...shown, { ...section.totals, __total: true, id: "__total" }] : shown;
  return (
    <SectionCard
      title={section.title}
      description={section.description || (rows.length > PAGE ? `${rows.length} rows` : undefined)}
      bodyPadding={false}
      className={className}
    >
      {rows.length ? (
        <>
          <div className="overflow-x-auto">
            <DataTable
              columns={tableColumns(section, overrides)}
              data={data}
              getRowKey={(r, i) => r.id ?? i}
              className="rounded-none border-0"
            />
          </div>
          {rows.length > limit ? (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-text-secondary">
              <span>
                Showing {limit} of {rows.length}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE * 5)} className="h-8 hover:bg-surface-hover">
                Show More
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={FileBarChart}
          title={q ? "No rows match your search" : section.emptyTitle || "No data"}
          description={q ? "Try a different search." : section.emptyDescription}
          className="py-12"
        />
      )}
    </SectionCard>
  );
}

function StatementSection({ section, className }) {
  const lines = section.rows.map((r) => ({
    label: r.label,
    value: money(r.amount),
    muted: r.muted,
  }));
  return (
    <SectionCard title={section.title} description={section.description} bodyPadding={false} className={className}>
      <StatementLines lines={lines} total={section.totals ? { label: section.totals.label, value: money(section.totals.amount) } : null} />
    </SectionCard>
  );
}

function ChartSection({ section, className }) {
  const { chart } = section;
  const config = Object.fromEntries(
    chart.series.map((s, i) => [s.key, { label: s.label, color: SERIES_COLORS[i % SERIES_COLORS.length].color }]),
  );
  const isMoney = section.columns.some((c) => c.key === chart.series[0].key && c.format?.startsWith("money"));
  return (
    <SectionCard
      title={section.title}
      description={section.description}
      className={className}
      action={
        chart.series.length > 1 ? (
          <ChartLegendRow items={chart.series.map((s, i) => ({ label: s.label, swatch: SERIES_COLORS[i % SERIES_COLORS.length].swatch }))} />
        ) : null
      }
    >
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <BarChart data={section.rows} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={chart.x} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={isMoney ? 64 : 32}
            allowDecimals={!chart.integer}
            tickFormatter={isMoney ? (v) => money(v).replace(/\.00$/, "") : undefined}
          />
          <ChartTooltip
            cursor={{ fill: "var(--color-surface-hover)" }}
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">{config[name]?.label || name}</span>
                    <span className="font-medium tabular-nums text-foreground">{isMoney ? money(value) : value}</span>
                  </div>
                )}
              />
            }
          />
          {chart.series.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={[4, 4, 0, 0]} maxBarSize={24} />
          ))}
        </BarChart>
      </ChartContainer>
    </SectionCard>
  );
}

function SectionBlock({ section, overrides, search, className }) {
  if (section.kind === "statement") return <StatementSection section={section} className={className} />;
  if (section.kind === "chart") return <ChartSection section={section} className={className} />;
  return <TableSection section={section} overrides={overrides} search={search} className={className} />;
}

// Pair consecutive "half" sections into two-column rows.
function layout(sections) {
  const out = [];
  for (const s of sections) {
    const last = out[out.length - 1];
    if (s.span === "half" && last?.half && last.items.length < 2) last.items.push(s);
    else out.push({ half: s.span === "half", items: [s] });
  }
  return out;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsvText(name, csv) {
  downloadText(`${csvSlug(name)}-${isoLocal(new Date())}.csv`, CSV_BOM + csv, "text/csv;charset=utf-8");
}

export function CatalogReport({ reportKey, icon: Icon = FileBarChart, cells = {} }) {
  const def = getReport(reportKey);
  const { can } = useRbac();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(() => defaultFilters(def, {}));
  const [search, setSearch] = useState("");
  const [printing, setPrinting] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadReportSources(def.sources).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [def.sources]);

  const resolved = useMemo(() => (data ? withDataDefaults(def, filters, data) : filters), [def, filters, data]);
  const result = useMemo(() => (data ? runReport(def, data, resolved) : null), [def, data, resolved]);
  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const rangeFilter = rangeFilterOf(def);
  const canExport = can("reports.export");
  const canSchedule = can("reports.schedule");
  const sections = result?.sections || [];
  const exportable = sections.filter((s) => s.columns?.length);
  const searchable = sections.some((s) => s.searchable);
  const endPrint = useCallback(() => setPrinting(false), []);

  const exportCsv = () => {
    const rows = exportable.reduce((n, s) => n + (s.rows?.length || 0), 0);
    if (!rows) {
      toast.error("Nothing to export yet.");
      return;
    }
    downloadCsvText([result.title, result.subtitle].filter(Boolean).join(" "), sectionsCsv(exportable));
    toast.success(`Exported ${rows} row${rows === 1 ? "" : "s"}`);
  };

  const ready = Boolean(result) && !result.empty;
  const selectFilters = (def.filters || []).filter((x) => x.type === "select");

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={def.title}
        description={def.description}
        actions={
          ready ? (
            <div className="flex flex-wrap items-center gap-2">
              {canSchedule ? (
                <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => setScheduleOpen(true)}>
                  <CalendarClock className="h-4 w-4" /> Schedule
                </Button>
              ) : null}
              {canExport ? (
                <>
                  <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => setPrinting(true)}>
                    <Printer className="h-4 w-4" /> Print / PDF
                  </Button>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={exportCsv}>
                    <Download className="h-4 w-4" /> Export CSV
                  </Button>
                </>
              ) : null}
            </div>
          ) : null
        }
      />
      {def.views?.length || rangeFilter || selectFilters.length ? (
        <Toolbar>
          <div className="flex flex-wrap items-center gap-2">
            {def.views?.length ? <FilterDropdown value={resolved.view} onValueChange={set("view")} options={def.views} height="h-9" /> : null}
            {rangeFilter ? (
              <RangeFilter
                mode={rangeFilter.mode}
                value={resolved}
                onChange={(range) => setFilters((f) => ({ ...f, ...range }))}
              />
            ) : null}
            {(def.filters || []).some((x) => x.type === "property") && data ? (
              <PropertyFilter properties={data.properties} value={resolved.propertyId || "all"} onChange={set("propertyId")} />
            ) : null}
            {data
              ? selectFilters.map((flt) => (
                  <FilterDropdown
                    key={flt.key}
                    value={resolved[flt.key]}
                    onValueChange={set(flt.key)}
                    options={flt.options(data)}
                    placeholder={flt.label}
                    height="h-9"
                  />
                ))
              : null}
          </div>
          {ready && searchable ? (
            <SearchInput value={search} onChange={setSearch} placeholder="Search rows…" className="sm:w-64" />
          ) : null}
        </Toolbar>
      ) : null}
      {!result ? (
        <ListLoading label={`Loading ${def.title.toLowerCase()}`} />
      ) : result.empty ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Icon} title={result.empty.title} description={result.empty.description} />
        </div>
      ) : (
        <>
          {result.stats.length ? <StatsBar stats={result.stats} /> : null}
          <p className="-mt-2 text-xs text-text-tertiary">
            {[result.subtitle, result.periodLabel].filter(Boolean).join(" · ")}
          </p>
          {layout(sections).map((group, gi) =>
            group.half ? (
              <div key={gi} className="grid gap-6 lg:grid-cols-2">
                {group.items.map((s) => (
                  <SectionBlock key={s.key} section={s} overrides={cells[s.key]} search={search} className={group.items.length === 1 ? "lg:col-span-2" : undefined} />
                ))}
              </div>
            ) : (
              <Fragment key={gi}>
                {group.items.map((s) => (
                  <SectionBlock key={s.key} section={s} overrides={cells[s.key]} search={search} />
                ))}
              </Fragment>
            ),
          )}
        </>
      )}
      {printing && result ? (
        <ReportPrint
          title={result.title}
          subtitle={result.subtitle}
          periodLabel={result.periodLabel}
          stats={result.stats}
          sections={exportable}
          onDone={endPrint}
        />
      ) : null}
      {scheduleOpen ? (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          report={def}
          filters={resolved}
          periodMode={rangeFilter?.mode}
        />
      ) : null}
    </MainScreenWrapper>
  );
}
