"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  WorkspaceUrlContext,
  DEFAULT_TAB,
  DEFAULT_SECTION,
} from "@/lib/hooks/use-workspace-url";
import { SANDBOX_PROJECT_ID } from "@/lib/sandbox/seed/ids";

// In-memory stand-in for the routed workspace URL, for the landing playground.
// Exposes exactly the useWorkspaceUrl() API, but the tab, open item/event and
// editor section live in React state, so screens open their detail views inside
// the embed without navigating the landing page. The project is pinned to the
// sandbox's sample project.

const INITIAL_STATE = {
  tab: DEFAULT_TAB,
  event: null,
  item: null,
  section: DEFAULT_SECTION,
  workflow: null,
  venue: null,
};

const STATE_KEYS = Object.keys(INITIAL_STATE);
const CLEARED = { event: null, item: null, section: null, workflow: null, venue: null };

export function PlaygroundWorkspaceUrlProvider({ children }) {
  const [state, setState] = useState(INITIAL_STATE);

  // Same patch semantics as the routed hook: `undefined` keeps the current
  // value, an explicit value (including null) replaces it.
  const apply = useCallback((next) => {
    setState((prev) => {
      const merged = { ...prev };
      for (const key of STATE_KEYS) {
        if (next[key] !== undefined) merged[key] = next[key];
      }
      return merged;
    });
  }, []);

  const value = useMemo(
    () => ({
      projectId: SANDBOX_PROJECT_ID,
      tab: state.tab || DEFAULT_TAB,
      eventId: state.event,
      itemId: state.item,
      section: state.section || DEFAULT_SECTION,
      workflowId: state.workflow,
      venueId: state.venue,
      // The playground has a single sample project — nothing to switch to.
      setProject: () => {},
      setTab: (tab) => apply({ tab, ...CLEARED }),
      openEvent: (id) => apply({ event: id, section: null }),
      openEventInTab: (id, tab) => apply({ tab, event: id, section: null }),
      closeEvent: () => apply({ event: null, section: null }),
      openItem: (id) => apply({ item: id, section: null }),
      closeItem: () => apply({ item: null, section: null }),
      openItemInTab: (id, tab) => apply({ tab, item: id, section: null }),
      setSection: (section) => apply({ section }),
      openWorkflow: (id) => apply({ workflow: id }),
      closeWorkflow: () => apply({ workflow: null }),
      openVenue: (id) => apply({ venue: id, section: null }),
      closeVenue: () => apply({ venue: null, section: null }),
    }),
    [state, apply],
  );

  return (
    <WorkspaceUrlContext.Provider value={value}>
      {children}
    </WorkspaceUrlContext.Provider>
  );
}

export default PlaygroundWorkspaceUrlProvider;
