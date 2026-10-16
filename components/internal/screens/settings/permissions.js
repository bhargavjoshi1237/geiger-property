import { LEGACY_CONTROL_KEYS, WORKSPACE_PERMISSIONS, tabPermissionKey } from "@/lib/rbac";
import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

// Permission catalog for Roles & Permissions: one `view.*` key per sidebar
// destination (grouped by nav section) plus the workspace control permissions
// from lib/rbac. Advisory UI gating only — it doesn't secure data.

// Child page title (and page key) → its section's permission key.
const PARENT_KEY = new Map();
const PARENT_KEY_BY_KEY = new Map();
for (const item of workspaceNav) {
  for (const sub of item.subItems || []) {
    PARENT_KEY.set(sub.title, tabPermissionKey(item.title));
    PARENT_KEY_BY_KEY.set(tabPermissionKey(sub.title), tabPermissionKey(item.title));
  }
}

// Section title a page sits under ("" for top-level pages).
export const sectionOfTitle = (title) =>
  workspaceNav.find((item) => item.subItems?.some((s) => s.title === title))?.title || "";

function buildCatalog() {
  const out = [];
  const seen = new Set();
  const push = (p) => {
    if (seen.has(p.key)) return;
    seen.add(p.key);
    out.push(p);
  };
  for (const item of workspaceNav) {
    if (item.subItems?.length) {
      push({ key: tabPermissionKey(item.title), label: `${item.title} section`, group: item.title });
      for (const sub of item.subItems) {
        push({ key: tabPermissionKey(sub.title), label: sub.title, group: item.title });
      }
    } else {
      push({ key: tabPermissionKey(item.title), label: item.title, group: "Pages" });
    }
  }
  for (const p of WORKSPACE_PERMISSIONS) push(p);
  return out;
}

export const PERMISSION_CATALOG = buildCatalog();

// Catalog grouped for the matrix: [{ group, permissions: [...] }] in nav order.
export const PERMISSION_GROUPS = PERMISSION_CATALOG.reduce((groups, p) => {
  const g = groups.find((x) => x.group === p.group);
  if (g) g.permissions.push(p);
  else groups.push({ group: p.group, permissions: [p] });
  return groups;
}, []);

export const ALL_KEYS = PERMISSION_CATALOG.map((p) => p.key);

// How roleAllows() treats keys a role never decided on: pages inherit their
// section, actions their `inherits` key. Roles saved before `known` existed only
// ever gated top-level nav and the legacy control keys.
const INHERITS = new Map(WORKSPACE_PERMISSIONS.filter((p) => p.inherits).map((p) => [p.key, p.inherits]));
export const PERMISSION_RESOLVER = {
  parentOf: (key) => PARENT_KEY_BY_KEY.get(key) || INHERITS.get(key) || null,
  legacyKnown: new Set([...workspaceNav.map((item) => tabPermissionKey(item.title)), ...LEGACY_CONTROL_KEYS]),
};

// View keys for whole nav sections and/or single pages (adds the parent section),
// plus any action keys.
function pages({ sections = [], titles = [], actions = [] }) {
  const keys = new Set();
  for (const s of sections) {
    keys.add(tabPermissionKey(s));
    const item = workspaceNav.find((x) => x.title === s);
    for (const sub of item?.subItems || []) keys.add(tabPermissionKey(sub.title));
  }
  for (const t of titles) {
    keys.add(tabPermissionKey(t));
    if (PARENT_KEY.has(t)) keys.add(PARENT_KEY.get(t));
  }
  for (const a of actions) keys.add(a);
  return [...keys].filter((k) => ALL_KEYS.includes(k));
}

const isRestricted = (k) => /billing|roles/.test(k);

// Seeded when no roles have been saved for the project yet. `known` records the
// catalog each role was decided against (see PERMISSION_RESOLVER).
export const DEFAULT_ROLES = [
  { id: "owner", name: "Owner", permissions: ALL_KEYS },
  { id: "manager", name: "Manager", permissions: ALL_KEYS.filter((k) => !isRestricted(k)) },
  {
    id: "leasing_agent",
    name: "Leasing agent",
    permissions: pages({
      sections: ["Marketing & Leads", "Leasing", "Communications"],
      titles: [
        "Overview",
        "Properties",
        "Units",
        "Tenants",
        "Document Library",
        "Templates",
        "E-signature",
        "Occupancy & Vacancy",
        "Leasing Report",
      ],
      actions: ["reports.export"],
    }),
  },
  {
    id: "maintenance_tech",
    name: "Maintenance tech",
    permissions: pages({
      sections: ["Maintenance"],
      titles: ["Overview", "Properties", "Units", "Vendors", "Inbox", "Maintenance Report", "Insurance Compliance"],
      actions: ["reports.export"],
    }),
  },
  {
    id: "accountant",
    name: "Accountant",
    permissions: pages({
      sections: ["Accounting", "Reports"],
      titles: ["Overview", "Tenants", "Owners", "Vendors", "Document Library"],
      actions: ["accounting.post", "accounting.void", "reports.export", "reports.schedule"],
    }),
  },
].map((r) => ({ ...r, known: ALL_KEYS }));
