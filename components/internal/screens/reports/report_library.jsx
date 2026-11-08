"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Briefcase,
  CalendarClock,
  Calculator,
  FileBarChart,
  KeyRound,
  Landmark,
  LayoutGrid,
  Library,
  Receipt,
  ShieldCheck,
  Star,
  Wallet,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@geiger/ui/button";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EmptyState, ScreenHeader, SearchInput, Toolbar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { findNavItem } from "@/components/internal/sidebar/sidebar_nav";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { LIBRARY_TITLE, REPORTS, REPORT_CATEGORIES, favoritesKey, rangeFilterOf, reportsByCategory, searchReports, viewableReports } from "@/lib/reports/catalog";
import { getSetting, saveSetting } from "@/lib/supabase/settings";
import { CatalogReport } from "./report_view";

// Report Library (CORE-41): every catalog report in one place, grouped by category, with keyword search and per-user
// favorites (setting report_favorites:<userId>). Opening a card keeps the report in the URL (?item=<key>) with a back link;
// the original reports keep their sidebar entries, new ones appear only here.

const CATEGORY_ICONS = {
  Financial: FileBarChart,
  Receivables: Wallet,
  Payables: Receipt,
  "Owners & trust": Briefcase,
  Banking: Landmark,
  "Leasing & occupancy": KeyRound,
  Maintenance: Wrench,
  Compliance: ShieldCheck,
  Tax: Calculator,
  Custom: LayoutGrid,
};

const OUTLINE = "border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground";

// Each report's sidebar icon when it has an entry, else its category's.
const REPORT_ICONS = Object.fromEntries(
  REPORTS.map((def) => {
    const nav = findNavItem(def.title);
    return [def.key, (nav.title === def.title && nav.icon) || CATEGORY_ICONS[def.category] || FileBarChart];
  }),
);

function periodHint(def) {
  const range = rangeFilterOf(def);
  const views = def.views?.length ? ` · ${def.views.length} views` : "";
  return `${range ? (range.mode === "asOf" ? "As of a date" : "Date range") : "Current"}${views}`;
}

function ReportCard({ def, favorite, favoritesReady, onOpen, onToggleFavorite }) {
  const Icon = REPORT_ICONS[def.key] || FileBarChart;
  return (
    <div className="relative flex flex-col rounded-xl border border-border bg-surface-subtle p-5 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={favorite ? `Remove ${def.title} from favorites` : `Add ${def.title} to favorites`}
          aria-pressed={favorite}
          disabled={!favoritesReady}
          onClick={() => onToggleFavorite(def.key)}
          className={cn(
            "relative z-10 -mr-1.5 -mt-1.5 hover:bg-surface-active",
            favorite ? "text-amber-500 hover:text-amber-500 dark:text-amber-400" : "text-text-tertiary hover:text-foreground",
          )}
        >
          <Star className={cn("h-4 w-4", favorite && "fill-current")} />
        </Button>
      </div>
      <button
        type="button"
        onClick={() => onOpen(def.key)}
        className="mt-4 text-left text-base font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
      >
        {def.title}
      </button>
      <p className="mt-1 line-clamp-2 flex-1 text-sm text-text-secondary">{def.description}</p>
      <p className="mt-4 border-t border-border pt-3 text-xs text-text-tertiary">{periodHint(def)}</p>
    </div>
  );
}

function CardGrid({ reports, favorites, favoritesReady, onOpen, onToggleFavorite }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {reports.map((def) => (
        <ReportCard
          key={def.key}
          def={def}
          favorite={favorites.includes(def.key)}
          favoritesReady={favoritesReady}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {title} <span className="font-medium normal-case tracking-normal">· {count}</span>
      </h2>
      {children}
    </section>
  );
}

export function ReportLibraryScreen() {
  const { canView, userId } = useRbac();
  const { itemId, openItem, closeItem, setTab } = useWorkspaceUrl();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [favorites, setFavorites] = useState({ userId: null, keys: [] });

  const reports = useMemo(() => viewableReports(canView), [canView]);
  const known = useMemo(() => new Set(reports.map((r) => r.key)), [reports]);

  // Favorites are per user; without a signed-in user (the playground) they last for the visit only.
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    getSetting(favoritesKey(userId), []).then((value) => {
      if (alive) setFavorites({ userId, keys: Array.isArray(value) ? value.filter((k) => typeof k === "string") : [] });
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const favoritesReady = !userId || favorites.userId === userId;
  const favoriteKeys = favorites.keys.filter((k) => known.has(k));

  const toggleFavorite = async (key) => {
    const before = favorites.keys;
    const keys = before.includes(key) ? before.filter((k) => k !== key) : [...before, key];
    setFavorites((f) => ({ ...f, keys }));
    if (!userId) return;
    if (!(await saveSetting(favoritesKey(userId), keys))) {
      setFavorites((f) => ({ ...f, keys: before }));
      toast.error("Couldn't save your favorites.");
    }
  };

  const categoryOptions = useMemo(
    () => [{ value: "all", label: "All categories" }, ...REPORT_CATEGORIES.filter((c) => reports.some((r) => r.category === c)).map((c) => ({ value: c, label: c }))],
    [reports],
  );

  const filtered = useMemo(() => searchReports(reports.filter((r) => category === "all" || r.category === category), search), [reports, category, search]);
  const groups = useMemo(() => reportsByCategory(filtered), [filtered]);
  const starred = useMemo(() => favoriteKeys.map((k) => filtered.find((r) => r.key === k)).filter(Boolean), [favoriteKeys, filtered]);

  const open = itemId ? reports.find((r) => r.key === itemId) : null;
  if (open) {
    return <CatalogReport key={open.key} reportKey={open.key} icon={REPORT_ICONS[open.key]} back={{ label: LIBRARY_TITLE, onClick: closeItem }} />;
  }

  const cards = { favorites: favoriteKeys, favoritesReady, onOpen: openItem, onToggleFavorite: toggleFavorite };
  const clearFilters = () => {
    setSearch("");
    setCategory("all");
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={LIBRARY_TITLE}
        description="Every report in one place. Search by name or keyword, and star the ones you use most to keep them at the top."
        actions={
          canView("Scheduled Reports") ? (
            <Button variant="outline" className={OUTLINE} onClick={() => setTab("Scheduled Reports")}>
              <CalendarClock className="h-4 w-4" /> Scheduled reports
            </Button>
          ) : null
        }
      />

      <Toolbar>
        <FilterDropdown value={category} onValueChange={setCategory} options={categoryOptions} height="h-9" />
        <SearchInput value={search} onChange={setSearch} placeholder="Search reports…" />
      </Toolbar>

      {!reports.length ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={Library} title="No reports for your role" description="Ask an admin for access to the reports you need." />
        </div>
      ) : groups.length ? (
        <>
          {starred.length ? (
            <Section title="Favorites" count={starred.length}>
              <CardGrid reports={starred} {...cards} />
            </Section>
          ) : null}
          {groups.map((g) => (
            <Section key={g.category} title={g.category} count={g.reports.length}>
              <CardGrid reports={g.reports} {...cards} />
            </Section>
          ))}
        </>
      ) : (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Library}
            title="No reports match your filters"
            description="Try another keyword or clear the filters."
            action={
              <Button variant="outline" className={OUTLINE} onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default ReportLibraryScreen;
