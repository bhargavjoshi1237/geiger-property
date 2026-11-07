"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { MODULES_SETTING_KEY, isModuleOn, moduleHiddenTitles, moduleOfTitle } from "@/lib/modules";
import { getSetting } from "@/lib/supabase/settings";
import { useProject } from "@/context/project-context";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

// Active project's Settings → Modules state (lib/modules.js); without a provider (landing playground) every module is at its default.

export const MODULES_CHANGED_EVENT = "geiger:modules-changed";

// Tell the provider the switches changed (after saving Settings → Modules).
export const notifyModulesChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MODULES_CHANGED_EVENT));
};

const ModulesContext = createContext(null);

function modulesValue(settings, loading) {
  return {
    loading,
    settings,
    hidden: moduleHiddenTitles(workspaceNav, settings),
    isOn: (key) => isModuleOn(settings, key),
    moduleOf: (title) => moduleOfTitle(workspaceNav, title),
  };
}

const DEFAULTS = Object.freeze(modulesValue(null, false));

export function ModulesProvider({ children }) {
  const { project } = useProject();
  const projectId = project?.id || null;
  const [state, setState] = useState({ loadedFor: undefined, settings: null });

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    // null (read failed) and {} (never saved) both resolve to the defaults.
    const load = () => getSetting(MODULES_SETTING_KEY, {}).then((settings) => alive && setState({ loadedFor: projectId, settings }));
    load();
    window.addEventListener(MODULES_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(MODULES_CHANGED_EVENT, load);
    };
  }, [projectId]);

  const loading = Boolean(projectId) && state.loadedFor !== projectId;
  const value = useMemo(() => modulesValue(loading ? null : state.settings, loading), [state.settings, loading]);

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules() {
  return useContext(ModulesContext) ?? DEFAULTS;
}
