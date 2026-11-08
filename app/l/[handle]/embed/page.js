import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingGrid, NoListings } from "@/components/leasing_site/listing_card";
import { EhoMark } from "@/components/leasing_site/site_chrome";
import { cachedListings, cachedSite } from "@/lib/leasing/public/cache";
import { matchesListingFilters, parseListingFilters } from "@/lib/leasing/public/filters";
import { summarizeListing } from "@/lib/leasing/public/serialize";
import { sitePath } from "@/lib/leasing/public/urls";

// Chrome-less vacancy list for an <iframe> on a landlord's own website (LEAS-01). Same filters as the search page plus
// ?limit (1–24). next.config.mjs lets any site frame this path; listings open in a new tab.

export const metadata = {
  title: "Available homes",
  robots: { index: false, follow: true },
};

export default async function EmbedPage({ params, searchParams }) {
  const { handle } = await params;
  const site = await cachedSite(handle);
  if (!site) notFound();
  const query = await searchParams;
  const filters = parseListingFilters(query);
  const limit = Math.min(24, Math.max(1, Number.parseInt(String(query?.limit ?? ""), 10) || 12));
  const all = (await cachedListings(site)).filter((l) => matchesListingFilters(l, filters));
  const listings = all.slice(0, limit).map(summarizeListing);

  return (
    <main className="space-y-4 p-3">
      <h1 className="sr-only">Homes for rent from {site.displayName}</h1>
      {listings.length ? (
        <ListingGrid handle={handle} listings={listings} headingLevel="h2" target="_blank" />
      ) : (
        <NoListings>Check back soon — new homes are listed here first.</NoListings>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <EhoMark className="h-6 w-6" /> Equal Housing Opportunity
        </span>
        <Link href={sitePath(handle)} target="_blank" rel="noopener" className="inline-flex min-h-6 items-center font-medium text-foreground underline-offset-4 hover:underline">
          {all.length > listings.length ? `See all ${all.length} homes` : "See all homes"} at {site.displayName}
        </Link>
      </div>
    </main>
  );
}
