"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchX } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { cn } from "@/lib/utils";
import { Button } from "@geiger/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@geiger/ui/accordion";
import { EmptyState, SearchInput } from "@/components/internal/shared/screen_kit";
import { GroupHeading, LegalFootnote, OUTLINE_BUTTON, RentLevel, ResourceList, StatusDot } from "./parts";
import { useJurisdictionResources } from "./use_jurisdiction_resources";
import {
  FEDERAL_DESCRIPTION,
  LIBRARY_TIERS,
  TOPIC_FILTERS,
  categoryKey,
  categoryLabel,
  isLocal,
  localityName,
  matchesTopic,
  plural,
  rentStatus,
} from "./constants";

// Library view: state, then topic, then sources, side by side ("deposits in California" in two clicks).

const COLUMN_LABEL = "text-[11px] font-medium uppercase tracking-[.06em] text-text-secondary";

function pickerClass(on) {
  return cn(
    "flex h-[34px] w-full items-center rounded-md text-left text-[13px] outline-none transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:bg-surface-hover",
    on ? "bg-surface-active font-medium text-foreground" : "text-muted-foreground",
  );
}

export function LibraryView({ states, federal, portfolio, selected, onSelect, loadResources, reviewedAt }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("all");
  const contentRef = useRef(null);
  const { rows, loading } = useJurisdictionResources(selected.code, loadResources);
  const status = rentStatus(selected);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (j) => !q || `${j.name} ${j.code}`.toLowerCase().includes(q);
    return [
      {
        key: "yours",
        label: "Your states",
        items: states
          .filter((j) => portfolio.has(j.code) && match(j))
          .sort((a, b) => portfolio.get(b.code) - portfolio.get(a.code))
          .map((j) => ({ j, sub: plural(portfolio.get(j.code), "property", "properties") })),
      },
      { key: "federal", label: "Federal", items: federal && match(federal) ? [{ j: federal, sub: "All states" }] : [] },
      { key: "all", label: "All states", items: states.filter((j) => !portfolio.has(j.code) && match(j)).map((j) => ({ j, sub: "" })) },
    ].filter((g) => g.items.length);
  }, [states, federal, portfolio, query]);

  const topics = useMemo(
    () =>
      TOPIC_FILTERS.map((t) => ({ ...t, count: rows.filter((r) => matchesTopic(r, t.value)).length })).filter(
        (t) => loading || t.count || t.value === "all" || t.value === topic,
      ),
    [rows, loading, topic],
  );

  const shown = useMemo(() => rows.filter((r) => matchesTopic(r, topic)), [rows, topic]);

  const tiers = useMemo(() => {
    const out = LIBRARY_TIERS.map((t) => ({
      key: t.key,
      label: t.label,
      desc: t.desc,
      rows: shown.filter((r) => !isLocal(r) && t.categories.includes(categoryKey(r.category))),
      tagOf: t.tagged ? (r) => categoryLabel(r.category) : undefined,
    })).filter((t) => t.rows.length);
    const local = shown.filter(isLocal).sort((a, b) => localityName(a).localeCompare(localityName(b)));
    if (local.length) {
      out.push({ key: "local", label: "City & County Programs", desc: "Local ordinances, rent boards and code enforcement", rows: local, tagOf: localityName });
    }
    return out;
  }, [shown]);

  // A newly picked state reads from its top.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [selected.code]);

  const topicLabel = (TOPIC_FILTERS.find((t) => t.value === topic) || TOPIC_FILTERS[0]).label.toLowerCase();

  return (
    <div className="grid overflow-hidden rounded-xl border border-border bg-surface-subtle lg:h-[calc(100dvh-17rem)] lg:min-h-[560px] lg:grid-cols-[220px_190px_minmax(0,1fr)] 2xl:grid-cols-[248px_216px_minmax(0,1fr)]">
      <div className="flex max-h-80 min-h-0 flex-col border-b border-border lg:max-h-none lg:border-b-0 lg:border-r">
        <div className="border-b border-border p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Find a state" />
        </div>
        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto p-2">
          {groups.length ? (
            groups.map((g) => (
              <div key={g.key}>
                <p className={cn(COLUMN_LABEL, "px-2.5 pb-1.5 pt-3")}>{g.label}</p>
                {g.items.map(({ j, sub }) => (
                  <button
                    key={j.code}
                    type="button"
                    aria-current={j.code === selected.code ? "true" : undefined}
                    onClick={() => onSelect(j.code)}
                    className={cn(pickerClass(j.code === selected.code), "gap-2.5 px-2.5")}
                  >
                    <StatusDot status={rentStatus(j)} />
                    <span className="min-w-0 flex-1 truncate">{j.name}</span>
                    {sub ? <span className="text-[11px] font-normal tabular-nums text-text-secondary">{sub}</span> : null}
                  </button>
                ))}
              </div>
            ))
          ) : (
            <p className="px-2.5 py-6 text-center text-xs text-text-secondary">No states match.</p>
          )}
        </div>
      </div>

      <div className="flex max-h-72 min-h-0 flex-col border-b border-border lg:max-h-none lg:border-b-0 lg:border-r">
        <div className={cn(COLUMN_LABEL, "flex h-[61px] shrink-0 items-center border-b border-border px-5")}>Topic</div>
        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto p-2">
          {topics.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-current={t.value === topic ? "true" : undefined}
              onClick={() => setTopic(t.value)}
              className={cn(pickerClass(t.value === topic), "gap-2 px-3", !loading && !t.count && t.value !== "all" && "opacity-40")}
            >
              <span className="flex-1">{t.label}</span>
              {loading ? null : <span className="text-xs font-normal tabular-nums text-text-tertiary">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div ref={contentRef} className="scrollbar-subtle min-h-0 overflow-y-auto bg-background">
        <div className="flex flex-col gap-5 px-5 pb-7 pt-6 sm:px-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-[22px] font-semibold tracking-[-.01em] text-foreground">{selected.name}</h2>
                {status ? <RentLevel status={status} /> : null}
              </div>
              <p className="mt-1.5 max-w-[620px] text-[13px] leading-normal text-muted-foreground">
                {status ? (selected.primaryLawCitation ? `Main law: ${selected.primaryLawCitation}` : "") : FEDERAL_DESCRIPTION}
              </p>
            </div>
            {loading ? null : (
              <span className="shrink-0 text-xs text-text-secondary sm:pt-1.5">
                {shown.length} of {plural(rows.length, "link", "links")}
              </span>
            )}
          </div>

          {selected.rentRegulationSummary ? (
            <div className="rounded-[10px] border border-border bg-surface-subtle px-4">
              <Accordion type="single" collapsible defaultValue="rent">
                <AccordionItem value="rent" className="border-b-0">
                  <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">Rent Regulation</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-pretty text-[13px] leading-relaxed text-muted-foreground">{selected.rentRegulationSummary}</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-16">
              <LogoLoading size={40} aria-label="Loading resources" />
            </div>
          ) : tiers.length ? (
            tiers.map((t) => (
              <section key={t.key} className="space-y-2">
                <GroupHeading label={t.label} count={t.rows.length} desc={t.desc} compact />
                <ResourceList rows={t.rows} tagOf={t.tagOf} compact />
              </section>
            ))
          ) : (
            <div className="rounded-[10px] border border-border bg-surface-subtle">
              <EmptyState
                icon={SearchX}
                title={rows.length ? `No ${topicLabel} sources here` : "No resources yet"}
                description={
                  rows.length ? "Try another topic, or Everything." : "No official links have been pinned for this jurisdiction yet."
                }
                action={
                  rows.length ? (
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setTopic("all")}>
                      Show Everything
                    </Button>
                  ) : null
                }
              />
            </div>
          )}

          <LegalFootnote>These are official sources, not legal advice. Links were last reviewed {reviewedAt}.</LegalFootnote>
        </div>
      </div>
    </div>
  );
}

export default LibraryView;
