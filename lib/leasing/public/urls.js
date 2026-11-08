// Addresses on the public leasing site (LEAS-01). Paths are basePath-relative (for <Link>); absoluteUrl() adds the
// origin and basePath for canonical links, JSON-LD, sitemaps and the JSON feed. Custom domains (later) map onto these.

export const sitePath = (handle) => `/l/${handle}`;
export const listingPath = (handle, slug) => `/l/${handle}/${slug}`;
export const propertyPath = (handle, propertyId) => `/l/${handle}/p/${propertyId}`;
export const embedPath = (handle) => `/l/${handle}/embed`;
export const sitemapPath = (handle) => `/l/${handle}/sitemap.xml`;

const basePath = () => process.env.NEXT_PUBLIC_BASE_PATH || "";

// The public origin: NEXT_PUBLIC_APP_URL's origin, else the suite domain.
export function siteOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
  } catch {
    return "https://geiger.studio";
  }
}

export const absoluteUrl = (path, origin = siteOrigin()) => `${String(origin).replace(/\/$/, "")}${basePath()}${path}`;
