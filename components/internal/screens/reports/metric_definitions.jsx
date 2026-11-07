"use client";

import { useMemo, useState } from "react";
import { Sigma } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EmptyState, ScreenHeader, SearchInput, SectionCard, Toolbar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { METRICS } from "@/lib/metrics/index";
import { METRIC_AREAS } from "@/lib/metrics/catalog";
import { DETECTORS } from "@/lib/signals/detectors";
import { SIGNAL_DEFAULTS } from "@/lib/signals/config";
import { AREAS, CATEGORIES, URGENCY } from "@/lib/signals/constants";

// Metric Definitions (ORCH-03) — the semantic layer made visible: every number the Overview, reports,
// signals and impact pages show, with its formula and sources, generated from lib/metrics; plus how the
// rule detectors behind the Briefing work and how signals are scored.

const UNIT_LABEL = { money: "Dollars", percent: "Percent", count: "Count", days: "Days" };
const SOURCE_LABEL = {
  ledger: "General ledger",
  units: "Units",
  leases: "Leases",
  tenants: "Tenants",
  properties: "Properties",
  workOrders: "Work orders",
  renewals: "Renewals",
  bills: "Bills",
  unitTurns: "Unit turns",
  budgets: "Budgets",
  budgetLines: "Budget lines",
  deposits: "Security deposits",
  owners: "Owners",
};

const AREA_OPTIONS = [{ value: "all", label: "All areas" }, ...Object.entries(METRIC_AREAS).map(([value, label]) => ({ value, label }))];

function Fact({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      <div className="mt-0.5 text-sm text-text-secondary">{children}</div>
    </div>
  );
}

export function MetricDefinitionsScreen() {
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("all");

  const metrics = useMemo(() => {
    const q = search.trim().toLowerCase();
    return METRICS.filter((m) => (area === "all" || m.area === area) && (!q || `${m.label} ${m.description} ${m.formula}`.toLowerCase().includes(q)));
  }, [search, area]);

  const groups = Object.keys(METRIC_AREAS)
    .map((a) => ({ area: a, rows: metrics.filter((m) => m.area === a) }))
    .filter((g) => g.rows.length);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Metric Definitions"
        description="Every number Geiger shows comes from one named definition, so the Overview, reports, briefing signals and impact page always agree — and every figure opens the records behind it."
      />

      <Toolbar>
        <FilterDropdown value={area} onValueChange={setArea} options={AREA_OPTIONS} height="h-9" />
        <SearchInput value={search} onChange={setSearch} placeholder="Search metrics…" />
      </Toolbar>

      {groups.length ? (
        groups.map((g) => (
          <SectionCard key={g.area} title={METRIC_AREAS[g.area]} description={`${g.rows.length} metric${g.rows.length === 1 ? "" : "s"}`} bodyPadding={false}>
            <div className="divide-y divide-border">
              {g.rows.map((m) => (
                <div key={m.key} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">{m.label}</p>
                      <Badge variant="neutral">{UNIT_LABEL[m.unit] || m.unit}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-text-secondary">{m.description}</p>
                    <p className="mt-1 font-mono text-[11px] text-text-tertiary">{m.key}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Fact label="Formula">{m.formula}</Fact>
                    </div>
                    <Fact label="Sources">{m.sources.filter((s) => s !== "properties").map((s) => SOURCE_LABEL[s] || s).join(", ") || "Properties"}</Fact>
                    <Fact label="Counted per">
                      {m.grain} · by {m.dimensions.join(", ")}
                    </Fact>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ))
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Sigma} title="No metrics match" description="Try a different search or area." />
        </div>
      )}

      <SectionCard
        title="How briefing signals are scored"
        description="Signals are rule-based and certain: each comes from a detector you can read below. They rank by score."
      >
        <div className="space-y-4 text-sm text-text-secondary">
          <p>
            <span className="font-medium text-foreground">Score = impact × urgency weight × category weight.</span> Impact is the money at stake (a
            balance, lost rent, a bill); signals with no money attached use a nominal ${SIGNAL_DEFAULTS.nominal} so they still rank. Ties go to the
            oldest. Completeness is the share of records the rule could evaluate — records missing the data it needs are skipped and named.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Fact label="Urgency weights">
              {Object.entries(SIGNAL_DEFAULTS.urgencyWeights)
                .map(([k, w]) => `${URGENCY[k]?.label || k} × ${w}`)
                .join(" · ")}
            </Fact>
            <Fact label="Category weights">
              {Object.entries(SIGNAL_DEFAULTS.categoryWeights)
                .map(([k, w]) => `${CATEGORIES[k]?.label || k} × ${w}`)
                .join(" · ")}
            </Fact>
          </div>
          <p className="text-xs text-text-tertiary">Thresholds and weights are set per workspace in Automation Settings → Signal thresholds.</p>
        </div>
      </SectionCard>

      <SectionCard title="Detectors" description={`${DETECTORS.length} rules run every day by the signals job`} bodyPadding={false}>
        <div className="divide-y divide-border">
          {DETECTORS.map((d) => (
            <div key={d.key} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{d.label}</p>
                <p className="text-sm text-text-secondary">{d.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant="neutral">{AREAS[d.area]?.label || d.area}</Badge>
                <Badge variant={CATEGORIES[d.category]?.variant || "neutral"}>{CATEGORIES[d.category]?.label || d.category}</Badge>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </MainScreenWrapper>
  );
}

export default MetricDefinitionsScreen;
