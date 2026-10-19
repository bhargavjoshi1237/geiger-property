"use client";

import { useMemo, useState } from "react";
import { ChevronRight, SearchX } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { EmptyState, SearchInput } from "@/components/internal/shared/screen_kit";
import { LegalFootnote, OUTLINE_BUTTON, OwnedMarker, RentLevel, RentLevelMark, TabLabel } from "./parts";
import { RENT_STATUS_MAP, plural, rentStatus } from "./constants";

// Index view: the states you operate in first, then every state grouped by how rent is regulated there.

// One state in the directory: rent-status code chip, name, your properties, link and local-program counts.
function StateTile({ jurisdiction: j, status, owned, links, onOpen }) {
  const local = j.localRentControl.length;
  return (
    <button
      type="button"
      onClick={() => onOpen(j.code)}
      className="group flex w-full items-center gap-3 rounded-lg border border-border bg-surface-card px-3 py-2.5 text-left outline-none transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border"
    >
      <Badge
        variant={RENT_STATUS_MAP[status].variant}
        className={cn("size-9 shrink-0 rounded-md p-0 font-mono text-xs font-semibold", status === "unconfirmed" && "border-dashed")}
      >
        {j.code}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{j.name}</span>
          {owned ? <OwnedMarker count={owned} /> : null}
        </div>
        <p className="mt-0.5 truncate text-xs tabular-nums text-text-secondary">
          {plural(links, "link", "links")}
          {local ? <span className="text-text-tertiary"> · {plural(local, "local program", "local programs")}</span> : null}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
}

export function DirectoryView({ states, portfolio, statsByCode, onOpen, footnote }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const yourStates = useMemo(
    () => states.filter((j) => portfolio.has(j.code)).sort((a, b) => portfolio.get(b.code) - portfolio.get(a.code)),
    [states, portfolio],
  );
  const propertyTotal = useMemo(() => [...portfolio.values()].reduce((a, b) => a + b, 0), [portfolio]);

  const statusTabs = useMemo(() => {
    const counts = {};
    for (const j of states) counts[rentStatus(j)] = (counts[rentStatus(j)] || 0) + 1;
    return [
      { value: "all", label: <TabLabel text="All" count={states.length} /> },
      ...Object.entries(RENT_STATUS_MAP).map(([value, m]) => ({
        value,
        label: <TabLabel text={m.short} count={counts[value] || 0} />,
      })),
    ];
  }, [states]);

  // One group per rent status, strongest regulation first, holding the states that match the search.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(RENT_STATUS_MAP)
      .filter(([key]) => status === "all" || status === key)
      .map(([key, meta]) => ({
        key,
        meta,
        states: states.filter((j) => rentStatus(j) === key && (!q || `${j.name} ${j.code}`.toLowerCase().includes(q))),
      }))
      .filter((g) => g.states.length);
  }, [states, search, status]);

  return (
    <>
      {yourStates.length ? (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-semibold text-foreground">Where You Operate</h2>
            <span className="text-xs text-text-secondary">
              {plural(propertyTotal, "property", "properties")} across {plural(yourStates.length, "state", "states")}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
            <div className="-mt-px">
              {yourStates.map((j) => {
                const s = statsByCode[j.code] || { total: 0, local: 0 };
                return (
                  <button
                    key={j.code}
                    type="button"
                    onClick={() => onOpen(j.code)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-5 border-t border-border px-5 py-3.5 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover md:grid-cols-[minmax(0,1fr)_190px_96px_150px_16px]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">{j.name}</span>
                        <span className="text-xs text-text-tertiary">{j.code}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">{j.primaryLawCitation.split(";")[0] || "—"}</p>
                    </div>
                    <div>
                      <RentLevel status={rentStatus(j)} hint={false} />
                    </div>
                    <span className="hidden text-[13px] text-muted-foreground md:block">
                      {plural(portfolio.get(j.code), "property", "properties")}
                    </span>
                    <span className="hidden text-right text-[13px] tabular-nums text-muted-foreground md:block">
                      {s.total} links <span className="text-text-tertiary">{s.local ? `· ${s.local} local` : "· statewide"}</span>
                    </span>
                    <ChevronRight className="size-4 text-text-tertiary" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">All Jurisdictions</h2>
        {/* Filters and search share one row; the search drops below, right-aligned, when the row runs out of room. */}
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs tabs={statusTabs} value={status} onChange={setStatus} buttonClassName="px-2.5" />
          <SearchInput value={search} onChange={setSearch} placeholder="Search states" className="w-full sm:ml-auto sm:w-48" />
        </div>
        {groups.length ? (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-subtle">
            {groups.map((g) => (
              <div key={g.key} className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <div className="flex shrink-0 items-center gap-2">
                    <RentLevelMark status={g.key} />
                    <h3 className="text-sm font-semibold text-foreground">{g.meta.label}</h3>
                    <span className="text-xs tabular-nums text-text-tertiary">{g.states.length}</span>
                  </div>
                  <p className="text-xs text-text-secondary sm:text-right">{g.meta.desc}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {g.states.map((j) => (
                    <StateTile
                      key={j.code}
                      jurisdiction={j}
                      status={g.key}
                      owned={portfolio.get(j.code) || 0}
                      links={statsByCode[j.code]?.total || 0}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={SearchX}
              title="No states match"
              description="Try another name or rent rule."
              action={
                <Button
                  variant="outline"
                  className={OUTLINE_BUTTON}
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                >
                  Clear Filters
                </Button>
              }
            />
          </div>
        )}
        <LegalFootnote className="pt-1">{footnote}</LegalFootnote>
      </section>
    </>
  );
}

export default DirectoryView;
