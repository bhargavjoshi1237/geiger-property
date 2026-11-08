import { getProjectSetting } from "@/lib/messaging/context";
import { forProjectOrAll } from "@/lib/supabase/scope";

// Settings → Modules: optional verticals stored as { [key]: boolean } in the `modules` setting (unsaved keys use defaultOn).
export const MODULES_SETTING_KEY = "modules";

// Nav entries, jobs, automation triggers and signal detectors name theirs with `module: "<key>"`; core has no module.
export const MODULES = [
  {
    key: "leasing",
    label: "Leasing & screening",
    description: "The leasing front office: marketing vacancies, working leads and screening applicants.",
    defaultOn: true,
  },
  {
    key: "commercial",
    label: "Commercial",
    description: "Commercial lease tools, starting with CAM reconciliation.",
    defaultOn: true,
  },
  {
    key: "affordable",
    label: "Affordable housing",
    description: "Housing voucher and HAP contract tools.",
    defaultOn: false,
  },
  {
    key: "regulation",
    label: "Rent regulation",
    description: "Rent rule tables and rent-increase caps for regulated units.",
    defaultOn: false,
  },
  {
    key: "associations",
    label: "Associations",
    description: "HOA and condo association management.",
    defaultOn: false,
  },
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

// Every module at its default — a stable value for the settings form.
export const MODULE_DEFAULTS = Object.freeze(Object.fromEntries(MODULES.map((m) => [m.key, m.defaultOn])));

export const getModule = (key) => BY_KEY.get(key) || null;

// Only catalogue keys are switchable; no key (core) or an unknown key is always on.
export const isSwitchable = (key) => BY_KEY.has(key);

// Is `key` on, given the stored `modules` setting value (null/undefined → defaults)?
export function isModuleOn(settings, key) {
  const mod = getModule(key);
  if (!mod) return true;
  const stored = settings && typeof settings === "object" ? settings[key] : undefined;
  return typeof stored === "boolean" ? stored : mod.defaultOn;
}

// Every module gating a nav title: its own `module` and its section's ([] for core pages).
export function modulesOfTitle(nav, title) {
  for (const item of nav || []) {
    if (item.title === title) return item.module ? [item.module] : [];
    const sub = item.subItems?.find((s) => s.title === title);
    if (sub) return [...new Set([sub.module, item.module].filter(Boolean))];
  }
  return [];
}

// The first module switched off among a title's modules, or null when the page is reachable.
export const offModuleOfTitle = (nav, settings, title) => modulesOfTitle(nav, title).find((key) => !isModuleOn(settings, key)) || null;

// Nav titles hidden by off modules (whole sections or single pages), for @geiger/ui applyNavVisibility.
export function moduleHiddenTitles(nav, settings) {
  const hidden = [];
  for (const item of nav || []) {
    if (!isModuleOn(settings, item.module)) {
      hidden.push(item.title);
      continue;
    }
    for (const sub of item.subItems || []) if (!isModuleOn(settings, sub.module)) hidden.push(sub.title);
  }
  return hidden;
}

// Page titles a module owns, in nav order (a module section lists its pages).
export function moduleNavTitles(nav, key) {
  const titles = [];
  for (const item of nav || []) {
    if (item.module === key) titles.push(...(item.subItems?.length ? item.subItems.map((s) => s.title) : [item.title]));
    else for (const sub of item.subItems || []) if (sub.module === key) titles.push(sub.title);
  }
  return titles;
}

// Server: is `key` on for one project? `admin` is any client pinned to the property schema.
export async function moduleEnabled(admin, projectId, key) {
  if (!isSwitchable(key)) return true;
  return isModuleOn(await getProjectSetting(admin, projectId, MODULES_SETTING_KEY), key);
}

const PAGE = 1000;

// Server: every project's `modules` setting (or one project's), paged → (projectId, key) => boolean; a failed read means defaults.
// Rows without a project are never read (PLAT-01b), so a project-less lookup answers the defaults.
export async function loadModuleCheck(admin, projectId = null) {
  let byProject = new Map();
  try {
    for (let from = 0; ; from += PAGE) {
      const q = forProjectOrAll(admin.from("settings").select("project_id, value").eq("key", MODULES_SETTING_KEY).is("deleted_at", null), projectId);
      const { data, error } = await q.order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const row of data || []) if (row.project_id) byProject.set(row.project_id, row.value);
      if (!data || data.length < PAGE) break;
    }
  } catch (e) {
    console.error("[modules.load]", e?.message || e);
    byProject = new Map();
  }
  return (pid, key) => isModuleOn(pid ? byProject.get(pid) : undefined, key);
}
