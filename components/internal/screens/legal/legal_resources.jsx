"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BookMarked, Columns3, Landmark, List, Map as MapIcon } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { EmptyState, ListLoading, ScreenHeader } from "@/components/internal/shared/screen_kit";
import { listLegalJurisdictions, listLegalResourceIndex } from "@/lib/supabase/legal_resources";
import { listProperties } from "@/lib/supabase/properties";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { DirectoryView } from "./directory_view";
import { JurisdictionDetail } from "./jurisdiction_detail";
import { LibraryView } from "./library_view";
import { MapView } from "./map_view";
import { OUTLINE_BUTTON } from "./parts";
import { useResourceLoader } from "./use_jurisdiction_resources";
import { FEDERAL_CODE, formatDate, isLocal, resolveStateCode } from "./constants";

// Legal Resources — official landlord-tenant sources for every US state, DC and federal agencies
// (property.legal_jurisdictions + property.legal_resources). Links only; nothing here is legal advice.

const LEGAL_TOP_ID = "legal-resources-top";

const VIEWS = [
  { value: "directory", label: "Directory", icon: List },
  { value: "library", label: "Library", icon: Columns3 },
  { value: "map", label: "Map", icon: MapIcon },
];

const VIEW_DESCRIPTIONS = {
  directory:
    "Official landlord-tenant sources for every state: statutes, agency guides, court self-help and legal aid. Every link opens the original source.",
  library: "Pick a state, then a topic. Every link opens the original government, court or legal-aid page.",
  map: "Official landlord-tenant sources for every state. Pick a state on the map to preview its rent rules and where to start.",
};

export function LegalResourcesScreen() {
  const [jurisdictions, setJurisdictions] = useState([]);
  const [index, setIndex] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("directory");
  const [libraryCode, setLibraryCode] = useState(null);
  const [mapCode, setMapCode] = useState(null);
  const { itemId, openItem, closeItem } = useWorkspaceUrl();
  const loadResources = useResourceLoader();

  useEffect(() => {
    let alive = true;
    Promise.all([listLegalJurisdictions(), listLegalResourceIndex(), listProperties()]).then(([js, idx, props]) => {
      if (!alive) return;
      if (js === null || idx === null) toast.error("Couldn't load legal resources.");
      setJurisdictions(js ?? []);
      setIndex(idx ?? []);
      setProperties(props ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Switching between the index and a jurisdiction starts at the top, not mid-scroll.
  useEffect(() => {
    document.getElementById(LEGAL_TOP_ID)?.scrollIntoView({ block: "start" });
  }, [itemId]);

  const statsByCode = useMemo(() => {
    const by = {};
    for (const r of index) {
      const s = (by[r.jurisdictionCode] ||= { total: 0, local: 0 });
      s.total += 1;
      if (isLocal(r)) s.local += 1;
    }
    return by;
  }, [index]);

  // State code → number of this company's properties there.
  const portfolio = useMemo(() => {
    const counts = new Map();
    for (const p of properties) {
      const code = resolveStateCode(p.state, jurisdictions);
      if (code) counts.set(code, (counts.get(code) || 0) + 1);
    }
    return counts;
  }, [properties, jurisdictions]);

  const states = useMemo(
    () => jurisdictions.filter((j) => j.kind === "state").sort((a, b) => a.name.localeCompare(b.name)),
    [jurisdictions],
  );
  const federal = useMemo(() => jurisdictions.find((j) => j.code === FEDERAL_CODE) || null, [jurisdictions]);

  const footnote = useMemo(() => {
    const reviewed = formatDate(federal?.lastReviewedAt || states[0]?.lastReviewedAt);
    const verified = index.filter((r) => r.verification === "verified").length;
    return {
      reviewed,
      full: `These are official sources, not legal advice. Links were last reviewed ${reviewed}, and ${verified.toLocaleString()} of ${index.length.toLocaleString()} were independently re-checked.`,
    };
  }, [federal, states, index]);

  const open = jurisdictions.find((j) => j.code === itemId);
  if (open) {
    return (
      <JurisdictionDetail
        key={open.code}
        jurisdiction={open}
        owned={portfolio.get(open.code) || 0}
        loadResources={loadResources}
        onBack={closeItem}
        topId={LEGAL_TOP_ID}
      />
    );
  }

  // Library and map preview start on the state with the most properties, else federal (it applies everywhere).
  const byCode = (code) => jurisdictions.find((j) => j.code === code);
  const topState = [...portfolio.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const fallback = byCode(topState) || federal || states[0];
  const librarySelected = byCode(libraryCode) || fallback;
  const mapSelected = (mapCode && byCode(mapCode)) || states.find((j) => j.code === topState) || states[0];

  return (
    <MainScreenWrapper id={LEGAL_TOP_ID}>
      <ScreenHeader
        title="Legal Resources"
        description={VIEW_DESCRIPTIONS[view]}
        actions={
          <>
            <SegmentedTabs tabs={VIEWS} value={view} onChange={setView} />
            {federal ? (
              <Button
                variant="outline"
                className={OUTLINE_BUTTON}
                onClick={() => (view === "library" ? setLibraryCode(FEDERAL_CODE) : openItem(FEDERAL_CODE))}
              >
                <Landmark className="h-4 w-4" /> Federal Resources
              </Button>
            ) : null}
          </>
        }
      />

      {loading ? (
        <ListLoading label="Loading legal resources" />
      ) : !states.length ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={BookMarked}
            title="No legal resources yet"
            description="The official landlord-tenant links haven't been loaded for this workspace yet."
          />
        </div>
      ) : view === "library" ? (
        <LibraryView
          states={states}
          federal={federal}
          portfolio={portfolio}
          selected={librarySelected}
          onSelect={setLibraryCode}
          loadResources={loadResources}
          reviewedAt={footnote.reviewed}
        />
      ) : view === "map" ? (
        <MapView
          states={states}
          federal={federal}
          portfolio={portfolio}
          statsByCode={statsByCode}
          selected={mapSelected}
          onSelect={setMapCode}
          onOpen={openItem}
          loadResources={loadResources}
          footnote={footnote.full}
        />
      ) : (
        <DirectoryView states={states} portfolio={portfolio} statsByCode={statsByCode} onOpen={openItem} footnote={footnote.full} />
      )}
    </MainScreenWrapper>
  );
}

export default LegalResourcesScreen;
