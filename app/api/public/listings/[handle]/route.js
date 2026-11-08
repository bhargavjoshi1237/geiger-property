import { cachedListings, cachedSite, PUBLIC_REVALIDATE } from "@/lib/leasing/public/cache";
import { matchesListingFilters, parseListingFilters } from "@/lib/leasing/public/filters";
import { serializePublicSite } from "@/lib/leasing/public/serialize";
import { absoluteUrl, listingPath } from "@/lib/leasing/public/urls";

// GET — a site's live vacancies as JSON for landlords' own websites (LEAS-01). Open to any origin; same filters as the
// search page (?property, beds, maxRent, moveInBy, pets). Enabled sites only, public-safe fields only, cached.

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": `public, s-maxage=${PUBLIC_REVALIDATE}, stale-while-revalidate=300`,
};

export async function GET(request, { params }) {
  const { handle } = await params;
  const site = await cachedSite(handle);
  if (!site) return Response.json({ ok: false, error: "No leasing site at this address." }, { status: 404, headers });
  const filters = parseListingFilters(new URL(request.url).searchParams);
  const listings = (await cachedListings(site))
    .filter((l) => matchesListingFilters(l, filters))
    .map((l) => ({ ...l, url: absoluteUrl(listingPath(site.handle, l.slug)) }));
  return Response.json({ ok: true, site: serializePublicSite(site), listings, generatedAt: new Date().toISOString() }, { headers });
}
