"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useProject } from "@/context/project-context";
import { saveSetting } from "@/lib/supabase/settings";
import { ONBOARDING_SETTING_KEY, evaluateSteps, progressOf } from "./steps";
import { isClosed, normalizeState } from "./state";
import { loadOnboardingData, loadOnboardingSetting } from "./load";

// Checklist state + computed steps for the active project; shared by the Overview card and Settings → Setup & Go-live.

export const ONBOARDING_CHANGED_EVENT = "geiger:onboarding-changed";

// `lazy` skips the heavy data reads while the checklist is dismissed or live (the Overview card).
export function useOnboarding({ lazy = false } = {}) {
  const { project } = useProject();
  const projectId = project?.id || null;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState(null);
  const [data, setData] = useState(null);
  const [loadedFor, setLoadedFor] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    (async () => {
      const stored = await loadOnboardingSetting();
      if (!alive) return;
      const next = normalizeState(stored);
      const skip = lazy && (stored === null || isClosed(next));
      const loaded = skip ? null : await loadOnboardingData();
      if (!alive) return;
      setState(stored === null ? null : next);
      setData(loaded);
      setLoadedFor(projectId);
    })();
    return () => {
      alive = false;
    };
  }, [projectId, lazy, tick]);

  useEffect(() => {
    const reload = () => setTick((n) => n + 1);
    window.addEventListener(ONBOARDING_CHANGED_EVENT, reload);
    return () => window.removeEventListener(ONBOARDING_CHANGED_EVENT, reload);
  }, []);

  const results = useMemo(() => (state && data ? evaluateSteps(data, state) : []), [state, data]);
  const progress = useMemo(() => progressOf(results), [results]);

  // Apply a pure reducer from state.js to the freshly saved state, then tell every consumer to reload.
  const update = useCallback(async (reducer, message) => {
    const stored = await loadOnboardingSetting();
    const ok = stored !== null && (await saveSetting(ONBOARDING_SETTING_KEY, reducer(normalizeState(stored))));
    if (!ok) toast.error("Couldn't save your setup progress.");
    else {
      if (message) toast.success(message);
      window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT));
    }
    return ok;
  }, []);

  const loading = !projectId || loadedFor !== projectId;
  return { loading, unavailable: !loading && state === null, state, data, results, progress, closed: state ? isClosed(state) : false, update, reload: () => setTick((n) => n + 1) };
}
