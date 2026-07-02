"use client";

import { useCallback } from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
} from "next/navigation";
import { tabToSlug, slugToTab } from "@/lib/workspace/tabs";

// Persistent workspace navigation, mirrored to the URL so a refresh (or a shared
// link) lands the user on the exact same place — the active project, sidebar
// tab, the open event, and the editor section. Matches the suite pattern
// (Geiger Flow): the project and tab live in the PATH, the transient
// per-event/workflow selection stays in the query string.
//
// Schema:  /project/<uuid>/<tabSlug>?event=evt_123&section=tickets
//   - <uuid>    → active project (public.projects). Scopes all data.
//   - <tabSlug> → sidebar tab, lowercased with no spaces/caps
//                 ("All Events" → "allevents"). The default tab (Overview) is
//                 omitted, so a bare /project/<uuid> is the Overview.
//   - event     → id of the open event in All Events. None ⇒ omitted.
//   - section   → editor section inside an event. Default "overview" ⇒ omitted.
//   - workflow  → the open workflow in the Workflows area.
//
// Components reading this hook must sit under a <Suspense> boundary (required by
// `useSearchParams`); the project shell provides one.
export const DEFAULT_TAB = "Overview";
export const DEFAULT_SECTION = "overview";

export function useWorkspaceUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = params?.projectId || null;
  // The catch-all segment after the project id ([[...rest]]); rest[0] is the tab.
  const rest = params?.rest;
  const tabSlug = Array.isArray(rest) ? rest[0] : rest || null;
  const tab = (tabSlug && slugToTab(tabSlug)) || DEFAULT_TAB;

  const eventId = searchParams.get("event") || null;
  const section = searchParams.get("section") || DEFAULT_SECTION;
  // The open workflow in the Workflows area (mirrors `event` for All Events).
  const workflowId = searchParams.get("workflow") || null;
  // The open venue in the Venues area (mirrors `event` for All Events).
  const venueId = searchParams.get("venue") || null;

  // Build the next URL from a partial patch. For each key: `undefined` keeps the
  // current value; an explicit value (incl. null) replaces it. Defaults and
  // empties drop from the URL so it stays clean.
  const buildUrl = useCallback(
    (next) => {
      const pid = next.project !== undefined ? next.project : projectId;
      if (!pid) return pathname; // no active project — nothing to navigate to
      const nextTab = next.tab !== undefined ? next.tab : tab;
      const slug =
        nextTab && nextTab !== DEFAULT_TAB ? tabToSlug(nextTab) : "";
      let path = `/project/${pid}`;
      if (slug) path += `/${slug}`;

      const qp = new URLSearchParams();
      const ev = next.event !== undefined ? next.event : eventId;
      const sec = next.section !== undefined ? next.section : section;
      const wf = next.workflow !== undefined ? next.workflow : workflowId;
      const vn = next.venue !== undefined ? next.venue : venueId;
      if (ev) qp.set("event", ev);
      if (vn) qp.set("venue", vn);
      if (sec && sec !== DEFAULT_SECTION) qp.set("section", sec);
      if (wf) qp.set("workflow", wf);

      const qs = qp.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [projectId, tab, eventId, section, workflowId, venueId, pathname],
  );

  const apply = useCallback(
    (next) => router.push(buildUrl(next), { scroll: false }),
    [router, buildUrl],
  );

  // Switching the active project resets any open event/section/workflow/venue
  // (their ids belong to the previous project); the sidebar tab is kept.
  const setProject = useCallback(
    (id) =>
      apply({
        project: id,
        event: null,
        section: null,
        workflow: null,
        venue: null,
      }),
    [apply],
  );
  // Switching workspace tabs exits any open event/section/workflow/venue.
  const setTab = useCallback(
    (next) =>
      apply({
        tab: next,
        event: null,
        section: null,
        workflow: null,
        venue: null,
      }),
    [apply],
  );
  // Opening an event keeps the tab but resets to its default section.
  const openEvent = useCallback(
    (id) => apply({ event: id, section: null }),
    [apply],
  );
  // Switch to another tab and open an event there in one navigation — used when
  // a different screen (e.g. Templates) hands off to the event editor.
  const openEventInTab = useCallback(
    (id, nextTab) => apply({ tab: nextTab, event: id, section: null }),
    [apply],
  );
  const closeEvent = useCallback(
    () => apply({ event: null, section: null }),
    [apply],
  );
  const setSection = useCallback((next) => apply({ section: next }), [apply]);

  // Open / close a workflow in the Workflows area (mirrors openEvent/closeEvent).
  const openWorkflow = useCallback((id) => apply({ workflow: id }), [apply]);
  const closeWorkflow = useCallback(() => apply({ workflow: null }), [apply]);

  // Open / close a venue in the Venues area. Opening resets to its default
  // section (mirrors openEvent).
  const openVenue = useCallback(
    (id) => apply({ venue: id, section: null }),
    [apply],
  );
  const closeVenue = useCallback(
    () => apply({ venue: null, section: null }),
    [apply],
  );

  return {
    projectId,
    tab,
    eventId,
    section,
    workflowId,
    venueId,
    setProject,
    setTab,
    openEvent,
    openEventInTab,
    closeEvent,
    setSection,
    openWorkflow,
    closeWorkflow,
    openVenue,
    closeVenue,
  };
}
