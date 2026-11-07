import { getProjectSetting } from "@/lib/messaging/context";

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

// The module a nav title belongs to: its own `module`, else its section's; null for core pages.
export function moduleOfTitle(nav, title) {
  for (const item of nav || []) {
    if (item.title === title) return item.module || null;
    const sub = item.subItems?.find((s) => s.title === title);
    if (sub) return sub.module || item.module || null;
  }
  return null;
}

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

// Server: read every project's `modules` setting once → (projectId, key) => boolean, for cross-project passes.
// A failed read falls back to the defaults.
export async function loadModuleCheck(admin) {
  const byProject = new Map();
  try {
    const { data, error } = await admin.from("settings").select("project_id, value").eq("key", MODULES_SETTING_KEY).is("deleted_at", null);
    if (error) console.error("[modules.load]", error.message);
    for (const row of data || []) byProject.set(row.project_id || null, row.value);
  } catch (e) {
    console.error("[modules.load]", e);
  }
  return (projectId, key) => isModuleOn(byProject.get(projectId || null), key);
}
