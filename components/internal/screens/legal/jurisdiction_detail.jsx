"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, SearchX } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import {
  EmptyState,
  ListLoading,
  ScreenHeader,
  SearchInput,
  SectionCard,
} from "@/components/internal/shared/screen_kit";
import { FACT_LABEL, GHOST_BUTTON, GroupHeading, LegalFootnote, OUTLINE_BUTTON, RentLevel, ResourceList, TabLabel } from "./parts";
import { useJurisdictionResources } from "./use_jurisdiction_resources";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  FEDERAL_CODE,
  FEDERAL_DESCRIPTION,
  PREEMPTION_LABELS,
  categoryKey,
  categoryLabel,
  formatDate,
  isLocal,
  localityName,
  matchesText,
  plural,
  rentStatus,
} from "./constants";

// One jurisdiction: rent rules up top, then its official sources as dense rows grouped by type (or by city).

const GROUP_LIMIT = 4;
const LOCALITY_PREVIEW = 12;

function RentRegulationCard({ jurisdiction }) {
  const [showAll, setShowAll] = useState(false);
  const local = jurisdiction.localRentControl;
  const shown = showAll ? local : local.slice(0, LOCALITY_PREVIEW);
  const facts = [
    { label: "Statewide rent cap", value: jurisdiction.statewideRentCap ? "Yes" : "No" },
    { label: "Local rent control", value: PREEMPTION_LABELS[jurisdiction.rentControlPreempted] || PREEMPTION_LABELS.unknown },
    { label: "Local programs", value: local.length ? plural(local.length, "city or county", "cities & counties") : "None found" },
  ];
  return (
    <SectionCard
      title="Rent Regulation"
      description={`As reviewed ${formatDate(jurisdiction.lastReviewedAt)}. Confirm on the source before acting on it.`}
      action={
        jurisdiction.rentRegulationSourceUrl ? (
          <Button asChild size="sm" variant="outline" className={OUTLINE_BUTTON}>
            <a href={jurisdiction.rentRegulationSourceUrl} target="_blank" rel="noopener noreferrer">
              Source <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null
      }
    >
      <div className="grid divide-y divide-border rounded-lg border border-border bg-surface-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {facts.map((f) => (
          <div key={f.label} className="px-4 py-3">
            <p className={FACT_LABEL}>{f.label}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{f.value}</p>
          </div>
        ))}
      </div>
      {jurisdiction.rentRegulationSummary ? (
        <p className="mt-4 max-w-[760px] text-pretty text-sm leading-relaxed text-muted-foreground">
          {jurisdiction.rentRegulationSummary}
        </p>
      ) : null}
      {local.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-text-secondary">Local Rent Programs</span>
          {shown.map((name) => (
            <Badge key={name} variant="neutral" className="whitespace-normal text-left">
              {name}
            </Badge>
          ))}
          {local.length > LOCALITY_PREVIEW ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} className={`h-6 px-2 text-xs ${GHOST_BUTTON}`}>
              {showAll ? "Show Fewer" : `+${local.length - LOCALITY_PREVIEW} More`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}

export function JurisdictionDetail({ jurisdiction, owned, loadResources, onBack, topId }) {
  const { rows, loading } = useJurisdictionResources(jurisdiction.code, loadResources);
  const [view, setView] = useState("statewide");
  const [search, setSearch] = useState("");
  const isFederal = jurisdiction.code === FEDERAL_CODE;
  const status = rentStatus(jurisdiction);
  const q = search.trim().toLowerCase();

  const statewide = useMemo(() => rows.filter((r) => !isLocal(r)), [rows]);
  const local = useMemo(() => rows.filter(isLocal), [rows]);
  const activeView = view === "local" && local.length ? "local" : "statewide";

  // Statewide: one group per category with 2+ links, the singles folded into "More Official Help". Local: one per city.
  const groups = useMemo(() => {
    if (activeView === "local") {
      const by = new Map();
      for (const r of local.filter((r) => matchesText(r, q))) {
        const name = localityName(r);
        if (!by.has(name)) by.set(name, []);
        by.get(name).push(r);
      }
      return [...by.entries()]
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
        .map(([name, list]) => ({ key: `loc:${name}`, label: name, rows: list, tagOf: (r) => categoryLabel(r.category) }));
    }
    const by = new Map();
    for (const r of statewide.filter((r) => matchesText(r, q))) {
      const key = categoryKey(r.category);
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(r);
    }
    const out = [];
    const singles = [];
    for (const key of CATEGORY_ORDER) {
      const list = by.get(key);
      if (!list) continue;
      if (list.length > 1) out.push({ key, label: CATEGORY_LABELS[key].label, desc: CATEGORY_LABELS[key].desc, rows: list });
      else singles.push(list[0]);
    }
    if (singles.length) {
      out.push({
        key: "more",
        label: "More Official Help",
        desc: "One source each: legal aid, fair housing, complaints, HUD",
        rows: singles,
        tagOf: (r) => categoryLabel(r.category),
      });
    }
    return out;
  }, [activeView, statewide, local, q]);

  const viewTabs = [
    { value: "statewide", label: <TabLabel text={isFederal ? "Federal & National" : "Statewide"} count={statewide.length} /> },
    { value: "local", label: <TabLabel text="Cities & Counties" count={local.length} /> },
  ];

  return (
    <MainScreenWrapper id={topId} className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className={`-ml-2 ${GHOST_BUTTON}`}>
          <ArrowLeft className="h-4 w-4" /> All Jurisdictions
        </Button>
      </div>

      <ScreenHeader
        title={jurisdiction.name}
        description={
          isFederal
            ? FEDERAL_DESCRIPTION
            : jurisdiction.primaryLawCitation
              ? `Main law: ${jurisdiction.primaryLawCitation}`
              : "Official landlord-tenant sources for this state."
        }
        actions={
          status || owned ? (
            <dl className="flex divide-x divide-border rounded-lg border border-border bg-surface-subtle">
              {status ? (
                <div className="px-4 py-2.5">
                  <dt className={FACT_LABEL}>Rent Regulation</dt>
                  <dd className="mt-1.5 flex h-5 items-center">
                    <RentLevel status={status} size="md" />
                  </dd>
                </div>
              ) : null}
              {owned ? (
                <div className="px-4 py-2.5">
                  <dt className={FACT_LABEL}>Your Properties</dt>
                  <dd className="mt-1.5 flex h-5 items-center text-sm font-semibold tabular-nums text-foreground">{owned}</dd>
                </div>
              ) : null}
            </dl>
          ) : null
        }
      />

      {!isFederal ? <RentRegulationCard jurisdiction={jurisdiction} /> : null}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        {local.length ? (
          <SegmentedTabs tabs={viewTabs} value={activeView} onChange={setView} />
        ) : (
          <h2 className="text-base font-semibold text-foreground">
            {loading ? "Official Sources" : plural(rows.length, "Official Source", "Official Sources")}
          </h2>
        )}
        <SearchInput value={search} onChange={setSearch} placeholder="Search titles, publishers, citations" className="sm:w-72" />
      </div>

      {loading ? (
        <ListLoading label="Loading resources" />
      ) : !rows.length ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={SearchX} title="No resources yet" description="No official links have been pinned for this jurisdiction yet." />
        </div>
      ) : !groups.length ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={SearchX}
            title="Nothing matches that search"
            description="Try a statute number, an agency or a city."
            action={
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setSearch("")}>
                Clear Search
              </Button>
            }
          />
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-2.5">
            <GroupHeading label={g.label} count={g.rows.length} desc={g.desc} />
            <ResourceList rows={g.rows} tagOf={g.tagOf} limit={GROUP_LIMIT} expanded={Boolean(q)} />
          </section>
        ))
      )}

      <LegalFootnote>
        These are official sources, not legal advice. Laws change, so confirm details on the source and talk to a lawyer
        about specific situations.
      </LegalFootnote>
    </MainScreenWrapper>
  );
}

export default JurisdictionDetail;
