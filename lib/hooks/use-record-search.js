"use client";

import React from "react";
import { findNavItem } from "@/components/internal/sidebar/sidebar_nav";
import { useProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { searchRecords } from "@/lib/supabase/search";
import { SEARCH_DEBOUNCE_MS, recordItems, recordTypesFor, searchNeedle, withoutRecordIds } from "@/lib/search";

// Stable empties so the palette's memoised entry pool isn't rebuilt every render.
const NO_ITEMS = [];
const NOTHING_FOUND = { projectId: null, query: "", rows: [] };

const iconOf = (tab) => findNavItem(tab).icon;

// After the palette saves a pick to its recents, drop record entries: recents only resolve the pages in its pool.
function forgetRecordRecents(key) {
  try {
    const ids = JSON.parse(window.localStorage.getItem(key));
    if (Array.isArray(ids)) window.localStorage.setItem(key, JSON.stringify(withoutRecordIds(ids)));
  } catch {
    // Storage can be unavailable (private mode); recents are a nicety.
  }
}

// ⌘K record search: the palette's query, debounced, through property.search_records for the record types in the
// viewer's nav (modules on, view key held). Returns the palette entries and `reset` for when the palette opens.
export function useRecordSearch(visibleNav, { recentsKey }) {
  const { projectId } = useProject();
  const { openItemInTab } = useWorkspaceUrl();
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState(NOTHING_FOUND);
  const types = React.useMemo(() => recordTypesFor(visibleNav), [visibleNav]);
  const typesKey = types.join(",");
  const trimmed = query.trim();
  const searchable = Boolean(searchNeedle(trimmed));

  // @geiger/ui's CommandPalette has no query callback yet, so follow its input as the user types.
  React.useEffect(() => {
    const onInput = (event) => {
      const el = event.target;
      if (el instanceof HTMLInputElement && el.closest('[data-slot="command-palette"]')) setQuery(el.value);
    };
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, []);

  // Earlier hits stay up (the palette narrows them as you type) until this query's answer lands; a newer query drops it.
  React.useEffect(() => {
    if (!searchable || !projectId || !typesKey) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      searchRecords(trimmed, { projectId, types: typesKey.split(",") }).then((rows) => {
        if (alive && rows) setFound({ projectId, query: trimmed, rows });
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [trimmed, searchable, projectId, typesKey]);

  const onOpen = React.useCallback(
    (tab, id) => {
      forgetRecordRecents(recentsKey);
      openItemInTab(id, tab);
    },
    [recentsKey, openItemInTab],
  );

  const allItems = React.useMemo(() => {
    const allowed = new Set(types);
    return recordItems(found.rows.filter((row) => allowed.has(row.type)), { iconOf, onOpen, matched: found.query });
  }, [found, types, onOpen]);

  const reset = React.useCallback(() => {
    setQuery("");
    setFound(NOTHING_FOUND);
  }, []);

  const items = searchable && found.projectId === projectId && allItems.length ? allItems : NO_ITEMS;
  return { items, reset };
}
