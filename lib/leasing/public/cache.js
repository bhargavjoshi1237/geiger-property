import "server-only";
import { unstable_cache } from "next/cache";

import { getPublicListing, getPublicProperty, getPublishedCriteria, getSiteByHandle, listPublicListings } from "./site";

// Cached public reads (LEAS-01): every read lives PUBLIC_REVALIDATE seconds and carries its site and project tags, so
// POST /api/leasing/public/revalidate (listing publish, lease-up, site edits) refreshes them at once.

export const PUBLIC_REVALIDATE = 60;
export const siteTag = (handle) => `leasing-site:${handle}`;
export const projectTag = (projectId) => `leasing-public:${projectId}`;

const cached = (fn, key, tags) => unstable_cache(fn, key, { tags, revalidate: PUBLIC_REVALIDATE })();
const tagsOf = (site) => [projectTag(site.projectId), siteTag(site.handle)];

export const cachedSite = (handle) => cached(() => getSiteByHandle(handle), ["leasing-site", handle], [siteTag(handle)]);

// Every live listing of the site; callers filter in memory.
export const cachedListings = (site) => cached(() => listPublicListings(site), ["leasing-listings", site.handle, site.projectId], tagsOf(site));

export const cachedListing = (site, slug) => cached(() => getPublicListing(site, slug), ["leasing-listing", site.handle, site.projectId, slug], tagsOf(site));

export const cachedProperty = (site, propertyId) =>
  cached(() => getPublicProperty(site, propertyId), ["leasing-property", site.handle, site.projectId, propertyId], tagsOf(site));

export const cachedCriteria = (site, propertyId = null) =>
  cached(() => getPublishedCriteria(site, propertyId), ["leasing-criteria", site.projectId, propertyId || "company"], tagsOf(site));
