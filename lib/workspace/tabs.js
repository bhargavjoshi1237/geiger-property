import { workspaceNav } from "@/components/internal/sidebar/sidebar_nav";

// Workspace tab <-> URL slug mapping. The active tab lives in the path
// (/project/<id>/<slug>), so it must be a small, lowercase, no-caps token with
// no spaces or punctuation. e.g. "All Events" -> "allevents",
// "Dietary & Accessibility" -> "dietaryaccessibility". Reverse lookup resolves a
// path slug back to its exact sidebar title (the registry keys on titles).

export function tabToSlug(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// slug -> exact title, built once from every nav destination (top-level + subs).
const SLUG_TO_TAB = (() => {
  const map = new Map();
  for (const item of workspaceNav) {
    if (item.title) {
      const slug = tabToSlug(item.title);
      if (!map.has(slug)) map.set(slug, item.title);
    }
    for (const sub of item.subItems || []) {
      const slug = tabToSlug(sub.title);
      if (!map.has(slug)) map.set(slug, sub.title);
    }
  }
  return map;
})();

export function slugToTab(slug) {
  if (!slug) return null;
  return SLUG_TO_TAB.get(String(slug).toLowerCase()) || null;
}
