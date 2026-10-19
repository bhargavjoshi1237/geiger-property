"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Landmark } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Button } from "@geiger/ui/button";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { LegalFootnote, OUTLINE_BUTTON, OwnedMarker, RentLevel, RentTileMap, TabLabel } from "./parts";
import { useJurisdictionResources } from "./use_jurisdiction_resources";
import { CATEGORY_LABELS, RENT_STATUS_MAP, START_WITH, isLocal, plural, rentStatus } from "./constants";

// Rent map view: a grayscale tile map of rent regulation with a preview of the selected state beside it.

const LENS_TABS = [
  { value: "all", label: <TabLabel text="All" /> },
  ...Object.entries(RENT_STATUS_MAP).map(([value, m]) => ({ value, label: <TabLabel text={m.short} swatch={value} /> })),
];

export function MapView({ states, federal, portfolio, statsByCode, selected, onSelect, onOpen, loadResources, footnote }) {
  const [lens, setLens] = useState("all");
  const { rows, loading } = useJurisdictionResources(selected.code, loadResources);
  const status = rentStatus(selected);
  const owned = portfolio.get(selected.code) || 0;
  const localCount = selected.localRentControl.length;

  const starters = useMemo(
    () => START_WITH.map((c) => rows.find((r) => !isLocal(r) && r.category === c)).filter(Boolean),
    [rows],
  );

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
          <SegmentedTabs tabs={LENS_TABS} value={lens} onChange={setLens} />
          <span className="text-xs text-text-secondary">Stronger fill means more rent regulation</span>
        </div>
        <div className="grid xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5 px-4 py-6 sm:px-6">
            <div className="flex flex-1 items-center justify-center">
              <RentTileMap states={states} portfolio={portfolio} selected={selected.code} lens={lens} onSelect={onSelect} />
            </div>
            {portfolio.size ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="size-[5px] rounded-full bg-foreground" /> Where you have properties
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4 border-t border-border bg-surface-card p-5 xl:border-l xl:border-t-0">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold tracking-[-.01em] text-foreground">{selected.name}</h2>
                {owned ? <OwnedMarker count={owned} /> : null}
              </div>
              {status ? <RentLevel status={status} size="md" className="mt-2.5" /> : null}
            </div>
            <p className="line-clamp-6 text-pretty text-[13px] leading-relaxed text-muted-foreground">
              {selected.rentRegulationSummary || "No rent-regulation summary was confirmed for this state."}
            </p>
            <dl className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Official Links</dt>
                <dd className="tabular-nums text-foreground">{statsByCode[selected.code]?.total || 0}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Local Programs</dt>
                <dd className="tabular-nums text-foreground">
                  {localCount ? plural(localCount, "locality", "localities") : "None found"}
                </dd>
              </div>
            </dl>
            {loading ? (
              <div className="flex justify-center py-6">
                <LogoLoading size={32} aria-label="Loading resources" />
              </div>
            ) : starters.length ? (
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[.06em] text-text-secondary">Start with</p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="-mt-px">
                    {starters.map((r) => (
                      <a
                        key={r.id}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-2.5 border-t border-border py-2 pl-3 pr-2.5 outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-text-secondary">{CATEGORY_LABELS[r.category].label}</p>
                          <p className="truncate text-[13px] font-medium text-foreground">{r.title}</p>
                        </div>
                        <ArrowUpRight className="size-3.5 text-text-tertiary transition-colors group-hover:text-foreground" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex-1" />
            <Button className="w-full" onClick={() => onOpen(selected.code)}>
              Open {selected.name} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {federal ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
          <Landmark className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Federal Rules Apply in Every State</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              HUD, CFPB, FTC, EPA and DOJ pages plus national legal-aid finders · {statsByCode[federal.code]?.total || 0} links
            </p>
          </div>
          <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => onOpen(federal.code)}>
            Open Federal Sources
          </Button>
        </div>
      ) : null}

      <LegalFootnote className="-mt-4">{footnote}</LegalFootnote>
    </>
  );
}

export default MapView;
