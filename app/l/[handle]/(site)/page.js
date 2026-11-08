import { notFound } from "next/navigation";

import { ListingGrid, NoListings } from "@/components/leasing_site/listing_card";
import { SearchFilters } from "@/components/leasing_site/search_filters";
import { PAGE_WIDTH } from "@/components/leasing_site/site_chrome";
import { cachedListings, cachedSite } from "@/lib/leasing/public/cache";
import { filtersToQuery, hasFilters, matchesListingFilters, parseListingFilters } from "@/lib/leasing/public/filters";
import { summarizeListing } from "@/lib/leasing/public/serialize";
import { absoluteUrl, sitePath } from "@/lib/leasing/public/urls";
import { money } from "@/lib/leasing/public/format";

// Vacancy search (LEAS-01): server-rendered on every request because the filters live in the search params; the
// listing reads themselves are cached (lib/leasing/public/cache.js).

export async function generateMetadata({ params }) {
  const { handle } = await params;
  const site = await cachedSite(handle);
  if (!site) return {};
  const count = (await cachedListings(site)).length;
  return {
    title: { absolute: `Homes for rent · ${site.displayName}` },
    description: `${count} ${count === 1 ? "home" : "homes"} for rent from ${site.displayName}. See photos, rent and every fee, then book a tour or apply.`,
    alternates: { canonical: absoluteUrl(sitePath(handle)) },
  };
}

export default async function VacancySearchPage({ params, searchParams }) {
  const { handle } = await params;
  const site = await cachedSite(handle);
  if (!site) notFound();
  const filters = parseListingFilters(await searchParams);
  const all = await cachedListings(site);
  const listings = all.filter((l) => matchesListingFilters(l, filters));
  const properties = [...new Map(all.filter((l) => l.property.id).map((l) => [l.property.id, { id: l.property.id, name: l.property.name }])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const rents = all.map((l) => l.rent).filter((r) => r > 0);
  const filtered = hasFilters(filters);

  return (
    <div className={`${PAGE_WIDTH} space-y-6 py-8 sm:py-10`}>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Homes for rent</h1>
        <p className="text-sm text-muted-foreground">
          {all.length
            ? `${all.length} ${all.length === 1 ? "home" : "homes"} available from ${site.displayName}${rents.length ? ` · from ${money(Math.min(...rents))}/mo` : ""}`
            : `${site.displayName} has no homes available right now.`}
        </p>
      </div>
      {all.length ? <SearchFilters key={filtersToQuery(filters)} path={sitePath(handle)} filters={filters} properties={properties} /> : null}
      <section aria-labelledby="results" className="space-y-4">
        <h2 id="results" className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {filtered ? `${listings.length} of ${all.length} homes match` : `${listings.length} ${listings.length === 1 ? "home" : "homes"}`}
        </h2>
        {listings.length ? (
          <ListingGrid handle={handle} listings={listings.map(summarizeListing)} />
        ) : (
          <NoListings title={filtered ? "No homes match these filters" : "No homes available right now"}>
            {filtered ? "Try fewer filters, or check back soon." : "Check back soon — new homes are listed here first."}
          </NoListings>
        )}
      </section>
    </div>
  );
}
