"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Sunrise } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { DataTable, EmptyState, ListLoading, ScreenHeader, SearchInput, StatsBar, StatusPill, Toolbar } from "@/components/internal/shared/screen_kit";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useRbac } from "@/context/rbac-context";
import { runJobNow } from "@/lib/messaging/api";
import { money } from "@/lib/reports/format";
import { AREAS, ALL_AREAS, CATEGORIES, SIGNAL_STATUS_MAP, URGENCY } from "@/lib/signals/constants";
import { changesSince, moneyAtStake, rankSignals } from "@/lib/signals/rank";
import { listMemberBriefings } from "@/lib/supabase/briefings";
import { listProperties } from "@/lib/supabase/properties";
import { AREA_ICONS, ChangeChips, SignalSheet, formatImpact, isNew, isWorse, relativeTime, useNow, useSignalAreas, useSignals } from "./signal_kit";

// Briefing (ORCH-06) — every signal the rule detectors found for my role's areas: what changed, why it matters,
// how complete the data was, and what to do. Top ranks by money at stake with record-level signals folded under
// their summaries; All lists every signal. Signals come from the daily `signals` job (property.signals).

const VIEWS = [
  { value: "top", label: "Top" },
  { value: "all", label: "All signals" },
];

const STATUS_OPTIONS = [
  { value: "live", label: "Open & acknowledged" },
  ...Object.entries(SIGNAL_STATUS_MAP).map(([value, m]) => ({ value, label: m.label })),
  { value: "any", label: "Any status" },
];

const CATEGORY_OPTIONS = [{ value: "all", label: "All categories" }, ...Object.entries(CATEGORIES).map(([value, c]) => ({ value, label: c.label }))];

const matchStatus = (s, status) =>
  status === "any" ? true : status === "live" ? s.status === "open" || s.status === "acknowledged" : s.status === status;

export function BriefingScreen() {
  const areas = useSignalAreas();
  const { member } = useRbac();
  const now = useNow();
  const { signals, loading, reload, acknowledge, reopen } = useSignals();
  const [properties, setProperties] = useState([]);
  const [lastBriefing, setLastBriefing] = useState(null);
  const [view, setView] = useState("top");
  const [area, setArea] = useState("all");
  const [category, setCategory] = useState("all");
  const [propertyId, setPropertyId] = useState("all");
  const [status, setStatus] = useState("live");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let alive = true;
    listProperties().then((rows) => alive && setProperties(rows ?? []));
    return () => {
      alive = false;
    };
  }, []);

  const memberId = member?.id || null;
  useEffect(() => {
    if (!memberId) return undefined;
    let alive = true;
    listMemberBriefings(memberId).then((rows) => alive && setLastBriefing(rows?.[0] || null));
    return () => {
      alive = false;
    };
  }, [memberId]);

  const visibleAreas = areas || ALL_AREAS;
  const mine = useMemo(() => signals.filter((s) => visibleAreas.includes(s.area)), [signals, visibleAreas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = mine.filter(
      (s) =>
        matchStatus(s, status) &&
        (area === "all" || s.area === area) &&
        (category === "all" || s.category === category) &&
        (propertyId === "all" || s.propertyId === propertyId) &&
        (!q || `${s.title} ${s.why}`.toLowerCase().includes(q)),
    );
    const statuses = status === "any" ? Object.keys(SIGNAL_STATUS_MAP) : status === "live" ? ["open", "acknowledged"] : [status];
    return rankSignals(base, { collapse: view === "top", statuses });
  }, [mine, status, area, category, propertyId, search, view]);

  const stats = useMemo(() => {
    const live = rankSignals(mine);
    const day = changesSince(mine, new Date(now - 86400000).toISOString());
    return [
      { label: "Open signals", value: String(live.length), footer: `${live.filter((s) => s.urgency === "urgent").length} urgent` },
      { label: "Money at stake", value: money(moneyAtStake(mine)), footer: "Across the top list" },
      { label: "New today", value: String(day.new.length), footer: `${day.worse.length} got worse` },
      { label: "Resolved today", value: String(day.resolved.length), footer: "Cleared since yesterday" },
    ];
  }, [mine, now]);

  const areaOptions = [{ value: "all", label: "All areas" }, ...visibleAreas.map((a) => ({ value: a, label: AREAS[a].label }))];
  const propertyOptions = [{ value: "all", label: "All properties" }, ...properties.map((p) => ({ value: p.id, label: p.name || "Untitled property" }))];
  const selected = openId ? signals.find((s) => s.id === openId) || null : null;
  const filtersActive = area !== "all" || category !== "all" || propertyId !== "all" || status !== "live" || search;

  const runNow = async () => {
    setRunning(true);
    const res = await runJobNow("signals");
    setRunning(false);
    if (!res.ok || res.status === "failed") return toast.error(res.error || res.errors?.[0] || "Couldn't run the signals job.");
    toast.success(`Signals updated: ${res.created ?? 0} new, ${res.skipped ?? 0} resolved.`);
    reload();
  };

  const columns = [
    {
      key: "signal",
      header: "Signal",
      render: (s) => {
        const Icon = AREA_ICONS[s.area] || Sunrise;
        return (
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-foreground">{s.title}</span>
                {s.grain === "summary" ? <Badge variant="outline">Summary</Badge> : null}
                {isNew(s, now) ? <Badge variant="info">New</Badge> : isWorse(s, now) ? <Badge variant="danger">Worse</Badge> : null}
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-text-secondary">{s.why}</p>
            </div>
          </div>
        );
      },
    },
    { key: "area", header: "Area", className: "text-sm text-text-secondary", render: (s) => AREAS[s.area]?.label || s.area },
    { key: "category", header: "Kind", render: (s) => <Badge variant={CATEGORIES[s.category]?.variant || "neutral"}>{CATEGORIES[s.category]?.label || s.category}</Badge> },
    { key: "urgency", header: "Urgency", render: (s) => <StatusPill status={s.urgency} map={URGENCY} /> },
    { key: "impact", header: "Impact", align: "right", className: "text-right tabular-nums text-foreground", render: formatImpact },
    {
      key: "completeness",
      header: "Data",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (s) => <span title={s.completenessNote || "Every record had the data this rule needs"}>{Math.round((Number(s.completeness) || 0) * 100)}%</span>,
    },
    { key: "seen", header: "Last seen", align: "right", className: "text-right text-sm text-text-secondary", render: (s) => relativeTime(s.lastSeenAt, now) },
    { key: "status", header: "Status", render: (s) => <StatusPill status={s.status} map={SIGNAL_STATUS_MAP} /> },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Briefing"
        description="What changed, why it matters and what to do — every rule-based signal for your areas, ranked by money at stake. Refreshed daily; your morning briefing arrives in-app and by email."
        actions={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={running} onClick={runNow}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run Signals Now
          </Button>
        }
      />

      <StatsBar stats={stats} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <span>Last 24 hours</span>
          <ChangeChips signals={mine} />
          {lastBriefing ? (
            <span className="text-text-tertiary">
              Your last briefing: {lastBriefing.date}
              {lastBriefing.emailStatus && lastBriefing.emailStatus !== "not_sent" ? ` · email ${lastBriefing.emailStatus.replace(/_/g, " ")}` : ""}
            </span>
          ) : null}
          {areas ? <span className="text-text-tertiary">Showing {areas.map((a) => AREAS[a].label).join(", ")} for your role</span> : null}
        </div>
        <SegmentedTabs tabs={VIEWS} value={view} onChange={setView} />
      </div>

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown value={area} onValueChange={setArea} options={areaOptions} height="h-9" />
          <FilterDropdown value={category} onValueChange={setCategory} options={CATEGORY_OPTIONS} height="h-9" />
          <FilterDropdown value={propertyId} onValueChange={setPropertyId} options={propertyOptions} height="h-9" />
          <FilterDropdown value={status} onValueChange={setStatus} options={STATUS_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search signals…" />
      </Toolbar>

      {loading ? (
        <ListLoading label="Loading signals" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(s) => s.id}
          onRowClick={(s) => setOpenId(s.id)}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={Sunrise}
                title={mine.length ? "No signals match these filters" : "No signals yet"}
                description={
                  mine.length
                    ? "Try clearing the filters or switching to All signals."
                    : "Signals appear when the daily signals job runs. Run it now to check rent, leasing, maintenance and payables."
                }
                action={
                  mine.length && filtersActive ? (
                    <Button
                      variant="outline"
                      className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      onClick={() => {
                        setArea("all");
                        setCategory("all");
                        setPropertyId("all");
                        setStatus("live");
                        setSearch("");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : !mine.length ? (
                    <Button variant="outline" className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground" disabled={running} onClick={runNow}>
                      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Run Signals Now
                    </Button>
                  ) : null
                }
              />
            </div>
          }
        />
      )}

      <SignalSheet signal={selected} onClose={() => setOpenId(null)} onAcknowledge={acknowledge} onReopen={reopen} onActioned={reload} />
    </MainScreenWrapper>
  );
}

export default BriefingScreen;
