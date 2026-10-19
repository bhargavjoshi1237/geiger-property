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

// Titles from the pre-2026-10 sidebar → the page that absorbed them, so old
// bookmarks and shared links still land somewhere sensible.
export const LEGACY_TABS = {
  "Buildings & Blocks": "Buildings",
  "Property Photos & Media": "Media Library",
  "Property Groups": "Portfolios",
  "Common Areas": "Amenities",
  "All Tenants": "Tenants",
  "Tenant Directory": "Tenants",
  "Tenant Profiles": "Tenants",
  "Household & Occupants": "Tenants",
  "Resident Portal": "Tenants",
  "Documents": "Document Library",
  "Addenda & Documents": "Document Library",
  "Shared Files": "Document Library",
  "Owner Documents": "Document Library",
  "Compliance Documents": "Document Library",
  "Lease Builder": "Leases",
  "Lease Templates": "Templates",
  "State-specific Leases": "Templates",
  "Move-in": "Move-ins & Move-outs",
  "Move-out": "Move-ins & Move-outs",
  "Move-out Pipeline": "Move-ins & Move-outs",
  "Move-in Inspection": "Inspections",
  "Rent Increases": "Renewals",
  "Lease Expirations": "Renewals",
  "Notices": "Notices & Violations",
  "All Maintenance": "Work Orders",
  "Maintenance Requests": "Work Orders",
  "Mobile Maintenance": "Work Orders",
  "Vendor Assignments": "Work Orders",
  "Photos & Attachments": "Work Orders",
  "Recurring Work Orders": "Preventive & Recurring",
  "Preventive Maintenance": "Preventive & Recurring",
  "Unit Turns & Make-ready": "Unit Turns",
  "Make-ready Boards": "Unit Turns",
  "Vacancy Listings": "Listings",
  "Online Applications": "Applications",
  "Tenant Screening": "Applications",
  "Showings & Tours": "Showings",
  "Owner Directory": "Owners",
  "Occupancy": "Occupancy & Vacancy",
  "Maintenance Reports": "Maintenance Report",
  "Leasing Reports": "Leasing Report",
  "AI": "AI Assistant",
};

// slug -> exact title. Real destinations (leaf top-levels + subs) win, then legacy
// titles, then group headers (which aren't screens themselves).
const SLUG_TO_TAB = (() => {
  const map = new Map();
  const add = (title, target = title) => {
    const slug = tabToSlug(title);
    if (!map.has(slug)) map.set(slug, target);
  };
  for (const item of workspaceNav) {
    if (!item.subItems?.length) add(item.title);
    for (const sub of item.subItems || []) add(sub.title);
  }
  for (const [oldTitle, newTitle] of Object.entries(LEGACY_TABS)) add(oldTitle, newTitle);
  for (const item of workspaceNav) if (item.subItems?.length) add(item.title);
  return map;
})();

export function slugToTab(slug) {
  if (!slug) return null;
  return SLUG_TO_TAB.get(String(slug).toLowerCase()) || null;
}
